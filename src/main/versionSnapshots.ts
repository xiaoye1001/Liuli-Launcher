import { randomBytes } from 'crypto'
import { cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { assertGameStopped, modsContextOf } from './mods'
import type { VersionSnapshot } from '../shared/types'

/**
 * 版本快照：把一个版本的模组、模组配置和游戏设置复制一份，改坏了可以一键恢复。
 * 保存在游戏目录的 liuli-snapshots 文件夹（不隔离的版本共用根目录的 mods，也共用快照）；不包含存档
 */
export const SNAPSHOTS_DIR = 'liuli-snapshots'
/** 快照包含的内容（不存在的也会记录，恢复时同样不存在） */
const TRACKED = ['mods', 'config', 'defaultconfigs', 'options.txt', 'optionsof.txt', 'optionsshaders.txt']
const META = 'liuli-snapshot.json'
/** 手动创建的快照最多保留几个 */
const MAX_MANUAL = 10
/** 恢复前自动保存的快照最多保留几个（旧的自动删除） */
const MAX_AUTO = 3
const ID_RE = /^[a-z0-9]+-[a-f0-9]{6}$/

const cleanName = (name: unknown): string =>
  typeof name === 'string'
    ? name
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 40)
    : ''

async function rootOf(versionId: string): Promise<{ gamePath: string; root: string }> {
  const { dir } = await modsContextOf(versionId)
  const gamePath = dirname(dir)
  return { gamePath, root: join(gamePath, SNAPSHOTS_DIR) }
}

function assertId(id: string): void {
  if (!ID_RE.test(id)) throw new Error('无效的快照')
}

const exists = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  )

/** 是不是快捷方式（符号链接）：例如有人把 mods 链接到别的地方共用，快照不碰它 */
const isLink = (path: string): Promise<boolean> =>
  lstat(path).then(
    (info) => info.isSymbolicLink(),
    () => false
  )

/** 创建、恢复、删除排队进行，同时点两次不会互相干扰 */
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

/** 最近一次恢复放回去的模组和它们的修改时间（修复向导用来区分「恢复的」和「新加的」模组） */
const RESTORE_RECORD = 'last-restore.json'

/**
 * 恢复快照放回去的模组：文件名（不带 .disabled）→ 修改时间。这些文件是复制出来的新文件，创建时间是恢复的时间，
 * 但它们不是新加的模组，修复向导看修改时间就行
 */
export async function restoredModTimes(modsDir: string): Promise<Map<string, number>> {
  try {
    const raw = JSON.parse(await readFile(join(dirname(modsDir), SNAPSHOTS_DIR, RESTORE_RECORD), 'utf-8')) as {
      mods?: Record<string, unknown>
    }
    return new Map(
      Object.entries(raw.mods ?? {}).filter(
        (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])
      )
    )
  } catch {
    return new Map()
  }
}

/** 文件夹里所有文件的大小和模组个数（不跟随快捷方式） */
async function measure(path: string): Promise<number> {
  const info = await lstat(path).catch(() => null)
  if (!info || info.isSymbolicLink()) return 0
  if (!info.isDirectory()) return info.size
  let total = 0
  for (const name of await readdir(path).catch(() => [] as string[])) total += await measure(join(path, name))
  return total
}

/** 复制时跳过快捷方式（符号链接），不把 mods 文件夹以外的东西带进来；保留文件的修改时间 */
async function copyItem(from: string, to: string): Promise<void> {
  await cp(from, to, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    filter: async (src) => !(await lstat(src)).isSymbolicLink()
  })
}

async function readMeta(dir: string): Promise<VersionSnapshot | null> {
  try {
    const raw = JSON.parse(await readFile(join(dir, META), 'utf-8')) as Partial<VersionSnapshot>
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id) || !Number.isFinite(raw.createdAt)) return null
    return {
      id: raw.id,
      name: cleanName(raw.name) || '快照',
      createdAt: Number(raw.createdAt),
      auto: raw.auto === true,
      versionId: typeof raw.versionId === 'string' ? raw.versionId.slice(0, 255) : '',
      modCount: Number.isFinite(raw.modCount) ? Number(raw.modCount) : 0,
      bytes: Number.isFinite(raw.bytes) ? Number(raw.bytes) : 0,
      items: Array.isArray(raw.items) ? raw.items.filter((i): i is string => TRACKED.includes(i as string)) : []
    }
  } catch {
    return null
  }
}

