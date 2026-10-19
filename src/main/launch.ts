import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { createMinecraftProcessWatcher, launch, Version, type ResolvedVersion } from '@xmcl/core'
import { getSettings } from './config'
import { versionGameDir } from './isolation'
import { getVersionConfig, isCustomized, isolatedWith, parseEnvVars, splitArgs } from './versionConfig'
import { getMicrosoftLaunchAuth } from './microsoft'
import { pickJava, requirementOf } from './javaRuntime'
import { completeMissingFiles, startJavaInstall } from './install'
import { countMissing, findMissingFiles, type MissingFiles } from './fileCheck'
import { autoMemory } from './memory'
import { gcTuningArgs } from './gcTuning'
import { onGameEnded, onGameWindowReady } from './windows'
import { resolveJava } from './java'
import { openLogWindow } from './logWindow'
import { collectCrash } from './crashReport'
import { recordSession } from './playStats'
import { parseAddress } from './serverPing'
import { ensureAuthlibInjector } from './authlibInjector'
import { readVersionDisplay } from './versionDisplay'
import type { GameLogEvent, GameStatus, InstalledVersion, JavaInfo, MemoryPlan, ModLoader } from '../shared/types'

/** 根据版本 json 的启动类与依赖库判断模组加载器 */
export function detectLoader(json: { mainClass?: string; libraries?: { name?: string }[] }): ModLoader | undefined {
  const text = `${json.mainClass ?? ''} ${(json.libraries ?? []).map((l) => l.name ?? '').join(' ')}`
  // Quilt 版本也会用到 Fabric 的 intermediary 映射库，所以先判断 Quilt
  if (/org\.quiltmc/.test(text)) return 'quilt'
  if (/net\.fabricmc/.test(text)) return 'fabric'
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
        ...(await readVersionDisplay(gameDir, id)),
        // 加载器版本继承自原版，原版版本的 id 就是版本号
        minecraftVersion: json.inheritsFrom ?? json.liuliMinecraftVersion ?? json.id ?? id
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
function pipeLines(stream: NodeJS.ReadableStream | null, prefix = ''): void {
  if (!stream) return
  let rest = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    const parts = (rest + chunk).split(/\r?\n/)
    rest = parts.pop() ?? ''
    pushLines(parts.filter((line) => line.length > 0).map((line) => prefix + line))
  })
  stream.on('end', () => {
    if (rest) pushLines([prefix + rest])
    rest = ''
  })
}

/** 启动前 / 退出后命令最多运行 10 分钟 */
const HOOK_TIMEOUT = 10 * 60 * 1000

/**
 * 通过系统命令行执行用户设置的命令，输出显示在游戏日志中。
 * 返回退出码；超时会结束命令并抛出错误。
 */
function runHook(label: string, command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  launcherLog(`正在执行${label}：${command}`)
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, cwd, env, windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${label}运行超过 10 分钟，已结束`))
    }, HOOK_TIMEOUT)
    pipeLines(child.stdout, `[${label}] `)
    pipeLines(child.stderr, `[${label}] `)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`无法执行${label}：${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code ?? -1)
    })
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

function describePlan(plan: MemoryPlan): string {
  const parts = [plan.mods > 0 ? `${plan.mods} 个模组，建议 ${plan.recommended} MB` : `建议 ${plan.recommended} MB`]
  if (plan.free !== null) parts.push(`当前可用 ${plan.free} MB`)
  return parts.join('，')
}

/** 启动前检查游戏文件，只下载缺失或损坏的文件 */
async function ensureGameFiles(versionId: string, version: ResolvedVersion): Promise<void> {
  launcherLog('正在检查游戏文件')
  let missing: MissingFiles
  try {
    missing = await findMissingFiles(version)
  } catch (e) {
    launcherLog(`检查游戏文件时出错，已跳过：${e instanceof Error ? e.message : String(e)}`)
    return
  }
  if (missing.unfixable.length > 0) {
    launcherLog(
      `缺少 ${missing.unfixable.length} 个无法自动下载的文件（${missing.unfixable.slice(0, 3).join('、')}），如果启动失败请重新安装该版本`
    )
  }
  const count = countMissing(missing)
  if (count === 0) {
    launcherLog('游戏文件完整')
    return
  }
  launcherLog(`发现 ${count} 个缺失或损坏的文件，正在自动补全（进度见「下载」页）`)
  await completeMissingFiles(versionId, version, missing)
  launcherLog('游戏文件已补全')
}

