import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { createMinecraftProcessWatcher, launch, Version } from '@xmcl/core'
import { getSettings } from './config'
import { resolveJava } from './java'
import { openLogWindow } from './logWindow'
import type { GameLogEvent, GameStatus, InstalledVersion, ModLoader } from '../shared/types'

/** 根据版本 json 的启动类与依赖库判断模组加载器 */
function detectLoader(json: { mainClass?: string; libraries?: { name?: string }[] }): ModLoader | undefined {
  const text = `${json.mainClass ?? ''} ${(json.libraries ?? []).map((l) => l.name ?? '').join(' ')}`
  if (/net\.fabricmc/.test(text)) return 'fabric'
  if (/org\.quiltmc/.test(text)) return 'quilt'
  if (/net\.neoforged/.test(text)) return 'neoforge'
  if (/net\.minecraftforge|cpw\.mods/.test(text)) return 'forge'
  return undefined
}

/** 读取游戏目录下所有已安装的版本（versions/<id>/<id>.json 存在即视为已安装） */
export async function listInstalledVersions(): Promise<InstalledVersion[]> {
  const { gameDir } = await getSettings()
  const versionsDir = join(gameDir, 'versions')
  let names: string[] = []
  try {
    names = (await readdir(versionsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const result: InstalledVersion[] = []
  for (const id of names) {
    try {
      const json = JSON.parse(await readFile(join(versionsDir, id, `${id}.json`), 'utf-8'))
      result.push({ id, type: json.type ?? '', releaseTime: json.releaseTime ?? '', loader: detectLoader(json) })
    } catch {
      // 没有 json 或 json 损坏的目录不是有效版本
    }
  }
  return result.sort((a, b) => b.releaseTime.localeCompare(a.releaseTime))
}

/** 离线玩家 UUID：与官方服务端一致，为 "OfflinePlayer:<名字>" 的 UUID v3 */
function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  return hash.toString('hex')
}

const MAX_LOG_LINES = 5000
let status: GameStatus = { state: 'idle', versionId: '' }
let logs: string[] = []
/** 等待推送到界面的新日志（每 100ms 合并发送一次，避免消息过多） */
let pendingLines: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function send(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function broadcast(): void {
  send('game:status', status)
}

function flushLogs(): void {
  flushTimer = null
  if (pendingLines.length === 0) return
  const event: GameLogEvent = { reset: false, lines: pendingLines }
  pendingLines = []
  send('game:log', event)
}

function pushLines(lines: string[]): void {
  if (lines.length === 0) return
  logs.push(...lines)
  if (logs.length > MAX_LOG_LINES) logs = logs.slice(-MAX_LOG_LINES)
  pendingLines.push(...lines)
  if (!flushTimer) flushTimer = setTimeout(flushLogs, 100)
}

function resetLogs(): void {
  logs = []
  pendingLines = []
  const event: GameLogEvent = { reset: true, lines: [] }
  send('game:log', event)
}

/** 启动器自己输出的提示信息 */
function launcherLog(message: string): void {
  pushLines([`[启动器] ${message}`])
}

/**
 * 把输出流按行切分。数据块可能在一行中间断开，
 * 所以把最后不完整的一行留到下一个数据块再处理。
 */
function pipeLines(stream: NodeJS.ReadableStream | null): void {
  if (!stream) return
  let rest = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    const parts = (rest + chunk).split(/\r?\n/)
    rest = parts.pop() ?? ''
    pushLines(parts.filter((line) => line.length > 0))
  })
  stream.on('end', () => {
    if (rest) pushLines([rest])
    rest = ''
  })
}

function setStatus(next: GameStatus): void {
  status = next
  broadcast()
}

export function getGameStatus(): GameStatus {
  return status
}

export function getGameLogs(): string[] {
  return logs
}

/** 把 @xmcl/core 抛出的各种错误转换成中文提示 */
function describeLaunchError(e: unknown): string {
  if (e && typeof e === 'object' && 'error' in e) {
    const err = e as { error: string; libraries?: unknown[] }
    if (err.error === 'MissingLibraries') return `缺少 ${err.libraries?.length ?? ''} 个依赖库，请重新安装该版本`
    if (err.error === 'CorruptedVersionJar') return '游戏本体文件损坏，请重新安装该版本'
    if (err.error === 'MissingVersionJson') return '版本 json 不存在，请重新安装该版本'
    return `启动检查失败：${err.error}`
  }
  return e instanceof Error ? e.message : String(e)
}

/** 启动游戏（离线模式）。启动结果通过 game:status 推送 */
export async function launchGame(versionId: string): Promise<void> {
  if (status.state === 'launching' || status.state === 'running') {
    throw new Error('游戏已经在运行中')
  }

  const settings = await getSettings()
  resetLogs()
  setStatus({ state: 'launching', versionId })
  openLogWindow()
  launcherLog(`正在启动 ${versionId}`)

  try {
    if (!settings.javaPath) {
      throw new Error('尚未选择 Java，请先到「设置」页选择')
    }
    if (!/^[A-Za-z0-9_]{3,16}$/.test(settings.offlineName)) {
      throw new Error('玩家名只能包含字母、数字和下划线，长度 3~16')
    }

    // 检查 Java 版本是否满足该游戏版本的要求
    const version = await Version.parse(settings.gameDir, versionId)
    const required = version.javaVersion?.majorVersion ?? 8
    const java = await resolveJava(settings.javaPath)
    if (!java) {
      throw new Error(`无法运行所选的 Java：${settings.javaPath}`)
    }
    if (java.majorVersion < required) {
      throw new Error(`${versionId} 需要 Java ${required} 或更高版本，当前选择的是 Java ${java.majorVersion}`)
    }
    launcherLog(`Java ${java.version}：${java.path}`)
    launcherLog(`玩家名 ${settings.offlineName}，最大内存 ${settings.maxMemory} MB`)

    const proc = await launch({
      gamePath: settings.gameDir,
      javaPath: settings.javaPath,
      version,
      maxMemory: settings.maxMemory,
      minMemory: Math.min(512, settings.maxMemory),
      gameProfile: { name: settings.offlineName, id: offlineUuid(settings.offlineName) },
      accessToken: offlineUuid(settings.offlineName),
      userType: 'legacy',
      launcherName: 'mc_launcher',
      launcherBrand: 'mc_launcher',
      versionType: 'MC Launcher',
      // 强制游戏以 UTF-8 输出日志，避免中文 Windows 下日志乱码
      extraJVMArgs: ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8'],
      extraExecOption: { windowsHide: false }
    })
    launcherLog(`游戏进程已创建（PID ${proc.pid}）`)

    pipeLines(proc.stdout)
    pipeLines(proc.stderr)

    const watcher = createMinecraftProcessWatcher(proc)
    watcher.on('minecraft-window-ready', () => {
      if (status.state === 'launching') {
        launcherLog('游戏窗口已出现')
        setStatus({ state: 'running', versionId })
      }
    })
    watcher.on('error', (e) => {
      setStatus({ state: 'crashed', versionId, error: describeLaunchError(e) })
    })
    watcher.on('minecraft-exit', ({ code, crashReportLocation }) => {
      launcherLog(`游戏进程已退出，退出码 ${code}`)
      if (code === 0) {
        setStatus({ state: 'exited', versionId, exitCode: code })
      } else {
        const lastLines = logs
          .filter((line) => !line.startsWith('[启动器]'))
          .slice(-5)
          .join('\n')
        setStatus({
          state: 'crashed',
          versionId,
          exitCode: code,
          error: crashReportLocation
            ? `游戏崩溃，崩溃报告：${crashReportLocation}`
            : `游戏异常退出（退出码 ${code}）${lastLines ? `\n${lastLines}` : ''}`
        })
      }
    })
  } catch (e) {
    // 启动失败的原因通过状态推送给界面显示
    launcherLog(`启动失败：${describeLaunchError(e)}`)
    setStatus({ state: 'crashed', versionId, error: describeLaunchError(e) })
  }
}
