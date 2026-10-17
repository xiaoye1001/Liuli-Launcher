import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { createMinecraftProcessWatcher, launch, Version } from '@xmcl/core'
import { getSettings } from './config'
import { versionGameDir } from './isolation'
import { getVersionConfig, isCustomized, isolatedWith, splitArgs } from './versionConfig'
import { getMicrosoftLaunchAuth } from './microsoft'
import { pickJava, requirementOf } from './javaRuntime'
import { startJavaInstall } from './install'
import { onGameEnded, onGameWindowReady } from './windows'
import { resolveJava } from './java'
import { openLogWindow } from './logWindow'
import { collectCrash } from './crashReport'
import { parseAddress } from './serverPing'
import { ensureAuthlibInjector } from './authlibInjector'
import type { GameLogEvent, GameStatus, InstalledVersion, JavaInfo, ModLoader } from '../shared/types'

/** 根据版本 json 的启动类与依赖库判断模组加载器 */
export function detectLoader(json: { mainClass?: string; libraries?: { name?: string }[] }): ModLoader | undefined {
  const text = `${json.mainClass ?? ''} ${(json.libraries ?? []).map((l) => l.name ?? '').join(' ')}`
  if (/net\.fabricmc/.test(text)) return 'fabric'
  if (/org\.quiltmc/.test(text)) return 'quilt'
  if (/net\.neoforged/.test(text)) return 'neoforge'
  if (/net\.minecraftforge|cpw\.mods/.test(text)) return 'forge'
  if (/(^|\s)optifine:/i.test(text)) return 'optifine'
  return undefined
}

/** 读取游戏目录下所有已安装的版本（versions/<id>/<id>.json 存在即视为已安装） */
export async function listInstalledVersions(): Promise<InstalledVersion[]> {
  const { gameDir, versionIsolation } = await getSettings()
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
      const loader = detectLoader(json)
      const config = await getVersionConfig(id, gameDir)
      result.push({
        id,
        type: json.type ?? '',
        releaseTime: json.releaseTime ?? '',
        loader,
        isolated: isolatedWith(config, versionIsolation, loader),
        customized: isCustomized(config),
        // 加载器版本继承自原版，原版版本的 id 就是版本号
        minecraftVersion: json.inheritsFrom ?? json.id ?? id
      })
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
  const previous = status.state
  status = next
  broadcast()
  // 「游戏启动后」设置：窗口出现时最小化/隐藏启动器，游戏结束后恢复
  if (next.state === 'running' && previous !== 'running') void onGameWindowReady()
  if (next.state === 'exited' || next.state === 'crashed') onGameEnded()
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
/** 直接进入服务器的启动参数 */
function serverOptions(
  server: string | undefined,
  minecraftVersion: string
): { quickPlayMultiplayer?: string; server?: { ip: string; port?: number } } {
  if (!server) return {}
  if (supportsQuickPlay(minecraftVersion)) return { quickPlayMultiplayer: server }
  const { host, port } = parseAddress(server)
  return { server: { ip: host, port } }
}

/** 1.20（快照 23w14a）起用 --quickPlayMultiplayer 直接进入服务器，更早的版本用 --server / --port */
export function supportsQuickPlay(minecraftVersion: string): boolean {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1]) >= 20
  const snapshot = /^(\d{2})w(\d{2})/.exec(minecraftVersion)
  if (snapshot) return Number(snapshot[1]) > 23 || (Number(snapshot[1]) === 23 && Number(snapshot[2]) >= 14)
  return false
}