/** 预览某个版本自动分配的内存（用于设置页显示） */
export async function previewMemory(versionId: string): Promise<MemoryPlan | null> {
  const settings = await getSettings()
  try {
    const version = await Version.parse(settings.gameDir, versionId)
    const config = await getVersionConfig(versionId, settings.gameDir)
    const loader = detectLoader(version)
    const gamePath = versionGameDir(
      settings.gameDir,
      versionId,
      isolatedWith(config, settings.versionIsolation, loader)
    )
    // 改过名的原版：版本名不是游戏版本号，使用记录下来的版本号
    const json = JSON.parse(await readFile(join(settings.gameDir, 'versions', versionId, `${versionId}.json`), 'utf-8'))
    const minecraftVersion: string = json.inheritsFrom ?? json.liuliMinecraftVersion ?? version.minecraftVersion
    return await autoMemory(loader, gamePath, minecraftVersion)
  } catch {
    return null
  }
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
    // 改过名的原版：版本名不再是游戏版本号，使用记录下来的版本号
    const rawJson = JSON.parse(
      await readFile(join(settings.gameDir, 'versions', versionId, `${versionId}.json`), 'utf-8')
    )
    const minecraftVersion: string = rawJson.inheritsFrom
      ? version.minecraftVersion
      : (rawJson.liuliMinecraftVersion ?? version.minecraftVersion)
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
    launcherLog(`${accountLabel} ${auth.name}`)
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

    if (settings.checkFiles) await ensureGameFiles(versionId, version)

    // 自定义环境变量（只显示名称，值可能包含不想公开的内容）
    const customEnv = parseEnvVars(config.envVars)
    if (Object.keys(customEnv).length > 0) launcherLog(`环境变量：${Object.keys(customEnv).join('、')}`)
    const gameEnv: NodeJS.ProcessEnv = { ...process.env, ...customEnv }
    // 提供给命令使用的变量，与 MultiMC / Prism Launcher 相同
    const hookEnv: NodeJS.ProcessEnv = {
      ...gameEnv,
      INST_NAME: versionId,
      INST_ID: versionId,
      INST_DIR: gamePath,
      INST_MC_DIR: settings.gameDir,
      INST_JAVA: java.path,
      INST_MC_VERSION: minecraftVersion
    }
    if (config.preLaunchCommand.trim()) {
      const code = await runHook('启动前命令', config.preLaunchCommand, gamePath, hookEnv)
      if (code !== 0) throw new Error(`启动前命令执行失败（退出码 ${code}），已取消启动`)
    }
    const wrapper = splitArgs(config.wrapperCommand)
    if (wrapper.length > 0) launcherLog(`包装命令：${config.wrapperCommand.trim()}`)

    // 版本单独设置了内存时优先使用；否则按全局设置自动或手动分配
    let maxMemory = config.maxMemory || settings.maxMemory
    if (!config.maxMemory && settings.memoryAuto) {
      const plan = await autoMemory(detectLoader(version), gamePath, minecraftVersion)
      maxMemory = plan.memory
      launcherLog(`自动分配内存 ${maxMemory} MB（${describePlan(plan)}）`)
      if (plan.limited) {
        launcherLog('当前可用内存不足，已少分配一些；如果游戏卡顿或崩溃，请关闭其他程序后再启动')
      }
    } else {
      launcherLog(`最大内存 ${maxMemory} MB`)
    }

    // 优化内存回收：自定义了回收器时不添加，自定义参数放在后面可以覆盖
    const gcArgs = settings.optimizeGc ? gcTuningArgs(java.majorVersion, jvmArgs) : []
    if (settings.optimizeGc) {
      launcherLog(gcArgs.length > 0 ? '已优化内存回收（G1）' : '版本设置里指定了回收器，不添加内存回收优化参数')
    }

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
      extraJVMArgs: [
        '-Dfile.encoding=UTF-8',
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        ...gcArgs,
        ...jvmArgs
      ],
      extraMCArgs: gameArgs,
      ...serverOptions(server, minecraftVersion),
      resolution:
        config.fullscreen || config.windowWidth || config.windowHeight
          ? {
              fullscreen: config.fullscreen,
              width: config.windowWidth || undefined,
              height: config.windowHeight || undefined
            }
          : undefined,
      prependCommand: wrapper.length > 0 ? wrapper : undefined,
      extraExecOption: { windowsHide: false, env: gameEnv }
    })
    launcherLog(`游戏进程已创建（PID ${proc.pid}）`)
    const processStartedAt = Date.now()
    setStatus({ state: 'launching', versionId, startedAt: processStartedAt })

    pipeLines(proc.stdout)
    pipeLines(proc.stderr)

    const watcher = createMinecraftProcessWatcher(proc)
    watcher.on('minecraft-window-ready', () => {
      if (status.state === 'launching') {
        launcherLog('游戏窗口已出现')
        setStatus({ state: 'running', versionId, startedAt: processStartedAt })
      }
    })
    watcher.on('error', (e) => {
      setStatus({ state: 'crashed', versionId, error: describeLaunchError(e) })
    })
    watcher.on('minecraft-exit', async ({ code, crashReportLocation }) => {
      launcherLog(`游戏进程已退出，退出码 ${code}`)
      if (config.postExitCommand.trim()) {
        // 不等待退出后命令结束，避免影响崩溃分析与界面状态
        runHook('退出后命令', config.postExitCommand, gamePath, { ...hookEnv, INST_EXIT_CODE: String(code) })
          .then((exit) => exit !== 0 && launcherLog(`退出后命令执行失败（退出码 ${exit}）`))
          .catch((e) => launcherLog(e instanceof Error ? e.message : String(e)))
      }
      // 记录游玩时长（从游戏进程启动到退出）
      void recordSession(versionId, processStartedAt, Date.now(), code !== 0).catch(() => undefined)
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