/** 快照列表（新的在前） */
export async function listSnapshots(versionId: string): Promise<VersionSnapshot[]> {
  const { root } = await rootOf(versionId)
  const list: VersionSnapshot[] = []
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (!ID_RE.test(name)) continue
    const meta = await readMeta(join(root, name))
    if (meta && meta.id === name) list.push(meta)
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

async function createIn(
  versionId: string,
  gamePath: string,
  root: string,
  name: string,
  auto: boolean
): Promise<VersionSnapshot> {
  const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const temp = join(root, `.creating-${id}`)
  await mkdir(temp, { recursive: true })
  try {
    const items: string[] = []
    for (const item of TRACKED) {
      if (!(await exists(join(gamePath, item))) || (await isLink(join(gamePath, item)))) continue
      await copyItem(join(gamePath, item), join(temp, item))
      items.push(item)
    }
    const mods = await readdir(join(temp, 'mods')).catch(() => [] as string[])
    const snapshot: VersionSnapshot = {
      id,
      name,
      createdAt: Date.now(),
      auto,
      versionId,
      modCount: mods.filter((f) => /\.jar(\.disabled)?$/.test(f)).length,
      bytes: await measure(temp),
      items
    }
    await writeFile(join(temp, META), JSON.stringify(snapshot, null, 2), 'utf-8')
    await rename(temp, join(root, id))
    return snapshot
  } catch (e) {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
    throw new Error(`创建快照失败：${(e as Error).message}`)
  }
}

/** 创建快照 */
export function createSnapshot(versionId: string, name: string): Promise<VersionSnapshot> {
  return serialized(() => createUnlocked(versionId, name))
}

async function createUnlocked(versionId: string, name: string): Promise<VersionSnapshot> {
  const { gamePath, root } = await rootOf(versionId)
  const manual = (await listSnapshots(versionId)).filter((s) => !s.auto)
  if (manual.length >= MAX_MANUAL) throw new Error(`最多保存 ${MAX_MANUAL} 个快照，请先删除一些`)
  const label = cleanName(name) || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
  return createIn(versionId, gamePath, root, label, false)
}

/** 恢复快照：先自动保存现在的状态，再把快照里的内容换回来；返回自动保存的快照 */
export function restoreSnapshot(versionId: string, id: string): Promise<VersionSnapshot> {
  return serialized(() => restoreUnlocked(versionId, id))
}

async function restoreUnlocked(versionId: string, id: string): Promise<VersionSnapshot> {
  assertId(id)
  assertGameStopped(versionId)
  const { gamePath, root } = await rootOf(versionId)
  const source = join(root, id)
  const meta = await readMeta(source)
  if (!meta || meta.id !== id) throw new Error('找不到这个快照')
  // 恢复前自动保存一份，恢复错了还能换回来
  const backup = await createIn(
    versionId,
    gamePath,
    root,
    meta.auto ? '恢复前自动保存' : `恢复「${meta.name}」前自动保存`,
    true
  )
  // 先把快照复制到旁边，全部复制成功后再替换，替换失败时尽量换回原来的
  const staging = join(root, `.restoring-${id}`)
  const old = join(root, `.replaced-${id}`)
  await rm(staging, { recursive: true, force: true })
  await rm(old, { recursive: true, force: true })
  // 现在是快捷方式的（例如链接到别处共用的 mods）不动
  const linked = new Set<string>()
  for (const item of TRACKED) if (await isLink(join(gamePath, item))) linked.add(item)
  const items = meta.items.filter((item) => !linked.has(item))
  /** 换回原来的内容失败时保留 old 文件夹，不删掉原来的文件 */
  let keepOld = false
  try {
    await mkdir(staging, { recursive: true })
    for (const item of items) await copyItem(join(source, item), join(staging, item))
    await mkdir(old, { recursive: true })
    assertGameStopped(versionId)
    const moved: string[] = []
    const placed: string[] = []
    try {
      for (const item of TRACKED) {
        if (linked.has(item)) continue
        if (await exists(join(gamePath, item))) {
          await rename(join(gamePath, item), join(old, item))
          moved.push(item)
        }
      }
      for (const item of items) {
        await rename(join(staging, item), join(gamePath, item))
        placed.push(item)
      }
    } catch (e) {
      for (const item of placed) await rm(join(gamePath, item), { recursive: true, force: true }).catch(() => undefined)
      for (const item of moved) {
        await rename(join(old, item), join(gamePath, item)).catch(() => {
          keepOld = true
        })
      }
      throw new Error(
        keepOld
          ? `没能恢复，原来的文件也没能全部放回去：它们在 ${old}，也可以恢复「${backup.name}」这个快照找回来`
          : `有文件正在被使用，没能恢复（原来的内容没有改动）：${(e as Error).message}`
      )
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    if (!keepOld) await rm(old, { recursive: true, force: true }).catch(() => undefined)
  }
  // 记下放回去的模组，修复向导不把它们当成新加的模组
  const modsDir = join(gamePath, 'mods')
  const mods: Record<string, number> = {}
  if (items.includes('mods')) {
    for (const name of await readdir(modsDir).catch(() => [] as string[])) {
      const info = await stat(join(modsDir, name)).catch(() => null)
      // 按去掉 .disabled 的名字记：恢复后再打开或关闭这个模组也认得出来
      if (info?.isFile()) mods[name.replace(/\.disabled$/, '')] = info.mtimeMs
    }
  }
  await writeFile(join(root, RESTORE_RECORD), JSON.stringify({ at: Date.now(), mods }), 'utf-8').catch(() => undefined)
  // 自动保存的快照只留最近几个
  const autos = (await listSnapshots(versionId)).filter((s) => s.auto)
  for (const s of autos.slice(MAX_AUTO))
    await rm(join(root, s.id), { recursive: true, force: true }).catch(() => undefined)
  return backup
}

export function deleteSnapshot(versionId: string, id: string): Promise<void> {
  return serialized(async () => {
    assertId(id)
    const { root } = await rootOf(versionId)
    if (!(await stat(join(root, id)).catch(() => null))) return
    await rm(join(root, id), { recursive: true, force: true })
  })
}
