import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { SeedFavorite } from '../shared/types'

/** 种子收藏夹：喜欢的世界种子，保存在启动器数据文件夹的 seed-favorites.json */
const FILE = join(app.getPath('userData'), 'seed-favorites.json')
const MAX_SEEDS = 200

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

const clean = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : ''

async function load(): Promise<SeedFavorite[]> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((s): s is SeedFavorite => !!s && typeof s.id === 'string' && Number.isFinite(s.createdAt))
      .map((s) => ({
        id: s.id,
        seed: clean(s.seed, 64),
        name: clean(s.name, 40),
        note: clean(s.note, 200),
        version: clean(s.version, 32),
        createdAt: s.createdAt
      }))
      .filter((s) => s.seed)
      .slice(0, MAX_SEEDS)
  } catch {
    return []
  }
}

async function save(list: SeedFavorite[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(`${FILE}.tmp`, JSON.stringify(list, null, 2), 'utf-8')
  await rename(`${FILE}.tmp`, FILE)
}

export function listSeedFavorites(): Promise<SeedFavorite[]> {
  return serialized(load)
}

type SeedInput = Partial<Pick<SeedFavorite, 'seed' | 'name' | 'note' | 'version'>>

/** 收藏种子（同一个种子和版本只收藏一次），返回新的列表 */
export function addSeedFavorite(input: SeedInput): Promise<SeedFavorite[]> {
  const seed = clean(input?.seed, 64)
  if (!seed) throw new Error('请输入种子')
  return serialized(async () => {
    const list = await load()
    const version = clean(input.version, 32)
    if (list.some((s) => s.seed === seed && s.version === version)) throw new Error('这个种子已经收藏过了')
    if (list.length >= MAX_SEEDS) throw new Error(`最多收藏 ${MAX_SEEDS} 个种子，请先删除一些`)
    const next: SeedFavorite = {
      id: randomUUID(),
      seed,
      name: clean(input.name, 40),
      note: clean(input.note, 200),
      version,
      createdAt: Date.now()
    }
    await save([next, ...list])
    return [next, ...list]
  })
}

/** 修改名称、备注和版本（种子本身不改） */
export function updateSeedFavorite(id: string, patch: SeedInput): Promise<SeedFavorite[]> {
  return serialized(async () => {
    const list = await load()
    const target = list.find((s) => s.id === id)
    if (!target) throw new Error('找不到这个种子')
    if (patch?.name !== undefined) target.name = clean(patch.name, 40)
    if (patch?.note !== undefined) target.note = clean(patch.note, 200)
    if (patch?.version !== undefined) target.version = clean(patch.version, 32)
    await save(list)
    return list
  })
}

export function deleteSeedFavorite(id: string): Promise<SeedFavorite[]> {
  return serialized(async () => {
    const list = (await load()).filter((s) => s.id !== id)
    await save(list)
    return list
  })
}
