import { installFromModrinth } from './modrinth'
import { assertGameStopped, listMods, modsContextOf } from './mods'
import type { PerformanceModResult } from '../shared/types'

/**
 * 一键性能优化：给模组版本装上常用的优化模组（从 Modrinth 下载，自动安装前置模组）。
 * 已经装了的跳过；有 OptiFine 等其他渲染优化模组时不装 Sodium（不能同时使用）；
 * 没有适用于这个游戏版本和加载器的版本时跳过
 */
interface Candidate {
  name: string
  /** Modrinth 项目标识，按顺序找第一个有适用版本的 */
  slugs: string[]
  /** 安装后的模组 ID（判断是否已经装了） */
  modIds: string[]
  /** 渲染优化：和 OptiFine 等不能同时使用 */
  renderer?: boolean
}

const CANDIDATES: Candidate[] = [
  {
    name: '渲染优化（Sodium / Embeddium）',
    slugs: ['sodium', 'embeddium'],
    modIds: ['sodium', 'embeddium'],
    renderer: true
  },
  { name: 'Lithium（游戏逻辑优化）', slugs: ['lithium'], modIds: ['lithium'] },
  { name: 'FerriteCore（减少内存占用）', slugs: ['ferrite-core'], modIds: ['ferritecore'] },
  { name: 'ModernFix（加快启动、减少内存）', slugs: ['modernfix'], modIds: ['modernfix'] },
  { name: 'ImmediatelyFast（界面和文字渲染优化）', slugs: ['immediatelyfast'], modIds: ['immediatelyfast'] },
  { name: 'Entity Culling（不渲染看不见的实体）', slugs: ['entityculling'], modIds: ['entityculling'] },
  { name: 'Dynamic FPS（切到后台时降低帧率）', slugs: ['dynamic-fps'], modIds: ['dynamic_fps', 'dynamicfps'] }
]

/** 已经装了这些模组时不装 Sodium 系的渲染优化 */
const RENDERER_CONFLICTS = ['optifine', 'optifabric', 'rubidium', 'magnesium', 'sodium', 'embeddium']

export async function installPerformanceMods(versionId: string): Promise<PerformanceModResult[]> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader) {
    throw new Error('原版不能安装模组：请先在「下载」页安装带 Fabric、Forge 或 NeoForge 的版本')
  }
  const mods = (await listMods(versionId)).mods
  const installedIds = new Set(mods.map((m) => m.modId.toLowerCase()))
  const hasOptiFine = mods.some((m) => /optifine/i.test(m.fileName) || m.modId.toLowerCase() === 'optifine')

  const results: PerformanceModResult[] = []
  for (const candidate of CANDIDATES) {
    if (candidate.modIds.some((id) => installedIds.has(id))) {
      results.push({ name: candidate.name, status: 'already' })
      continue
    }
    if (candidate.renderer && (hasOptiFine || RENDERER_CONFLICTS.some((id) => installedIds.has(id)))) {
      results.push({
        name: candidate.name,
        status: 'skipped',
        detail: '已经装了 OptiFine 或其他渲染优化模组，不能同时使用'
      })
      continue
    }
    let done: PerformanceModResult | null = null
    for (const slug of candidate.slugs) {
      try {
        const result = await installFromModrinth(versionId, slug)
        const main = result.installed.find((m) => !m.dependency)
        const deps = result.installed.filter((m) => m.dependency).map((m) => m.title)
        done = {
          name: candidate.name,
          status: 'installed',
          detail: [main?.title, deps.length > 0 ? `前置：${deps.join('、')}` : ''].filter(Boolean).join(' · ')
        }
        break
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        // 这个项目没有适用的版本：试下一个（例如 Forge 上没有 Sodium，改用 Embeddium）
        if (/没有适用于/.test(message)) continue
        done = { name: candidate.name, status: 'failed', detail: message }
        break
      }
    }
    results.push(
      done ?? { name: candidate.name, status: 'unavailable', detail: `没有适用于 ${ctx.minecraftVersion} 的版本` }
    )
  }
  return results
}
