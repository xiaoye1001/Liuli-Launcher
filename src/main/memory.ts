import { readdir, readFile, stat } from 'fs/promises'
import { freemem, totalmem } from 'os'
import { join } from 'path'
import type { MemoryFactor, MemoryPlan, ModLoader } from '../shared/types'

const STEP = 256
const MB = 1024 * 1024
/** 只按模组数量算时的上限 */
const MODS_CAP = 12288
/** 加上光影、材质包、渲染距离等之后的总上限 */
const TOTAL_CAP = 16384

function roundDown(value: number): number {
  return Math.floor(value / STEP) * STEP
}

function roundUp(value: number): number {
  return Math.ceil(value / STEP) * STEP
}

/** 游戏目录里会影响内存需求的情况 */
export interface MemoryUsage {
  /** 启用的模组数量 */
  mods: number
  /** 启用的模组文件总大小（MB） */
  modsMB: number
  /** 是否装了 Distant Horizons（远景渲染，需要很多内存） */
  distantHorizons: boolean
  /** 是否开着光影（Iris / Oculus / OptiFine） */
  shaders: boolean
  /** 启用的资源包总大小（MB），高清材质包会占用大量内存 */
  resourcePackMB: number
  /** 游戏里设置的渲染距离（区块），读不到时为 0 */
  renderDistance: number
}

const EMPTY_USAGE: MemoryUsage = {
  mods: 0,
  modsMB: 0,
  distantHorizons: false,
  shaders: false,
  resourcePackMB: 0,
  renderDistance: 0
}

/** 读取 key=value 格式的配置文件 */
async function readProperties(path: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  try {
    const text = await readFile(path, 'utf-8')
    for (const line of text.split(/\r?\n/)) {
      const index = line.indexOf('=')
      if (index > 0 && !line.startsWith('#')) result.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
    }
  } catch {
    // 文件不存在
  }
  return result
}

/** 统计 mods 文件夹里启用的模组（.jar，已禁用的 .jar.disabled 不算） */
async function scanMods(modsDir: string): Promise<Pick<MemoryUsage, 'mods' | 'modsMB' | 'distantHorizons'>> {
  try {
    const entries = await readdir(modsDir, { withFileTypes: true })
    const jars = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jar'))
    let bytes = 0
    for (const jar of jars) {
      bytes += (await stat(join(modsDir, jar.name)).catch(() => null))?.size ?? 0
    }
    return {
      mods: jars.length,
      modsMB: Math.round(bytes / MB),
      distantHorizons: jars.some((j) => /distant[-_ ]?horizons/i.test(j.name))
    }
  } catch {
    return { mods: 0, modsMB: 0, distantHorizons: false }
  }
}

/** 光影是否开着：Iris / Oculus 看 config 里的设置，OptiFine 看 optionsshaders.txt */
async function shadersEnabled(gamePath: string): Promise<boolean> {
  for (const file of ['iris.properties', 'oculus.properties']) {
    const props = await readProperties(join(gamePath, 'config', file))
    if (props.size > 0 && props.get('enableShaders') !== 'false' && (props.get('shaderPack') ?? '') !== '') return true
  }
  const optifine = (await readProperties(join(gamePath, 'optionsshaders.txt'))).get('shaderPack') ?? ''
  return optifine !== '' && optifine !== 'OFF' && optifine !== '(internal)'
}

