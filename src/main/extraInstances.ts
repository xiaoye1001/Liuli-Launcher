/**
 * 多开：在主游戏之外再开几个游戏窗口（用不同的离线名字），适合自己测试联机、同时挂两个号等。
 * 和主游戏的启动（launch.ts）完全分开：不改变主游戏的状态、日志、游玩记录和崩溃分析。
 * - 只用离线账号（同一个正版账号同时进同一个服务器会互相挤掉）
 * - 使用版本设置里的 Java、内存、JVM 参数、游戏参数、环境变量（同样要玩家确认过）；
 *   不运行启动前 / 退出后命令和包装命令；本机没有合适的 Java 时不自动下载（先正常启动一次）
 */
import { BrowserWindow } from 'electron'
import { execFile, type ChildProcess } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { launch, Version } from '@xmcl/core'
import { getSettings } from './config'
import { detectLoader } from './launch'
import { getInstallStatus } from './install'
import { versionGameDir } from './isolation'
import { getVersionConfig, isolatedWith, parseEnvVars, splitArgs } from './versionConfig'
import { confirmVersionConfig } from './versionTrust'
import { pickJava, requirementOf } from './javaRuntime'
import { resolveJava } from './java'
import { autoMemory } from './memory'
import { gcTuningArgs } from './gcTuning'
import { assertSafeId } from './versionManage'
import type { ExtraInstance } from '../shared/types'

const NAME = /^[A-Za-z0-9_]{3,16}$/
/** 同时最多几个多开窗口 */
const MAX_RUNNING = 4
/** 每个窗口记住最后多少行输出（退出时给玩家看） */
const TAIL = 60

interface Instance extends ExtraInstance {
  proc: ChildProcess | null
}

const instances = new Map<string, Instance>()

/** 离线玩家 UUID：与官方服务端一致，为 "OfflinePlayer:<名字>" 的 UUID v3 */
function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  return hash.toString('hex')
}

function snapshot(): ExtraInstance[] {
  return [...instances.values()].map(({ proc: _, ...rest }) => ({ ...rest, tail: [...rest.tail] }))
}

function broadcast(): void {
  const list = snapshot()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('extraInstances:changed', list)
  }
}

export function listExtraInstances(): ExtraInstance[] {
  return snapshot()
}

function pipeTail(instance: Instance, stream: NodeJS.ReadableStream | null): void {
  if (!stream) return
  let rest = ''
  stream.setEncoding?.('utf-8')
  stream.on('data', (chunk: string) => {
    const lines = (rest + chunk).split(/\r?\n/)
    rest = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      instance.tail.push(line.slice(0, 500))
      if (instance.tail.length > TAIL) instance.tail.shift()
    }
  })
}

