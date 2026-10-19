import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings } from './config'
import { isIsolated } from './isolation'
import { assertSafeId } from './versionManage'
import type { AppSettings, ModLoader, VersionConfig } from '../shared/types'

const CONFIG_FILE = 'liuli-version.json'

export const DEFAULT_VERSION_CONFIG: VersionConfig = {
  maxMemory: 0,
  javaMode: 'global',
  javaPath: '',
  isolation: 'global',
  windowWidth: 0,
  windowHeight: 0,
  fullscreen: false,
  jvmArgs: '',
  gameArgs: '',
  wrapperCommand: '',
  envVars: '',
  preLaunchCommand: '',
  postExitCommand: ''
}

function configPath(gameDir: string, versionId: string): string {
  assertSafeId(versionId)
  return join(gameDir, 'versions', versionId, CONFIG_FILE)
}

/** 只保留类型正确的字段，文件被手动改坏时用默认值代替 */
function sanitize(raw: unknown): VersionConfig {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const config = { ...DEFAULT_VERSION_CONFIG }
  const int = (value: unknown, max: number): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined
  config.maxMemory = int(saved.maxMemory, 1024 * 1024) ?? 0
  config.windowWidth = int(saved.windowWidth, 16384) ?? 0
  config.windowHeight = int(saved.windowHeight, 16384) ?? 0
  if (saved.javaMode === 'auto' || saved.javaMode === 'custom') config.javaMode = saved.javaMode
  if (saved.isolation === 'on' || saved.isolation === 'off') config.isolation = saved.isolation
  // 只有「指定 Java」时才保留路径，切回其他模式后不算作单独设置
  if (config.javaMode === 'custom' && typeof saved.javaPath === 'string') config.javaPath = saved.javaPath
  if (typeof saved.fullscreen === 'boolean') config.fullscreen = saved.fullscreen
  if (typeof saved.jvmArgs === 'string') config.jvmArgs = saved.jvmArgs
  if (typeof saved.gameArgs === 'string') config.gameArgs = saved.gameArgs
  for (const key of ['wrapperCommand', 'envVars', 'preLaunchCommand', 'postExitCommand'] as const) {
    if (typeof saved[key] === 'string') config[key] = saved[key] as string
  }
  return config
}

/** 读取版本设置，没有设置文件时全部跟随全局 */
export async function getVersionConfig(versionId: string, gameDir?: string): Promise<VersionConfig> {
  const dir = gameDir ?? (await getSettings()).gameDir
  try {
    return sanitize(JSON.parse(await readFile(configPath(dir, versionId), 'utf-8')))
  } catch {
    return { ...DEFAULT_VERSION_CONFIG }
  }
}

/** 是否有与默认值不同的设置 */
export function isCustomized(config: VersionConfig): boolean {
  return (Object.keys(DEFAULT_VERSION_CONFIG) as (keyof VersionConfig)[]).some(
    (key) => config[key] !== DEFAULT_VERSION_CONFIG[key]
  )
}

/** 每个版本的保存排队进行：读取→合并→写入不会被另一次保存打断，两次快速保存都不会丢 */
const saveQueues = new Map<string, Promise<unknown>>()

/** 保存版本设置（先写临时文件再重命名） */
export function setVersionConfig(versionId: string, patch: Partial<VersionConfig>): Promise<VersionConfig> {
  const previous = saveQueues.get(versionId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(() => saveVersionConfig(versionId, patch))
  const tail = result.catch(() => undefined)
  saveQueues.set(versionId, tail)
  void tail.then(() => {
    if (saveQueues.get(versionId) === tail) saveQueues.delete(versionId)
  })
  return result
}

async function saveVersionConfig(versionId: string, patch: Partial<VersionConfig>): Promise<VersionConfig> {
  const { gameDir } = await getSettings()
  const path = configPath(gameDir, versionId)
  const next = sanitize({ ...(await getVersionConfig(versionId, gameDir)), ...patch })
  if (next.javaMode === 'custom' && !next.javaPath) throw new Error('请选择要使用的 Java')
  // 保存前检查参数能否正确拆分（例如引号没有配对）
  try {
    splitArgs(next.jvmArgs)
  } catch {
    throw new Error('JVM 参数中的引号没有配对')
  }
  try {
    splitArgs(next.gameArgs)
  } catch {
    throw new Error('游戏参数中的引号没有配对')
  }
  try {
    splitArgs(next.wrapperCommand)
  } catch {
    throw new Error('包装命令中的引号没有配对')
  }
  parseEnvVars(next.envVars)
  if (!existsSync(join(gameDir, 'versions', versionId, `${versionId}.json`)))
    throw new Error(`找不到版本：${versionId}`)
  const temp = `${path}.${randomUUID().slice(0, 8)}.tmp`
  try {
    await writeFile(temp, JSON.stringify(next, null, 2), 'utf-8')
    await rename(temp, path)
  } catch (e) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw e
  }
  return next
}

/** 结合版本设置判断是否版本隔离 */
export function isolatedWith(
  config: VersionConfig,
  mode: AppSettings['versionIsolation'],
  loader?: ModLoader
): boolean {
  if (config.isolation === 'on') return true
  if (config.isolation === 'off') return false
  return isIsolated(mode, loader)
}

/** 名称：字母或下划线开头，只含字母、数字、下划线 */
const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

/** 解析环境变量文本：每行一个「名称=值」，空行和 # 开头的行忽略 */
export function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const match = ENV_LINE.exec(line)
    if (!match)
      throw new Error(`环境变量第 ${index + 1} 行格式不对，应为「名称=值」，例如 MESA_GL_VERSION_OVERRIDE=4.5`)
    env[match[1]] = match[2]
  })
  return env
}

/**
 * 把参数文本拆成数组：按空白分隔，单引号或双引号包住的部分可以带空格。
 * 参数直接交给 Java 进程，不经过命令行解释器
 */
export function splitArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  let started = false
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) args.push(current)
      current = ''
      started = false
    } else {
      current += ch
      started = true
    }
  }
  if (quote) throw new Error('参数中的引号没有配对')
  if (started) args.push(current)
  return args
}