/** 启动游戏。server 不为空时，进入游戏后直接连接该服务器 */
export async function launchGame(versionId: string, server?: string): Promise<void> {
  if (status.state === 'launching' || status.state === 'running') {
    throw new Error('游戏已经在运行中')
  }

  const settings = await getSettings()
  resetLogs()
  setStatus({ state: 'launching', versionId })
  const startedAt = Date.now()
  openLogWindow()
  launcherLog(`正在启动 ${versionId}${server ? `，进入游戏后连接服务器 ${server}` : ''}`)

  try {
    // 版本设置优先，未设置的项跟随全局设置
    const config = await getVersionConfig(versionId, settings.gameDir)
    const javaAuto = config.javaMode === 'global' ? settings.javaAuto : config.javaMode === 'auto'
    const javaPath = config.javaMode === 'custom' ? config.javaPath : settings.javaPath
    const maxMemory = config.maxMemory || settings.maxMemory
    const jvmArgs = splitArgs(config.jvmArgs)
    const gameArgs = splitArgs(config.gameArgs)
    if (!javaAuto && !javaPath) {
      throw new Error('尚未选择 Java，请先到「设置」页选择，或开启「自动选择 Java」')
    }
    // 微软账号会在这里自动刷新过期的令牌；离线账号使用玩家名生成固定的 UUID
    const msAuth = await getMicrosoftLaunchAuth()
    if (!msAuth && !/^[A-Za-z0-9_]{3,16}$/.test(settings.offlineName)) {
      throw new Error('玩家名只能包含字母、数字和下划线，长度 3~16')
    }
    const auth = msAuth ?? {
      name: settings.offlineName,
      uuid: offlineUuid(settings.offlineName),
      accessToken: offlineUuid(settings.offlineName),
      userType: 'legacy' as const,
      microsoft: false
    }

    const version = await Version.parse(settings.gameDir, versionId)
    const requirement = requirementOf(version)
    const required = requirement.majorVersion
    let java: JavaInfo | undefined
    if (javaAuto) {
      // 自动选择：挑选该版本需要的 Java，本机没有就自动下载
      java = (await pickJava(requirement)) ?? undefined
      if (!java) {
        launcherLog(`本机没有合适的 Java ${required}，正在自动下载（进度见「下载」页）`)
        const path = await startJavaInstall(requirement.component)
        java = await resolveJava(path)
        if (!java) throw new Error(`下载的 Java ${required} 无法运行`)
        launcherLog(`Java ${required} 下载完成`)
      }
    } else {
      // 手动选择：检查所选 Java 是否满足该游戏版本的要求
      const where = config.javaMode === 'custom' ? '该版本的「版本设置」' : '「设置」'
      java = await resolveJava(javaPath)
      if (!java) {
        throw new Error(`无法运行所选的 Java：${javaPath}，请在${where}中重新选择`)
      }
      if (java.majorVersion < required) {
        throw new Error(
          `${versionId} 需要 Java ${required} 或更高版本，当前选择的是 Java ${java.majorVersion}。可以在${where}中改为自动选择 Java`
        )
      }
    }
    launcherLog(`Java ${java.version}：${java.path}`)
    const accountLabel = auth.microsoft
      ? '微软账号'
      : 'yggdrasil' in auth && auth.yggdrasil
        ? `外置账号（${auth.yggdrasil.serverName}）`
        : '离线账号'
    launcherLog(`${accountLabel} ${auth.name}，最大内存 ${maxMemory} MB`)
    // 外置登录：通过 authlib-injector 让游戏使用皮肤站的验证服务器
    const yggdrasilAgent =
      'yggdrasil' in auth && auth.yggdrasil
        ? {
            jar: await ensureAuthlibInjector(launcherLog),
            server: auth.yggdrasil.server,
            prefetched: auth.yggdrasil.prefetched
          }
        : undefined
    if (isCustomized(config)) launcherLog('已应用该版本的独立设置')
    // 版本隔离：模组、存档、配置放在版本自己的文件夹里，依赖库与资源文件仍从游戏目录读取
    const isolated = isolatedWith(config, settings.versionIsolation, detectLoader(version))
    const gamePath = versionGameDir(settings.gameDir, versionId, isolated)
    launcherLog(`游戏目录：${gamePath}${isolated ? '（版本隔离）' : ''}`)

    const proc = await launch({
      gamePath,
      resourcePath: settings.gameDir,
      javaPath: java.path,
      version,
      maxMemory,
      minMemory: Math.min(512, maxMemory),
      gameProfile: { name: auth.name, id: auth.uuid },
      accessToken: auth.accessToken,
      // 官方启动器给微软账号传的是 msa，xmcl 的类型定义还没有这个值
      userType: auth.userType as 'legacy' | 'mojang',
      yggdrasilAgent,
      launcherName: 'liuli-launcher',
      launcherBrand: 'Liuli Launcher',
      versionType: 'Liuli Launcher',
      // 强制游戏以 UTF-8 输出日志，避免中文 Windows 下日志乱码
      // 版本设置里的附加参数放在最后，可以覆盖前面的默认值
      extraJVMArgs: ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', ...jvmArgs],
      extraMCArgs: gameArgs,
      ...serverOptions(server, version.minecraftVersion),
      resolution:
        config.fullscreen || config.windowWidth || config.windowHeight
          ? {
              fullscreen: config.fullscreen,
              width: config.windowWidth || undefined,
              height: config.windowHeight || undefined
            }
          : undefined,
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
    watcher.on('minecraft-exit', async ({ code, crashReportLocation }) => {
      launcherLog(`游戏进程已退出，退出码 ${code}`)
      if (code === 0) {
        setStatus({ state: 'exited', versionId, exitCode: code })
      } else {
        // 等待剩余的输出写完，再分析崩溃原因
        await new Promise((resolve) => setTimeout(resolve, 500))
        const analysis = await collectCrash({
          versionId,
          gamePath,
          startedAt,
          exitCode: code,
          crashReportLocation,
          logs: [...logs],
          context: {
            javaMajor: java?.majorVersion,
            javaPath: java?.path,
            maxMemory,
            customJvmArgs: jvmArgs.length > 0
          }
        }).catch((e) => {
          launcherLog(`崩溃分析失败：${e instanceof Error ? e.message : String(e)}`)
          return undefined
        })
        if (analysis?.causes.length) launcherLog(`崩溃分析：${analysis.causes.map((c) => c.title).join('、')}`)
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
            : `游戏异常退出（退出码 ${code}）${lastLines ? `\n${lastLines}` : ''}`,
          analysis
        })
      }
    })
  } catch (e) {
    // 启动失败的原因通过状态推送给界面显示
    launcherLog(`启动失败：${describeLaunchError(e)}`)
    setStatus({ state: 'crashed', versionId, error: describeLaunchError(e) })
  }
}
