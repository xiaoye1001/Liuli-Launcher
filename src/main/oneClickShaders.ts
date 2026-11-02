import { mkdir, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getProjectVersions, installFromModrinth, installResource } from './modrinth'
import { assertGameStopped, listMods, modsContextOf } from './mods'
import { setActiveShader } from './resources'
import type { PerformanceModResult, ShaderChoice, ShaderSetupResult } from '../shared/types'

/**
 * 一键光影：按版本的加载器装上光影加载器和对应的渲染优化模组（Fabric / Quilt：Iris + Sodium；
 * NeoForge：Iris + Sodium，没有时 Oculus + Embeddium；Forge：Oculus + Embeddium / Rubidium；
 * 已经有 OptiFine 时直接用它），再下载光影包并开启
 */

/** 可选的光影包 */
const SHADER_PACKS: Record<ShaderChoice, { slug: string; name: string }> = {
  quality: { slug: 'complementary-reimagined', name: 'Complementary Reimagined' },
  fast: { slug: 'makeup-ultra-fast-shaders', name: 'MakeUp Ultra Fast' }
}

type ShaderLoader = 'iris' | 'oculus' | 'optifine'

interface Plan {
  loader: Exclude<ShaderLoader, 'optifine'>
  /** 光影加载器的 Modrinth 项目和装好后的模组 ID */
  slug: string
  modIds: string[]
  /** 需要的渲染优化模组：按顺序找第一个有适用版本的 */
  renderers: { slug: string; modId: string }[]
}

const IRIS: Plan = { loader: 'iris', slug: 'iris', modIds: ['iris'], renderers: [{ slug: 'sodium', modId: 'sodium' }] }
const OCULUS: Plan = {
  loader: 'oculus',
  slug: 'oculus',
  modIds: ['oculus'],
  renderers: [
    { slug: 'embeddium', modId: 'embeddium' },
    { slug: 'rubidium', modId: 'rubidium' }
  ]
}

const NAMES: Record<ShaderLoader, string> = { iris: 'Iris', oculus: 'Oculus', optifine: 'OptiFine' }

/** 光影加载器的设置文件；还没有进过游戏时不存在，先建一个只有光影设置的（其他设置游戏会补上默认值） */
const CONFIG_FILES: Record<ShaderLoader, string[]> = {
  iris: ['config', 'iris.properties'],
  oculus: ['config', 'oculus.properties'],
  optifine: ['optionsshaders.txt']
}

