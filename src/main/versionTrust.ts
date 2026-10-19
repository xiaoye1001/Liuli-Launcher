/**
 * 版本设置里「会在电脑上运行程序」的项（启动前 / 退出后命令、包装命令、环境变量、指定的 Java、JVM 参数）
 * 必须是玩家在启动器里设置或确认过的。
 *
 * 版本设置保存在版本文件夹的 liuli-version.json 里，别人分享的版本文件夹、整合好的 .minecraft、
 * 其他工具写入的游戏目录都可能自带这个文件。启动器在自己的数据文件夹里记录玩家认可过的内容的指纹，
 * 启动时内容和记录不一致就先弹窗列出这些设置，玩家确认后才运行。
 */
import { createHash, randomUUID } from 'crypto'
import { readFile, rename, rm, writeFile, mkdir } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import type { VersionConfig } from '../shared/types'

const TRUST_FILE = join(app.getPath('userData'), 'trusted-version-settings.json')
const MAX_ENTRIES = 2000

/** 会执行程序或改变 Java 行为的设置项 */
function sensitiveFields(config: VersionConfig): { label: string; value: string }[] {
  const fields = [
    { label: '启动前命令', value: config.preLaunchCommand },
    { label: '退出后命令', value: config.postExitCommand },
    { label: '包装命令', value: config.wrapperCommand },
    { label: '环境变量', value: config.envVars },
    { label: '指定的 Java', value: config.javaMode === 'custom' ? config.javaPath : '' },
    { label: 'JVM 参数', value: config.jvmArgs }
  ]
  return fields.filter((f) => f.value.trim() !== '')
}

/** 敏感设置的指纹；没有敏感设置时为空字符串（不需要确认） */
export function sensitiveFingerprint(config: VersionConfig): string {
  const fields = sensitiveFields(config)
  if (fields.length === 0) return ''
  return createHash('sha256')
    .update(JSON.stringify(fields.map((f) => [f.label, f.value])))
    .digest('hex')
}

/** 记录的键：游戏目录 + 版本名（Windows 不区分大小写） */
function entryKey(gameDir: string, versionId: string): string {
  const dir = resolve(gameDir)
  const raw = `${process.platform === 'win32' ? dir.toLowerCase() : dir}\0${versionId}`
  return createHash('sha256').update(raw).digest('hex')
}

type TrustData = Record<string, { fingerprint: string; time: number }>

let cache: TrustData | null = null
let queue: Promise<unknown> = Promise.resolve()

async function load(): Promise<TrustData> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(TRUST_FILE, 'utf-8')) as unknown
    const data: TrustData = Object.create(null)
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const entry = value as { fingerprint?: unknown; time?: unknown }
        if (
          /^[0-9a-f]{64}$/.test(key) &&
          entry &&
          typeof entry.fingerprint === 'string' &&
          /^[0-9a-f]{64}$/.test(entry.fingerprint)
        ) {
          data[key] = { fingerprint: entry.fingerprint, time: typeof entry.time === 'number' ? entry.time : 0 }
        }
      }
    }
    cache = data
  } catch {
    cache = Object.create(null) as TrustData
  }
  return cache
}

async function save(data: TrustData): Promise<void> {
  // 记录太多时去掉最旧的
  const keys = Object.keys(data)
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => data[a].time - data[b].time)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete data[key])
  }
  await mkdir(dirname(TRUST_FILE), { recursive: true })
  const temp = `${TRUST_FILE}.${randomUUID().slice(0, 8)}.tmp`
  try {
    await writeFile(temp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
    await rename(temp, TRUST_FILE)
  } catch (e) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw e
  }
}

/** 这个版本当前的敏感设置是否已被玩家认可（没有敏感设置时总是认可） */
export async function isVersionConfigTrusted(
  gameDir: string,
  versionId: string,
  config: VersionConfig
): Promise<boolean> {
  const fingerprint = sensitiveFingerprint(config)
  if (!fingerprint) return true
  const data = await load()
  return data[entryKey(gameDir, versionId)]?.fingerprint === fingerprint
}

/** 记录玩家认可的设置（保存排队进行，不会互相覆盖） */
export function trustVersionConfig(gameDir: string, versionId: string, config: VersionConfig): Promise<void> {
  const run = queue
    .catch(() => undefined)
    .then(async () => {
      const data = await load()
      const key = entryKey(gameDir, versionId)
      const fingerprint = sensitiveFingerprint(config)
      if (!fingerprint) {
        if (!(key in data)) return
        delete data[key]
      } else {
        data[key] = { fingerprint, time: Date.now() }
      }
      await save(data)
    })
  queue = run
  return run
}

/** 重命名 / 复制版本时，原版本认可过的设置在新名字下继续有效 */
export async function copyVersionTrust(
  gameDir: string,
  fromId: string,
  toId: string,
  config: VersionConfig
): Promise<void> {
  if (await isVersionConfigTrusted(gameDir, fromId, config)) await trustVersionConfig(gameDir, toId, config)
}

/**
 * 启动前确认：敏感设置没有被认可过时弹窗列出，玩家同意后记录下来。
 * 返回 false 表示玩家取消启动
 */
export async function confirmVersionConfig(
  gameDir: string,
  versionId: string,
  config: VersionConfig
): Promise<boolean> {
  if (await isVersionConfigTrusted(gameDir, versionId, config)) return true
  const detail = sensitiveFields(config)
    .map((f) => {
      const value = f.value.trim().replace(/\r?\n/g, ' ⏎ ')
      return `【${f.label}】${value.length > 300 ? `${value.slice(0, 300)}…` : value}`
    })
    .join('\n\n')
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: '确认版本设置',
    message: `版本「${versionId}」带有会在你电脑上运行程序的设置`,
    detail:
      `这些设置不是在本启动器里设置或确认过的，可能来自别人分享的版本文件夹或整合包。` +
      `只有你信任来源时才继续：\n\n${detail}\n\n确认后下次启动不再询问；内容变化时会再次询问。`,
    buttons: ['取消启动', '我信任这些设置，继续启动'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (response !== 1) return false
  await trustVersionConfig(gameDir, versionId, config)
  return true
}
