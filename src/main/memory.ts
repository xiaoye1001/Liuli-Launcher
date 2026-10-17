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

/** 根据模组数量算出建议的内存：原版 2 GB，模组版本 3 GB 起，每个模组再加 32 MB，最多 12 GB */
export function recommendedMemory(loader: ModLoader | undefined, mods: number): number {
  // OptiFine 只是画质增强，按原版计算
  if (!loader || loader === 'optifine') return 2048
  return Math.min(12288, roundDown(3072 + mods * 32 + STEP - 1))
}

/**
 * 自动分配内存：先按版本和模组数量算出建议值，
 * 再按本机内存设上限（给系统和其他程序至少留 2 GB 或四分之一），
 * 当前可用内存不足时适当减少，但不低于能正常运行的最低值。
 */
export function planMemory(
  loader: ModLoader | undefined,
  mods: number,
  total = Math.floor(totalmem() / MB),
  free = availableMemory()
): MemoryPlan {
  const recommended = recommendedMemory(loader, mods)
  const upper = Math.max(1024, roundDown(Math.min(total - 2048, total * 0.75)))
  const floor = Math.min(upper, loader && loader !== 'optifine' ? 2048 : 1024)
  let memory = Math.min(recommended, upper)
  let limited = false
  if (free !== null && free < memory) {
    const fit = Math.max(floor, roundDown(free))
    if (fit < memory) {
      memory = fit
      limited = true
    }
  }
  return { memory, recommended, total, free, mods, limited }
}

/** 按版本的模组文件夹自动分配内存 */
export async function autoMemory(loader: ModLoader | undefined, gamePath: string): Promise<MemoryPlan> {
  const mods = loader && loader !== 'optifine' ? await countMods(join(gamePath, 'mods')) : 0
  return planMemory(loader, mods)
}