/** 再开一个游戏窗口 */
export async function launchExtraInstance(versionId: unknown, name: unknown): Promise<ExtraInstance[]> {
  if (typeof versionId !== 'string') throw new Error('无效的版本')
  assertSafeId(versionId)
  const player = typeof name === 'string' ? name.trim() : ''
  if (!NAME.test(player)) throw new Error('名字只能是 3～16 个字母、数字或下划线')
  const settings = await getSettings()
  if (player.toLowerCase() === settings.offlineName.toLowerCase()) {
    throw new Error('和主账号的离线名字一样，同一个服务器里会互相挤掉，换一个名字吧')
  }
  const running = [...instances.values()].filter((i) => i.state === 'running')
  if (running.some((i) => i.name.toLowerCase() === player.toLowerCase())) {
    throw new Error(`已经有一个名字是 ${player} 的窗口了`)
  }
  if (running.length >= MAX_RUNNING) throw new Error(`最多同时多开 ${MAX_RUNNING} 个窗口`)
  const install = getInstallStatus()
  if (install?.state === 'running' && install.versionId === versionId) {
    throw new Error('这个版本正在安装或更新，请等完成后再启动')
  }

  const config = await getVersionConfig(versionId, settings.gameDir)
  if (!(await confirmVersionConfig(settings.gameDir, versionId, config))) {
    throw new Error('已取消：没有确认这个版本的命令、Java 或参数设置')
  }
  const version = await Version.parse(settings.gameDir, versionId).catch(() => {
    throw new Error('读取版本失败，这个版本可能没有装好')
  })
  const javaAuto = config.javaMode === 'global' ? settings.javaAuto : config.javaMode === 'auto'
  const javaPath = config.javaMode === 'custom' ? config.javaPath : settings.javaPath
  const requirement = requirementOf(version)
  const java = javaAuto ? await pickJava(requirement) : javaPath ? await resolveJava(javaPath) : null
  if (!java) {
    throw new Error(
      javaAuto
        ? `本机还没有 Java ${requirement.majorVersion}：先用「启动游戏」正常启动一次这个版本，会自动下载`
        : '没有可用的 Java，请在设置里选择 Java'
    )
  }
  if (java.majorVersion < requirement.majorVersion) {
    throw new Error(`${versionId} 需要 Java ${requirement.majorVersion} 或更高版本`)
  }
  const isolated = isolatedWith(config, settings.versionIsolation, detectLoader(version))
  const gamePath = versionGameDir(settings.gameDir, versionId, isolated)
  let maxMemory = config.maxMemory || settings.maxMemory
  if (!config.maxMemory && settings.memoryAuto) {
    maxMemory = (await autoMemory(detectLoader(version), gamePath, version.minecraftVersion)).memory
  }
  const jvmArgs = splitArgs(config.jvmArgs)
  const gcArgs = settings.optimizeGc ? gcTuningArgs(java.majorVersion, jvmArgs) : []
  const uuid = offlineUuid(player)

  const proc = await launch({
    gamePath,
    resourcePath: settings.gameDir,
    javaPath: java.path,
    version,
    maxMemory,
    minMemory: Math.min(512, maxMemory),
    gameProfile: { name: player, id: uuid },
    accessToken: uuid,
    userType: 'legacy',
    launcherName: 'liuli-launcher',
    launcherBrand: 'Liuli Launcher',
    versionType: 'Liuli Launcher',
    extraJVMArgs: [
      '-Dfile.encoding=UTF-8',
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
      ...gcArgs,
      ...jvmArgs
    ],
    extraMCArgs: splitArgs(config.gameArgs),
    features: { liuli_launcher_ids: { auth_xuid: '0', clientid: Buffer.from(randomUUID()).toString('base64') } },
    resolution:
      config.fullscreen || config.windowWidth || config.windowHeight
        ? {
            fullscreen: config.fullscreen,
            width: config.windowWidth || undefined,
            height: config.windowHeight || undefined
          }
        : undefined,
    extraExecOption: { windowsHide: false, env: { ...process.env, ...parseEnvVars(config.envVars) } }
  })

  const instance: Instance = {
    id: randomUUID(),
    versionId,
    name: player,
    pid: proc.pid ?? 0,
    maxMemory,
    startedAt: Date.now(),
    state: 'running',
    exitCode: null,
    tail: [],
    proc
  }
  instances.set(instance.id, instance)
  pipeTail(instance, proc.stdout)
  pipeTail(instance, proc.stderr)
  const done = (code: number | null): void => {
    if (instance.state !== 'running') return
    instance.state = 'exited'
    instance.exitCode = code
    instance.proc = null
    broadcast()
  }
  proc.on('exit', (code) => done(code))
  proc.on('error', (e) => {
    instance.tail.push(`启动失败：${e.message}`)
    done(-1)
  })
  // 已经退出的窗口只留最近几个
  const exited = [...instances.values()].filter((i) => i.state === 'exited')
  for (const old of exited.slice(0, Math.max(0, exited.length - 6))) instances.delete(old.id)
  broadcast()
  return snapshot()
}

/** 结束一个多开的窗口 */
export function killExtraInstance(id: unknown): ExtraInstance[] {
  const instance = typeof id === 'string' ? instances.get(id) : undefined
  const proc = instance?.proc
  if (instance && proc?.pid && instance.state === 'running') {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { windowsHide: true }, () => undefined)
    } else {
      proc.kill('SIGTERM')
    }
  }
  return snapshot()
}

/** 从列表里去掉已经退出的窗口 */
export function clearExtraInstance(id: unknown): ExtraInstance[] {
  const instance = typeof id === 'string' ? instances.get(id) : undefined
  if (instance && instance.state === 'exited') instances.delete(instance.id)
  broadcast()
  return snapshot()
}
