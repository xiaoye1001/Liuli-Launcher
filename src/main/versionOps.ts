import { app, shell } from 'electron'
import { execFile } from 'child_process'
import { chmod, cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings, updateSettings } from './config'
import { getInstallStatus } from './install'
import { getGameStatus } from './launch'
import { listServers, saveServer } from './servers'
import { assertSafeId } from './versionManage'

/** 版本名规则与安装时一致 */
function assertNewName(name: string): void {
  if (!name) throw new Error('版本名不能为空')
  if (name.length > 64) throw new Error('版本名不能超过 64 个字符')
  if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..')
    throw new Error('版本名不能包含 \\ / : * ? " < > | 等字符')
  if (name !== name.trim()) throw new Error('版本名首尾不能有空格')
}

function assertIdle(action: string): void {
  const install = getInstallStatus()
  if (install?.state === 'running')
    throw new Error(`正在${install.kind === 'repair' ? '修复' : '安装'} ${install.versionId}，请等待完成后再${action}`)
  const game = getGameStatus()
  if (game.state === 'launching' || game.state === 'running') throw new Error(`游戏正在运行，请退出游戏后再${action}`)
}

/** 其他依赖于该版本的版本（inheritsFrom） */
async function dependentsOf(versionsDir: string, versionId: string): Promise<string[]> {
  const result: string[] = []
  for (const name of await readdir(versionsDir).catch(() => [] as string[])) {
    if (name === versionId) continue
    try {
      const json = JSON.parse(await readFile(join(versionsDir, name, `${name}.json`), 'utf-8'))
      if (json.inheritsFrom === versionId) result.push(name)
    } catch {
      // 忽略无效目录
    }
  }
  return result
}

/**
 * 把版本文件夹里的文件改成新名字，并修改版本 json 的 id。
 * 原版（没有 inheritsFrom）的版本名就是 Minecraft 版本号，改名后记录到 liuliMinecraftVersion，
 * 供启动器判断游戏版本（xmcl 会忽略这个字段）
 */
async function retarget(dir: string, oldId: string, newId: string): Promise<void> {
  for (const [from, to] of [
    [`${oldId}.json`, `${newId}.json`],
    [`${oldId}.jar`, `${newId}.jar`],
    [`${oldId}-natives`, `${newId}-natives`]
  ]) {
    if (await stat(join(dir, from)).catch(() => null)) await rename(join(dir, from), join(dir, to))
  }
  const jsonPath = join(dir, `${newId}.json`)
  const json = JSON.parse(await readFile(jsonPath, 'utf-8'))
  if (!json.inheritsFrom && !json.liuliMinecraftVersion) json.liuliMinecraftVersion = json.id ?? oldId
  json.id = newId
  await writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf-8')
}

async function prepare(
  versionId: string,
  newId: string
): Promise<{ versionsDir: string; source: string; target: string }> {
  assertSafeId(versionId)
  assertNewName(newId)
  const { gameDir } = await getSettings()
  const versionsDir = join(gameDir, 'versions')
  const source = join(versionsDir, versionId)
  const target = join(versionsDir, newId)
  if (!(await stat(join(source, `${versionId}.json`)).catch(() => null))) throw new Error(`找不到版本：${versionId}`)
  // Windows 的文件名不区分大小写，按小写比较是否重名
  const existing = await readdir(versionsDir).catch(() => [] as string[])
  if (existing.some((n) => n.toLowerCase() === newId.toLowerCase() && n !== versionId)) {
    throw new Error(`已存在名为「${newId}」的版本`)
  }
  return { versionsDir, source, target }
}

/** 重命名版本：其他版本依赖它时不能改名（会找不到继承的版本） */
export async function renameVersion(versionId: string, newId: string): Promise<void> {
  assertIdle('重命名')
  if (newId === versionId) return
  const { versionsDir, source, target } = await prepare(versionId, newId)
  const dependents = await dependentsOf(versionsDir, versionId)
  if (dependents.length > 0) throw new Error(`以下版本依赖于 ${versionId}，不能重命名：${dependents.join('、')}`)
  try {
    await rename(source, target)
  } catch (e) {
    throw new Error(`重命名失败，可能有文件正在被使用：${(e as Error).message}`)
  }
  await retarget(target, versionId, newId)
  // 跟着更新主页选择的版本与服务器使用的版本
  const settings = await getSettings()
  if (settings.selectedVersion === versionId) await updateSettings({ selectedVersion: newId })
  for (const server of await listServers()) {
    if (server.versionId === versionId) await saveServer({ ...server, versionId: newId })
  }
}

