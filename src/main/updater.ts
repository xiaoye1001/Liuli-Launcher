import { app, BrowserWindow, shell } from 'electron'
import { download } from '@xmcl/file-transfer'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { chmod, copyFile, mkdir, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getGameStatus } from './launch'
import { getInstallStatus } from './install'
import { downloadDispatcher } from './network'
import type { UpdateDownload, UpdateInfo } from '../shared/types'

const REPO = 'xiaoye1001/Liuli-Launcher'
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
const TIMEOUT = 10000

interface GithubRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  assets?: { name?: string; size?: number; browser_download_url?: string; digest?: string }[]
}

/** 最近一次检查到的下载地址（打开链接时只使用这里记录的地址） */
let lastLinks: { page: string; asset: string } | null = null
/** 最近一次检查到的、适合本机的安装包（自动更新只下载这里记录的文件） */
let lastAsset: { version: string; name: string; url: string; size: number; sha256: string } | null = null

/** 版本号比较：1.2.10 > 1.2.9；忽略开头的 v 和 - 之后的预发布标记 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/** 从发布的文件中挑出适合本机的安装包 */
export function pickAsset(
  names: string[],
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  portable = !!process.env.PORTABLE_EXECUTABLE_DIR
): string | undefined {
  const find = (re: RegExp): string | undefined => names.find((n) => re.test(n))
  if (platform === 'win32') return portable ? find(/Portable.*\.exe$/i) : find(/Setup.*\.exe$/i)
  if (platform === 'darwin') return find(arch === 'arm64' ? /-arm64\.dmg$/i : /-x64\.dmg$/i) ?? find(/\.dmg$/i)
  if (platform === 'linux') return find(/\.AppImage$/i)
  return undefined
}

/** 只允许打开 GitHub 上的地址 */
function isGithubUrl(url: string | undefined): url is string {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'github.com' || hostname.endsWith('.github.com'))
  } catch {
    return false
  }
}

/** 查询 GitHub 上的最新正式版 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  let release: GithubRelease
  try {
    const response = await fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `LiuliLauncher/${__APP_VERSION__}` },
      signal: controller.signal
    })
    if (response.status === 404) throw new Error('还没有发布过正式版本')
    if (response.status === 403 || response.status === 429) throw new Error('检查太频繁，请稍后再试')
    if (!response.ok) throw new Error(`GitHub 返回错误（${response.status}）`)
    release = (await response.json()) as GithubRelease
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('连接 GitHub 超时，请检查网络')
    if (e instanceof TypeError) throw new Error('无法连接 GitHub，请检查网络')
    throw e
  } finally {
    clearTimeout(timer)
  }

  const current = __APP_VERSION__
  const latest = (release.tag_name ?? '').replace(/^v/i, '')
  if (!latest) throw new Error('无法读取最新版本信息')
  const assets = (release.assets ?? []).filter((a) => a.name && isGithubUrl(a.browser_download_url))
  const assetName = pickAsset(assets.map((a) => a.name!)) ?? ''
  const asset = assets.find((a) => a.name === assetName)
  const page = isGithubUrl(release.html_url) ? release.html_url : `https://github.com/${REPO}/releases/latest`
  lastLinks = { page, asset: asset?.browser_download_url ?? page }
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(asset?.digest ?? '')?.[1]?.toLowerCase() ?? ''
  lastAsset = asset
    ? { version: latest, name: assetName, url: asset.browser_download_url!, size: asset.size ?? 0, sha256 }
    : null
  return {
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    name: (release.name ?? '').slice(0, 100) || `v${latest}`,
    notes: (release.body ?? '').slice(0, 20000),
    publishedAt: release.published_at ?? '',
    assetName,
    assetSize: asset?.size ?? 0,
    autoUpdate: !!asset && updateMode() !== null
  }
}

/** 在浏览器中打开下载地址或发布页面 */
export async function openUpdateLink(kind: 'asset' | 'page'): Promise<void> {
  const url = kind === 'asset' ? lastLinks?.asset : lastLinks?.page
  await shell.openExternal(url ?? `https://github.com/${REPO}/releases/latest`)
}

// ---------- 自动更新：下载、校验、替换并重启 ----------

