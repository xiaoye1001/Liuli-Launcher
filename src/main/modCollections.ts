import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { identifyEnabledMods, installedProjectIds, installFromModrinth } from './modrinth'
import { assertGameStopped, modsContextOf } from './mods'
import type { ModCollection, PerformanceModResult } from '../shared/types'

/**
 * 我的常用模组合集：把一个版本里（Modrinth 上有的）已启用模组存成合集，装到别的版本时按那个版本的
 * 游戏版本和加载器下载合适的版本，自动安装前置。保存在启动器数据文件夹的 mod-collections.json
 */
const FILE = join(app.getPath('userData'), 'mod-collections.json')
const MAX_COLLECTIONS = 50
const MAX_MODS = 300

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

function cleanName(name: unknown): string {
  return typeof name === 'string'
    ? name
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 30)
    : ''
}

async function load(): Promise<ModCollection[]> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (c): c is ModCollection =>
          !!c &&
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          Number.isFinite(c.createdAt) &&
          Array.isArray(c.mods)
      )
      .map((c) => ({
        id: c.id,
        name: cleanName(c.name) || '模组合集',
        createdAt: c.createdAt,
        minecraftVersion: typeof c.minecraftVersion === 'string' ? c.minecraftVersion : '',
        loader: typeof c.loader === 'string' ? c.loader : '',
        mods: c.mods
          .filter((m) => m && typeof m.projectId === 'string' && /^[A-Za-z0-9]{1,32}$/.test(m.projectId))
          .map((m) => ({
            projectId: m.projectId,
            title: typeof m.title === 'string' ? m.title.slice(0, 100) : m.projectId
          }))
          .slice(0, MAX_MODS)
      }))
      .slice(0, MAX_COLLECTIONS)
  } catch {
    return []
  }
}

async function save(list: ModCollection[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  await writeFile(tmp, JSON.stringify(list, null, 2), 'utf-8')
  await rename(tmp, FILE)
}

export function listModCollections(): Promise<ModCollection[]> {
  return serialized(load)
}

/** 把这个版本已启用的模组存为合集；返回保存的合集和 Modrinth 上没有、没能保存的文件 */
export async function saveModCollection(
  versionId: string,
  name: string
): Promise<{ collection: ModCollection; unknown: string[] }> {
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader || ctx.loader === 'optifine') throw new Error('这个版本没有模组加载器，没有可以保存的模组')
  const { projects, unknown } = await identifyEnabledMods(versionId)
  if (projects.length === 0) {
    throw new Error(
      unknown.length > 0 ? '这个版本的模组都不是从 Modrinth 下载的，无法保存为合集' : '这个版本没有已启用的模组'
    )
  }
  const collection: ModCollection = {
    id: randomUUID(),
    name: cleanName(name) || `${versionId} 的模组`,
    createdAt: Date.now(),
    minecraftVersion: ctx.minecraftVersion,
    loader: ctx.loader,
    mods: projects.slice(0, MAX_MODS)
  }
  return serialized(async () => {
    const list = await load()
    if (list.length >= MAX_COLLECTIONS) throw new Error(`最多保存 ${MAX_COLLECTIONS} 个合集，请先删除一些`)
    await save([collection, ...list])
    return { collection, unknown }
  })
}

/**
 * 导入合集（启动器设置导入用）：逐个检查后加进来，名字和模组都相同的合集跳过；返回加入的个数
 */
export function importModCollections(raw: unknown): Promise<{ added: number; skipped: number }> {
  return serialized(async () => {
    const list = await load()
    let added = 0
    let skipped = 0
    for (const item of Array.isArray(raw) ? raw.slice(0, MAX_COLLECTIONS) : []) {
      if (!item || typeof item !== 'object') continue
      const c = item as Record<string, unknown>
      const mods = (Array.isArray(c.mods) ? c.mods : [])
        .filter(
          (m): m is { projectId: string; title?: unknown } =>
            !!m && typeof m.projectId === 'string' && /^[A-Za-z0-9]{1,32}$/.test(m.projectId)
        )
        .map((m) => ({
          projectId: m.projectId,
          title: typeof m.title === 'string' ? m.title.slice(0, 100) : m.projectId
        }))
        .slice(0, MAX_MODS)
      const name = cleanName(c.name) || '模组合集'
      if (mods.length === 0) continue
      const key = mods.map((m) => m.projectId).join(',')
      if (list.some((e) => e.name === name && e.mods.map((m) => m.projectId).join(',') === key)) {
        skipped++
        continue
      }
      if (list.length >= MAX_COLLECTIONS) {
        skipped++
        continue
      }
      list.push({
        id: randomUUID(),
        name,
        createdAt: Number.isFinite(c.createdAt) ? Number(c.createdAt) : Date.now(),
        minecraftVersion: typeof c.minecraftVersion === 'string' ? c.minecraftVersion.slice(0, 32) : '',
        loader: typeof c.loader === 'string' ? c.loader.slice(0, 16) : '',
        mods
      })
      added++
    }
    if (added > 0) await save(list)
    return { added, skipped }
  })
}

export function deleteModCollection(id: string): Promise<void> {
  return serialized(async () => {
    const list = await load()
    await save(list.filter((c) => c.id !== id))
  })
}

export function renameModCollection(id: string, name: string): Promise<void> {
  const next = cleanName(name)
  if (!next) throw new Error('请输入合集名称')
  return serialized(async () => {
    const list = await load()
    const target = list.find((c) => c.id === id)
    if (!target) throw new Error('找不到这个合集')
    target.name = next
    await save(list)
  })
}

/** 把合集装到这个版本：已经装了的跳过，没有适用版本的列出来，一个失败不影响其他 */
export async function applyModCollection(versionId: string, id: string): Promise<PerformanceModResult[]> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader || ctx.loader === 'optifine') {
    throw new Error('原版不能安装模组：请先在「下载」页安装带 Fabric、Forge 或 NeoForge 的版本')
  }
  const collection = (await listModCollections()).find((c) => c.id === id)
  if (!collection) throw new Error('找不到这个合集')
  const installed = await installedProjectIds(versionId)
  const results: PerformanceModResult[] = []
  for (const mod of collection.mods) {
    if (installed.has(mod.projectId)) {
      results.push({ name: mod.title, status: 'already' })
      continue
    }
    try {
      const result = await installFromModrinth(versionId, mod.projectId)
      for (const m of result.installed) installed.add(m.projectId)
      const deps = result.installed.filter((m) => m.dependency).map((m) => m.title)
      results.push({
        name: mod.title,
        status: 'installed',
        detail: deps.length > 0 ? `前置：${deps.join('、')}` : undefined
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      results.push(
        /没有适用于/.test(message)
          ? { name: mod.title, status: 'unavailable', detail: `没有适用于 ${ctx.minecraftVersion} 的版本` }
          : { name: mod.title, status: 'failed', detail: message }
      )
    }
  }
  return results
}
