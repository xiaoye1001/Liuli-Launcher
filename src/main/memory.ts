import { readdir } from 'fs/promises'
import { freemem, totalmem } from 'os'
import { join } from 'path'
import type { MemoryPlan, ModLoader } from '../shared/types'

const STEP = 256
const MB = 1024 * 1024

function roundDown(value: number): number {
  return Math.floor(value / STEP) * STEP
}

/** 统计 mods 文件夹里启用的模组数量（.jar，已禁用的 .jar.disabled 不算） */
async function countMods(modsDir: string): Promise<number> {
  try {
    const entries = await readdir(modsDir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jar')).length
  } catch {
    return 0
  }
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

/**
 * 建议的最大内存。最大内存越大，Java 越倾向于先占满再回收，实际占用的内存也越多；
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
  return Math.min(12288, roundDown(base + extra + STEP - 1))
}

/**
 * 自动分配内存：先按版本和模组数量算出建议值，
 * 再按本机内存设上限（给系统和其他程序至少留 2 GB 或四分之一），
 * 当前可用内存不足时适当减少，但不低于能正常运行的最低值。
 */
export function planMemory(
  loader: ModLoader | undefined,
  mods: number,
  minecraftVersion?: string,
  total = Math.floor(totalmem() / MB),
  free = availableMemory()
): MemoryPlan {
  const recommended = recommendedMemory(loader, mods, minecraftVersion)
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
  return { memory, recommended, total, free, mods, limited }
}

/** 按版本的模组文件夹自动分配内存 */
export async function autoMemory(
  loader: ModLoader | undefined,
  gamePath: string,
  minecraftVersion?: string
): Promise<MemoryPlan> {
  const mods = loader && loader !== 'optifine' ? await countMods(join(gamePath, 'mods')) : 0
  return planMemory(loader, mods, minecraftVersion)
}
