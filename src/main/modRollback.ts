import { shell } from 'electron'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { assertGameStopped, modsContextOf } from './mods'
import type { ModRollback } from '../shared/types'

/**
 * 模组更新后回滚：更新前把旧文件复制到游戏目录的 liuli-mod-backup 文件夹（不在 mods 里，游戏不会加载），
 * 记录在 updates.json；新版本有问题时可以退回旧文件。备份保留 30 天
 */
export const MOD_BACKUP_DIR = 'liuli-mod-backup'
const MANIFEST = 'updates.json'
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 100

interface Entry {
  id: string
  /** 更新后的文件名 */
  newFile: string
  /** 更新前的文件名 */
  oldFile: string
  /** 备份文件夹里的文件名 */
  backup: string
  at: number
}

/** 同一个备份文件夹的读写排队进行 */
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(store: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(store) ?? Promise.resolve()
  const next = previous.then(task, task)
  const settled = next.catch(() => undefined)
  queues.set(store, settled)
  void settled.then(() => {
    if (queues.get(store) === settled) queues.delete(store)
  })
  return next
}

const storeOf = (modsDir: string): string => join(dirname(modsDir), MOD_BACKUP_DIR)
const stripDisabled = (name: string): string => name.replace(/\.disabled$/, '')
const safeName = (name: unknown): name is string =>
  typeof name === 'string' && !!name && name === basename(name) && !name.includes('\\') && name !== '..'

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() ?? false
}

async function readManifest(store: string): Promise<Entry[]> {
  try {
    const raw = JSON.parse(await readFile(join(store, MANIFEST), 'utf-8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (e): e is Entry =>
        !!e &&
        typeof e.id === 'string' &&
        safeName(e.newFile) &&
        safeName(e.oldFile) &&
        safeName(e.backup) &&
        e.backup !== MANIFEST &&
        Number.isFinite(e.at)
    )
  } catch {
    return []
  }
}

async function writeManifest(store: string, entries: Entry[]): Promise<void> {
  await mkdir(store, { recursive: true })
  const file = join(store, MANIFEST)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(entries, null, 2), 'utf-8')
  await rename(tmp, file)
}

/** 更新前备份旧文件，返回备份文件名；备份失败时返回 null（照常更新，只是不能回滚） */
export async function backupBeforeUpdate(modsDir: string, fileName: string): Promise<string | null> {
  const store = storeOf(modsDir)
  try {
    await mkdir(store, { recursive: true })
    const backup = `${randomUUID().slice(0, 8)}-${stripDisabled(fileName)}`
    await copyFile(join(modsDir, fileName), join(store, backup))
    return backup
  } catch {
    return null
  }
}

/** 更新失败时放回旧文件（新旧文件同名时，失败的下载可能已经把旧文件弄坏了） */
export async function restoreBackupFile(modsDir: string, backup: string, fileName: string): Promise<void> {
  await copyFile(join(storeOf(modsDir), backup), join(modsDir, fileName))
}

/** 更新失败：删掉这次的备份 */
export async function discardBackup(modsDir: string, backup: string): Promise<void> {
  await rm(join(storeOf(modsDir), backup), { force: true }).catch(() => undefined)
}

/** 记录一次更新，同时清理 30 天前的备份 */
export async function recordUpdate(modsDir: string, newFile: string, oldFile: string, backup: string): Promise<void> {
  const store = storeOf(modsDir)
  await serialized(store, async () => {
    const now = Date.now()
    const entries = [...(await readManifest(store)), { id: randomUUID(), newFile, oldFile, backup, at: now }]
    const keep = entries.filter((e) => now - e.at < KEEP_MS).slice(-MAX_ENTRIES)
    const kept = new Set(keep.map((e) => e.backup))
    for (const e of entries)
      if (!kept.has(e.backup)) await rm(join(store, e.backup), { force: true }).catch(() => undefined)
    // 没有记录的备份（例如更新时启动器被关闭）：一小时前的删掉
    for (const name of await readdir(store).catch(() => [] as string[])) {
      if (name === MANIFEST || kept.has(name)) continue
      const info = await stat(join(store, name)).catch(() => null)
      if (info?.isFile() && now - info.mtimeMs > 60 * 60 * 1000) await rm(join(store, name), { force: true })
    }
    await writeManifest(store, keep)
  })
}

/** 当前模组文件（启用或禁用）：找不到时为 null */
async function currentFileOf(modsDir: string, newFile: string): Promise<string | null> {
  const base = stripDisabled(newFile)
  for (const name of [newFile, base, `${base}.disabled`]) {
    if (await exists(join(modsDir, name))) return name
  }
  return null
}

/** 可以退回的模组更新：更新后的文件还在、备份也还在；同一个模组只列最近一次更新 */
export async function listModRollbacks(versionId: string): Promise<ModRollback[]> {
  const { dir } = await modsContextOf(versionId)
  const store = storeOf(dir)
  const entries = (await readManifest(store)).sort((a, b) => b.at - a.at)
  const result: ModRollback[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (Date.now() - e.at >= KEEP_MS) continue
    const current = await currentFileOf(dir, e.newFile)
    if (!current || seen.has(stripDisabled(current))) continue
    if (!(await exists(join(store, e.backup)))) continue
    seen.add(stripDisabled(current))
    result.push({ id: e.id, currentFile: current, oldFile: stripDisabled(e.oldFile), at: e.at })
  }
  return result
}

/**
 * 退回更新前的文件：更新后的文件移到回收站，旧文件放回 mods（保持当前的启用 / 禁用状态）。
 * 返回放回的文件名
 */
export async function rollbackModUpdate(versionId: string, id: string): Promise<string> {
  assertGameStopped(versionId)
  const { dir } = await modsContextOf(versionId)
  const store = storeOf(dir)
  return serialized(store, async () => {
    const entries = await readManifest(store)
    const entry = entries.find((e) => e.id === id)
    if (!entry) throw new Error('找不到这次更新的记录')
    const backupPath = join(store, entry.backup)
    if (!(await exists(backupPath))) throw new Error('更新前的文件备份已经不在了')
    const current = await currentFileOf(dir, entry.newFile)
    if (!current) throw new Error('更新后的模组文件已经不在了')
    const target = stripDisabled(entry.oldFile) + (current.endsWith('.disabled') ? '.disabled' : '')
    if (target !== current && (await exists(join(dir, target)))) {
      throw new Error(`已经有一个同名的模组文件：${target}，请先删除它`)
    }
    // 先复制到临时文件（不是 .jar，游戏不会加载），再移走新版本、改名，中途失败时 mods 里不会少文件
    const tmp = join(dir, `${stripDisabled(entry.oldFile)}.liuli-part`)
    await copyFile(backupPath, tmp)
    try {
      await shell.trashItem(join(dir, current))
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw e
    }
    await rename(tmp, join(dir, target))
    await rm(backupPath, { force: true }).catch(() => undefined)
    await writeManifest(
      store,
      entries.filter((e) => e.id !== id)
    )
    return target
  })
}