/** 版本隔离时游戏在版本文件夹里产生、复制时可以不要的内容 */
const SKIP_ON_COPY = ['logs', 'crash-reports', 'screenshots', 'backups']

/** 复制版本（连同版本隔离文件夹里的模组、配置等）；includeSaves 为 false 时不复制存档 */
export async function copyVersion(versionId: string, newId: string, includeSaves: boolean): Promise<void> {
  assertIdle('复制')
  const { source, target } = await prepare(versionId, newId)
  if (newId === versionId) throw new Error('新版本名不能与原版本相同')
  const skip = new Set([...SKIP_ON_COPY, ...(includeSaves ? [] : ['saves'])])
  try {
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      filter: (src) => {
        const rel = src.slice(source.length + 1).split(/[\\/]/)[0]
        return !skip.has(rel)
      }
    })
    await retarget(target, versionId, newId)
  } catch (e) {
    throw new Error(`复制失败：${(e as Error).message}`)
  }
}

// ---------- 桌面快捷方式 ----------

/** 启动器自身的启动命令（免安装版、AppImage 要用外层文件的路径） */
function launcherCommand(): { file: string; args: string[] } {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE
  const appImage = process.env.APPIMAGE
  const file = portable || appImage || process.execPath
  // 开发模式下 execPath 是 electron，需要带上应用目录
  const args = app.isPackaged ? [] : [app.getAppPath()]
  return { file, args }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

/** 在桌面创建快捷方式：双击后打开启动器并直接启动这个版本 */
export async function createDesktopShortcut(versionId: string): Promise<string> {
  assertSafeId(versionId)
  const { gameDir } = await getSettings()
  if (!(await stat(join(gameDir, 'versions', versionId, `${versionId}.json`)).catch(() => null))) {
    throw new Error(`找不到版本：${versionId}`)
  }
  const desktop = app.getPath('desktop')
  await mkdir(desktop, { recursive: true })
  const { file, args } = launcherCommand()
  const launchArg = `--launch=${versionId}`
  const title = `${versionId} - 琉璃启动器`

  if (process.platform === 'win32') {
    const path = join(desktop, `${safeFileName(title)}.lnk`)
    const ok = shell.writeShortcutLink(path, 'create', {
      target: file,
      args: [...args, launchArg].map((a) => `"${a.replace(/"/g, '')}"`).join(' '),
      icon: file,
      iconIndex: 0,
      description: `用琉璃启动器启动 ${versionId}`
    })
    if (!ok) throw new Error('创建快捷方式失败')
    return path
  }

  const quote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
  if (process.platform === 'darwin') {
    // macOS：.command 脚本，双击后用启动器打开
    const appBundle = file.replace(/\/Contents\/MacOS\/[^/]+$/, '')
    const path = join(desktop, `${safeFileName(title)}.command`)
    const command = appBundle.endsWith('.app')
      ? `open -a ${quote(appBundle)} --args ${quote(launchArg)}`
      : `${[file, ...args, launchArg].map(quote).join(' ')} &`
    await writeFile(path, `#!/bin/sh\n${command}\n`, 'utf-8')
    await chmod(path, 0o755)
    return path
  }

  // Linux：.desktop 文件
  const path = join(desktop, `${safeFileName(title)}.desktop`)
  const exec = [file, ...args, launchArg].map((a) => `"${a.replace(/["`$\\]/g, '\\$&')}"`).join(' ')
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${title}`,
    `Comment=用琉璃启动器启动 ${versionId}`,
    `Exec=${exec}`,
    'Terminal=false',
    'Categories=Game;',
    ''
  ].join('\n')
  await writeFile(path, content, 'utf-8')
  await chmod(path, 0o755)
  // GNOME 需要标记为可信才能双击运行，失败也不影响
  execFile('gio', ['set', path, 'metadata::trusted', 'true'], () => undefined)
  return path
}

/** 从命令行参数中读取要直接启动的版本（--launch=版本名） */
export function launchArgOf(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--launch=')) return arg.slice('--launch='.length) || undefined
    if (arg === '--launch' && argv[i + 1]) return argv[i + 1]
  }
  return undefined
}