/** 从 options.txt 读取渲染距离和启用的资源包大小 */
async function scanOptions(gamePath: string): Promise<Pick<MemoryUsage, 'renderDistance' | 'resourcePackMB'>> {
  let text = ''
  try {
    text = await readFile(join(gamePath, 'options.txt'), 'utf-8')
  } catch {
    return { renderDistance: 0, resourcePackMB: 0 }
  }
  const renderDistance = Number(/^renderDistance:(\d+)/m.exec(text)?.[1] ?? 0)
  let resourcePackMB = 0
  const packs = /^resourcePacks:(.*)$/m.exec(text)?.[1]
  if (packs) {
    try {
      const list = JSON.parse(packs) as unknown
      let bytes = 0
      for (const entry of Array.isArray(list) ? list : []) {
        // 资源包文件夹里的资源包写作 "file/名字"；名字只能是普通文件名
        if (typeof entry !== 'string' || !entry.startsWith('file/')) continue
        const name = entry.slice(5)
        if (!name || /[\\/]/.test(name) || name === '..') continue
        const info = await stat(join(gamePath, 'resourcepacks', name)).catch(() => null)
        if (info?.isFile()) bytes += info.size
      }
      resourcePackMB = Math.round(bytes / MB)
    } catch {
      // 格式不对时忽略
    }
  }
  return { renderDistance: Number.isFinite(renderDistance) ? renderDistance : 0, resourcePackMB }
}

/** 扫描版本的游戏目录 */
export async function scanMemoryUsage(gamePath: string, loader: ModLoader | undefined): Promise<MemoryUsage> {
  const modded = !!loader && loader !== 'optifine'
  const [mods, shaders, options] = await Promise.all([
    modded ? scanMods(join(gamePath, 'mods')) : Promise.resolve({ mods: 0, modsMB: 0, distantHorizons: false }),
    // 原版不能用光影
    loader ? shadersEnabled(gamePath) : Promise.resolve(false),
    scanOptions(gamePath)
  ])
  return { ...mods, shaders, ...options }
}

/**
 * 当前可用内存（MB）。macOS 的空闲内存不包括可以随时回收的缓存，数值总是很小，
 * 用它判断会导致总是分配过少，所以 macOS 上不按可用内存调整。
 */
function availableMemory(): number | null {
  return process.platform === 'darwin' ? null : Math.floor(freemem() / MB)
}

/** 游戏的小版本号：1.20.4 → 20；快照、新的版本号格式等无法识别时按最新版本处理 */
function minorOf(minecraftVersion: string | undefined): number {
  const match = /^1\.(\d+)/.exec(minecraftVersion ?? '')
  return match ? Number(match[1]) : 99
}

