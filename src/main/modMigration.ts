import { resolve } from 'path'
import { compatibleVersionNumber, identifyEnabledMods, installedProjectIds, installFromModrinth } from './modrinth'
import { assertGameStopped, modsContextOf, type ModsContext } from './mods'
import type { ModMigrationCheck, ModMigrationItem, PerformanceModResult } from '../shared/types'

/**
 * 模组版本迁移助手：换新的游戏版本时，检查这个版本已启用的模组（Modrinth 上有的）在目标版本上有没有
 * 适用的版本，再一键把有的装过去（自动安装前置）。不是从 Modrinth 下载的模组列出来，需要手动处理
 */
const ID_RE = /^[A-Za-z0-9]{1,32}$/
const MAX_MODS = 300
/** 同时查询的模组数 */
const CONCURRENCY = 6

async function contexts(versionId: string, targetId: string): Promise<{ source: ModsContext; target: ModsContext }> {
  if (versionId === targetId) throw new Error('请选择另一个版本')
  const [source, target] = await Promise.all([modsContextOf(versionId), modsContextOf(targetId)])
  if (!target.loader || target.loader === 'optifine') {
    throw new Error('目标版本没有模组加载器：请先在「下载」页安装带 Fabric、Forge 或 NeoForge 的版本')
  }
  if (resolve(source.dir) === resolve(target.dir)) throw new Error('这两个版本共用同一个 mods 文件夹，不需要迁移')
  return { source, target }
}

/** 检查已启用的模组在目标版本上有没有适用的版本 */
export async function checkModMigration(versionId: string, targetId: string): Promise<ModMigrationCheck> {
  const { source, target } = await contexts(versionId, targetId)
  const { projects, unknown } = await identifyEnabledMods(versionId)
  const installed = await installedProjectIds(targetId)
  const list = projects.slice(0, MAX_MODS)
  const items: ModMigrationItem[] = new Array(list.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const i = next++
      const p = list[i]
      if (installed.has(p.projectId)) {
        items[i] = { ...p, status: 'installed' }
        continue
      }
      try {
        const version = await compatibleVersionNumber(p.projectId, target)
        items[i] = version ? { ...p, status: 'available', version } : { ...p, status: 'unavailable' }
      } catch (e) {
        items[i] = { ...p, status: 'error', detail: e instanceof Error ? e.message : String(e) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))
  return {
    targetId,
    minecraftVersion: target.minecraftVersion,
    loader: target.loader ?? '',
    sameLoader: source.loader === target.loader,
    items,
    unknown
  }
}

/** 把选中的模组装到目标版本：已经装了的跳过，一个失败不影响其他 */
export async function applyModMigration(
  versionId: string,
  targetId: string,
  mods: { projectId: string; title: string }[]
): Promise<PerformanceModResult[]> {
  assertGameStopped(targetId)
  const { target } = await contexts(versionId, targetId)
  const wanted = (Array.isArray(mods) ? mods : [])
    .filter((m) => m && typeof m.projectId === 'string' && ID_RE.test(m.projectId))
    .map((m) => ({ projectId: m.projectId, title: typeof m.title === 'string' ? m.title.slice(0, 100) : m.projectId }))
    .slice(0, MAX_MODS)
  const installed = await installedProjectIds(targetId)
  const results: PerformanceModResult[] = []
  for (const mod of wanted) {
    if (installed.has(mod.projectId)) {
      results.push({ name: mod.title, status: 'already' })
      continue
    }
    try {
      const result = await installFromModrinth(targetId, mod.projectId)
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
          ? { name: mod.title, status: 'unavailable', detail: `没有适用于 ${target.minecraftVersion} 的版本` }
          : { name: mod.title, status: 'failed', detail: message }
      )
    }
  }
  return results
}