type UpdateMode = 'portable' | 'nsis' | 'appimage' | 'mac'

/** 当前运行方式能用的更新方式；开发版本或无法识别时为 null（只能打开下载页面） */
function updateMode(): UpdateMode | null {
  if (!app.isPackaged) return null
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'nsis'
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'appimage' : null
  if (process.platform === 'darwin') return process.execPath.includes('.app/Contents/MacOS/') ? 'mac' : null
  return null
}

const UPDATES_DIR = join(app.getPath('userData'), 'updates')

let download_: UpdateDownload = { state: 'idle', version: '', progress: 0, total: 0, speed: 0 }
let downloadController: AbortController | null = null
let downloadedFile = ''

function setDownload(next: Partial<UpdateDownload>): void {
  download_ = { ...download_, ...next }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:download', download_)
}

export function getUpdateDownload(): UpdateDownload {
  return download_
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** 检查下载好的文件：有 SHA-256 时校验哈希，否则至少检查大小 */
async function verify(path: string, asset: NonNullable<typeof lastAsset>): Promise<void> {
  const info = await stat(path)
  if (asset.size && info.size !== asset.size) throw new Error('下载的文件大小不对，可能没有下载完整')
  if (asset.sha256 && (await sha256Of(path)) !== asset.sha256) {
    throw new Error('下载的文件校验失败（SHA-256 不一致），已删除，请重试')
  }
}

/** 下载最近一次检查到的新版本安装包，进度通过 update:download 推送 */
export async function downloadUpdate(): Promise<void> {
  const asset = lastAsset
  if (!asset) throw new Error('请先检查更新')
  if (!updateMode()) throw new Error('当前版本不支持自动更新，请打开发布页面下载')
  if (download_.state === 'downloading') return
  if (download_.state === 'ready' && download_.version === asset.version) return
  await mkdir(UPDATES_DIR, { recursive: true })
  const destination = join(UPDATES_DIR, asset.name)
  const controller = new AbortController()
  downloadController = controller
  setDownload({
    state: 'downloading',
    version: asset.version,
    progress: 0,
    total: asset.size,
    speed: 0,
    error: undefined
  })
  let last = { time: Date.now(), bytes: 0 }
  let current = 0
  const timer = setInterval(() => {
    const now = Date.now()
    const speed = ((current - last.bytes) * 1000) / Math.max(1, now - last.time)
    last = { time: now, bytes: current }
    setDownload({ progress: current, speed: download_.speed === 0 ? speed : download_.speed * 0.6 + speed * 0.4 })
  }, 500)
  try {
    await download({
      url: asset.url,
      destination,
      dispatcher: downloadDispatcher(),
      headers: { 'User-Agent': `LiuliLauncher/${__APP_VERSION__}` },
      abortSignal: controller.signal,
      progressController: (_url, _chunk, written, total) => {
        current = written
        if (total > 0 && total !== download_.total) download_.total = total
      }
    })
    await verify(destination, asset).catch(async (e) => {
      await rm(destination, { force: true })
      throw e
    })
    downloadedFile = destination
    setDownload({ state: 'ready', progress: download_.total, speed: 0 })
  } catch (e) {
    const cancelled = controller.signal.aborted
    setDownload({
      state: cancelled ? 'idle' : 'failed',
      speed: 0,
      error: cancelled ? undefined : e instanceof Error ? e.message : String(e)
    })
    if (!cancelled) throw e
  } finally {
    clearInterval(timer)
    downloadController = null
  }
}

export function cancelUpdateDownload(): void {
  downloadController?.abort()
}

/** PowerShell 单引号字符串 */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** sh 单引号字符串 */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 后台运行更新脚本：启动器退出后它继续运行 */
function runDetached(command: string, args: string[]): void {
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

/**
 * 安装下载好的新版本：替换当前程序后重新打开启动器。
 * - 免安装版（Windows）：脚本等启动器退出后用新 exe 覆盖旧 exe，再打开
 * - 安装版（Windows）：静默运行新版本安装程序，安装完自动打开
 * - AppImage（Linux）：直接替换文件后重新打开
 * - macOS：脚本等启动器退出后从 dmg 复制新的 .app 覆盖旧的，再打开；失败时打开 dmg 让用户手动拖入
 */
export async function installUpdate(): Promise<void> {
  const mode = updateMode()
  if (!mode) throw new Error('当前版本不支持自动更新')
  if (download_.state !== 'ready' || !downloadedFile) throw new Error('新版本还没有下载完成')
  const game = getGameStatus()
  if (game.state === 'launching' || game.state === 'running') throw new Error('游戏正在运行，请退出游戏后再更新')
  if (getInstallStatus()?.state === 'running') throw new Error('正在下载或安装游戏，请等待完成后再更新')
  const file = downloadedFile
  const pid = process.pid

  if (mode === 'portable') {
    const target = process.env.PORTABLE_EXECUTABLE_FILE!
    const script = join(UPDATES_DIR, 'update.ps1')
    // 免安装版的外壳程序在启动器退出后才释放 exe，所以覆盖失败时多等一会儿再试
    const lines = [
      `$pidToWait = ${pid}`,
      `$source = ${psQuote(file)}`,
      `$target = ${psQuote(target)}`,
      'while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }',
      '$ok = $false',
      'for ($i = 0; $i -lt 60 -and -not $ok; $i++) {',
      '  try { Copy-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop; $ok = $true }',
      '  catch { Start-Sleep -Milliseconds 500 }',
      '}',
      'if ($ok) { Remove-Item -LiteralPath $source -ErrorAction SilentlyContinue }',
      'Start-Process -FilePath $target',
      'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue'
    ]
    // 带 BOM 的 UTF-8，PowerShell 才能正确读取中文路径
    await writeFile(script, '\ufeff' + lines.join('\r\n'), 'utf-8')
    runDetached('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      script
    ])
  } else if (mode === 'nsis') {
    // electron-builder 的安装程序：/S 静默安装到原来的位置，--force-run 安装完后打开启动器
    runDetached(file, ['/S', '--updated', '--force-run'])
  } else if (mode === 'appimage') {
    const target = process.env.APPIMAGE!
    const temp = `${target}.new`
    await copyFile(file, temp)
    await chmod(temp, 0o755)
    // 正在运行的程序不受影响（仍使用旧文件），替换后启动的就是新版本
    await rename(temp, target)
    await rm(file, { force: true })
    runDetached(target, [])
  } else {
    const bundle = process.execPath.slice(0, process.execPath.indexOf('.app/') + 4)
    const script = join(UPDATES_DIR, 'update.sh')
    const mount = join(UPDATES_DIR, 'mount')
    const lines = [
      '#!/bin/bash',
      `PID=${pid}`,
      `DMG=${shQuote(file)}`,
      `APP=${shQuote(bundle)}`,
      `MNT=${shQuote(mount)}`,
      'while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done',
      'mkdir -p "$MNT"',
      'if hdiutil attach -nobrowse -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null; then',
      '  NEW=$(find "$MNT" -maxdepth 1 -name "*.app" | head -n 1)',
      '  if [ -n "$NEW" ] && rm -rf "$APP.old" && mv "$APP" "$APP.old" && ditto "$NEW" "$APP"; then',
      '    hdiutil detach "$MNT" -quiet',
      '    xattr -cr "$APP" 2>/dev/null',
      '    rm -rf "$APP.old" "$DMG"',
      '    open "$APP"',
      '    exit 0',
      '  fi',
      '  [ -d "$APP.old" ] && [ ! -d "$APP" ] && mv "$APP.old" "$APP"',
      '  hdiutil detach "$MNT" -quiet',
      'fi',
      '# 自动替换失败（例如没有写入权限）：打开 dmg，让用户手动拖入「应用程序」',
      'open "$DMG"'
    ]
    await writeFile(script, lines.join('\n'), { mode: 0o755 })
    runDetached('/bin/bash', [script])
  }
  // 给后台程序一点启动时间再退出
  setTimeout(() => app.quit(), 300)
}

/** 清理上次更新留下的安装包（启动时调用；新版本已经在运行，旧的安装包没有用了） */
export async function cleanUpdateFiles(): Promise<void> {
  await rm(UPDATES_DIR, { recursive: true, force: true }).catch(() => undefined)
}