function formatMb(mb: number): string {
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(2))} GB` : `${mb} MB`
}

/**
 * 按模组数量算出的建议值。最大内存越大，Java 越倾向于先占满再回收，实际占用的内存也越多；
 * 太小又会频繁回收导致卡顿。这里按实际需要给出「够用而不多给」的值：
 * - 原版 / OptiFine：1.13 及以上 2 GB（与官方启动器相同），1.7 ~ 1.12 1.5 GB，更早 1 GB
 * - 模组版本：1.13 及以上 2.5 GB 起，1.12 及以下 2 GB 起；
 *   前 50 个模组每个加 32 MB，第 51 ~ 200 个每个加 24 MB，之后每个加 16 MB（大型整合包里很多是小模组），最多 12 GB
 */
export function recommendedMemory(loader: ModLoader | undefined, mods: number, minecraftVersion?: string): number {
  const minor = minorOf(minecraftVersion)
  // OptiFine 只是画质增强，按原版计算
  if (!loader || loader === 'optifine') return minor >= 13 ? 2048 : minor >= 7 ? 1536 : 1024
  const base = minor >= 13 ? 2560 : 2048
  const extra = Math.min(mods, 50) * 32 + Math.min(Math.max(mods - 50, 0), 150) * 24 + Math.max(mods - 200, 0) * 16
  return Math.min(MODS_CAP, roundUp(base + extra))
}

/**
 * 建议值以及每一项的来历：
 * - 基础（游戏版本、模组加载器）+ 模组数量；少数几个体积很大的模组（例如大型科技、维度模组）按体积再补一些
 * - 开着光影 +1 GB；Distant Horizons +1 GB
 * - 启用的高清材质包：按文件大小的 2.5 倍，最多 +2 GB
 * - 渲染距离超过 12：每多 1 个区块 +96 MB，最多 +1.5 GB
 * 总共最多 16 GB
 */
export function recommendedPlan(
  loader: ModLoader | undefined,
  usage: MemoryUsage,
  minecraftVersion?: string
): { recommended: number; factors: MemoryFactor[] } {
  const modded = !!loader && loader !== 'optifine'
  const base = recommendedMemory(loader, 0, minecraftVersion)
  const byCount = recommendedMemory(loader, usage.mods, minecraftVersion)
  const factors: MemoryFactor[] = [
    {
      label: modded ? `${minecraftVersion ?? ''} 模组版本基础`.trim() : `${minecraftVersion ?? ''} 基础`.trim(),
      mb: base
    }
  ]
  if (modded && usage.mods > 0) {
    factors.push({ label: `${usage.mods} 个模组`, mb: byCount - base })
    // 模组文件很大但数量不多时，按体积估算（每 MB 约需 3 MB 内存），只补上超出数量估算的部分
    const bySize = Math.min(MODS_CAP, roundUp(base + usage.modsMB * 3))
    if (bySize > byCount) factors.push({ label: `模组体积较大（${formatMb(usage.modsMB)}）`, mb: bySize - byCount })
  }
  if (usage.shaders) factors.push({ label: '已开启光影', mb: 1024 })
  if (usage.distantHorizons) factors.push({ label: 'Distant Horizons 远景渲染', mb: 1024 })
  if (usage.resourcePackMB >= 16) {
    factors.push({
      label: `高清材质包（${formatMb(usage.resourcePackMB)}）`,
      mb: Math.min(2048, roundUp(usage.resourcePackMB * 2.5))
    })
  }
  if (usage.renderDistance > 12) {
    factors.push({
      label: `渲染距离 ${usage.renderDistance} 区块`,
      mb: Math.min(1536, roundUp((usage.renderDistance - 12) * 96))
    })
  }
  const sum = factors.reduce((total, f) => total + f.mb, 0)
  return { recommended: Math.min(TOTAL_CAP, sum), factors: factors.filter((f) => f.mb > 0) }
}

/**
 * 自动分配内存：先按版本、模组、光影、材质包、渲染距离算出建议值，
 * 再按本机内存设上限（给系统和其他程序至少留 2 GB 或四分之一），
 * 当前可用内存不足时适当减少，但不低于能正常运行的最低值。
 */
export function planMemory(
  loader: ModLoader | undefined,
  usage: MemoryUsage | number,
  minecraftVersion?: string,
  total = Math.floor(totalmem() / MB),
  free = availableMemory()
): MemoryPlan {
  const detail: MemoryUsage = typeof usage === 'number' ? { ...EMPTY_USAGE, mods: usage } : usage
  const { recommended, factors } = recommendedPlan(loader, detail, minecraftVersion)
  const upper = Math.max(1024, roundDown(Math.min(total - 2048, total * 0.75)))
  const floor = Math.min(upper, loader && loader !== 'optifine' ? 2048 : 1024)
  let memory = Math.min(recommended, upper)
  let limited = false
  if (free !== null && free < memory) {
    // 最大内存只是上限，Java 按需要逐步占用（并会把不用的还给系统），所以不按可用内存压得太低：
    // 至少保留建议值的 75%，否则模组多的版本会因为内存不够而崩溃
    const fit = Math.max(floor, roundDown(free), Math.min(memory, roundDown(recommended * 0.75)))
    if (fit < memory) {
      memory = fit
      limited = true
    }
  }
  return { memory, recommended, total, free, mods: detail.mods, limited, capped: recommended > upper, factors }
}

/** 按版本的游戏目录自动分配内存 */
export async function autoMemory(
  loader: ModLoader | undefined,
  gamePath: string,
  minecraftVersion?: string
): Promise<MemoryPlan> {
  return planMemory(loader, await scanMemoryUsage(gamePath, loader), minecraftVersion)
}