export async function ensureShaderConfig(gameDir: string, loader: ShaderLoader, fileName: string): Promise<void> {
  const path = join(gameDir, ...CONFIG_FILES[loader])
  if (await stat(path).catch(() => null)) return
  await mkdir(dirname(path), { recursive: true })
  const lines = loader === 'optifine' ? [`shaderPack=${fileName}`] : ['enableShaders=true', `shaderPack=${fileName}`]
  await writeFile(path, lines.join('\n') + '\n', { encoding: 'utf-8', flag: 'wx' }).catch(() => undefined)
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const unavailable = (e: unknown): boolean => /没有适用于/.test(message(e))

export async function setupShaders(versionId: string, choice: ShaderChoice): Promise<ShaderSetupResult> {
  if (!Object.prototype.hasOwnProperty.call(SHADER_PACKS, choice)) throw new Error('无效的光影包')
  const pack = SHADER_PACKS[choice]
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  const gameDir = dirname(ctx.dir)
  const steps: PerformanceModResult[] = []
  const mods = ctx.loader && ctx.loader !== 'optifine' ? (await listMods(versionId)).mods : []
  const installed = new Set(mods.map((m) => m.modId.toLowerCase()))
  const hasOptiFine =
    ctx.loader === 'optifine' || mods.some((m) => /optifine/i.test(m.fileName) || m.modId.toLowerCase() === 'optifine')

  let loader: ShaderLoader
  if (hasOptiFine) {
    loader = 'optifine'
    steps.push({ name: '光影加载器', status: 'already', detail: 'OptiFine 自带光影功能' })
  } else if (!ctx.loader) {
    throw new Error('原版不能直接使用光影：请先在「下载」页安装带 Fabric、NeoForge、Forge 或 OptiFine 的版本')
  } else {
    let plans =
      ctx.loader === 'fabric' || ctx.loader === 'quilt' ? [IRIS] : ctx.loader === 'neoforge' ? [IRIS, OCULUS] : [OCULUS]
    // 已经装了某一种渲染优化时优先用和它配套的光影加载器（Sodium 和 Embeddium 不能同时使用）
    plans = [...plans].sort(
      (a, b) =>
        Number(b.renderers.some((r) => installed.has(r.modId))) -
        Number(a.renderers.some((r) => installed.has(r.modId)))
    )
    let chosen = plans.find((p) => p.modIds.some((id) => installed.has(id)))
    if (chosen) {
      steps.push({ name: `光影加载器（${NAMES[chosen.loader]}）`, status: 'already' })
    } else {
      for (const plan of plans) {
        try {
          const result = await installFromModrinth(versionId, plan.slug)
          const deps = result.installed.filter((m) => m.dependency).map((m) => m.title)
          steps.push({
            name: `光影加载器（${NAMES[plan.loader]}）`,
            status: 'installed',
            detail: deps.length > 0 ? `前置：${deps.join('、')}` : undefined
          })
          chosen = plan
          break
        } catch (e) {
          if (unavailable(e)) continue
          steps.push({ name: `光影加载器（${NAMES[plan.loader]}）`, status: 'failed', detail: message(e) })
          return { steps, activated: false }
        }
      }
    }
    if (!chosen) {
      steps.push({
        name: '光影加载器',
        status: 'unavailable',
        detail: `Iris 和 Oculus 都没有适用于 ${ctx.minecraftVersion} 的版本`
      })
      return { steps, activated: false }
    }
    loader = chosen.loader
    // 渲染优化模组：光影加载器的前置里已经装了时跳过
    const current = new Set((await listMods(versionId)).mods.map((m) => m.modId.toLowerCase()))
    if (chosen.renderers.some((r) => current.has(r.modId))) {
      steps.push({ name: '渲染优化', status: 'already' })
    } else {
      let done = false
      for (const renderer of chosen.renderers) {
        try {
          const result = await installFromModrinth(versionId, renderer.slug)
          const main = result.installed.find((m) => !m.dependency)
          steps.push({ name: '渲染优化', status: 'installed', detail: main?.title })
          done = true
          break
        } catch (e) {
          if (unavailable(e)) continue
          steps.push({ name: '渲染优化', status: 'failed', detail: message(e) })
          done = true
          break
        }
      }
      if (!done)
        steps.push({ name: '渲染优化', status: 'unavailable', detail: '没有适用的版本，光影可能需要它才能运行' })
    }
  }

  // 光影包：优先选标明支持这个游戏版本的正式版
  let fileName: string
  try {
    const versions = await getProjectVersions(pack.slug, 'shader')
    const shaderLoader = loader === 'optifine' ? 'optifine' : 'iris'
    const usable = versions.filter((v) => v.loaders.includes(shaderLoader))
    const pool = usable.length > 0 ? usable : versions
    const pick =
      pool.find((v) => v.versionType === 'release' && v.gameVersions.includes(ctx.minecraftVersion)) ??
      pool.find((v) => v.versionType === 'release') ??
      pool[0]
    if (!pick) throw new Error('没有可下载的版本')
    const result = await installResource({ versionId }, 'shader', pick.id)
    fileName = result.installed[0].fileName
    steps.push({ name: `光影包（${pack.name}）`, status: 'installed', detail: fileName })
  } catch (e) {
    steps.push({ name: `光影包（${pack.name}）`, status: 'failed', detail: message(e) })
    return { steps, activated: false }
  }

  // 开启光影
  try {
    await ensureShaderConfig(gameDir, loader, fileName)
    await setActiveShader(versionId, fileName)
    steps.push({ name: '开启光影', status: 'installed', detail: `下次进入游戏生效，可以在光影设置里调整` })
    return { steps, activated: true, shader: fileName }
  } catch (e) {
    steps.push({ name: '开启光影', status: 'failed', detail: message(e) })
    return { steps, activated: false, shader: fileName }
  }
}
