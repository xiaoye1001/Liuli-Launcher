/**
 * 红石 / 生电常用计算（Java 版规则）：
 * - 漏斗每 8 游戏刻传 1 个物品（每秒 2.5 个）
 * - 熔炉烧一个物品 200 刻（10 秒），高炉 / 烟熏炉 100 刻（5 秒）；燃料在高炉里燃烧速度也翻倍
 * - 比较器读容器：信号 = floor(满度 × 14) + 1（容器里有物品时），满度 = Σ(数量 / 最大堆叠) / 格数
 * - 1 红石刻 = 2 游戏刻 = 0.1 秒
 */

export const TICKS_PER_SECOND = 20
/** 漏斗每传一个物品需要的游戏刻 */
export const HOPPER_TICKS = 8

export const CONTAINERS: { key: string; name: string; slots: number }[] = [
  { key: 'chest', name: '箱子 / 木桶 / 潜影盒', slots: 27 },
  { key: 'double', name: '大箱子', slots: 54 },
  { key: 'hopper', name: '漏斗', slots: 5 },
  { key: 'dispenser', name: '发射器 / 投掷器', slots: 9 },
  { key: 'furnace', name: '熔炉（3 格）', slots: 3 }
]

/** 燃料：在普通熔炉里能烧几个物品 */
export const FUELS: { key: string; name: string; items: number }[] = [
  { key: 'lava', name: '熔岩桶', items: 100 },
  { key: 'coal_block', name: '煤炭块', items: 80 },
  { key: 'kelp_block', name: '干海带块', items: 20 },
  { key: 'blaze_rod', name: '烈焰棒', items: 12 },
  { key: 'coal', name: '煤炭 / 木炭', items: 8 },
  { key: 'log', name: '原木 / 木板', items: 1.5 },
  { key: 'stick', name: '木棍', items: 0.5 }
]

export const FURNACES: { key: string; name: string; ticks: number }[] = [
  { key: 'furnace', name: '熔炉', ticks: 200 },
  { key: 'fast', name: '高炉 / 烟熏炉', ticks: 100 }
]

/** 漏斗传 n 个物品要多少秒（多条漏斗线并行时按条数分摊） */
export function hopperSeconds(items: number, lanes = 1): number {
  if (items <= 0 || lanes <= 0) return 0
  return (Math.ceil(items / lanes) * HOPPER_TICKS) / TICKS_PER_SECOND
}

/** 一条漏斗线每小时传多少个 */
export function hopperPerHour(lanes = 1): number {
  return ((3600 * TICKS_PER_SECOND) / HOPPER_TICKS) * lanes
}

/** 烧 n 个物品：用 count 个炉子要多少秒、一共要多少燃料 */
export function smelt(
  items: number,
  furnaceKey: string,
  fuelKey: string,
  count = 1
): { seconds: number; fuel: number } {
  const furnace = FURNACES.find((f) => f.key === furnaceKey) ?? FURNACES[0]
  const fuel = FUELS.find((f) => f.key === fuelKey) ?? FUELS[0]
  if (items <= 0 || count <= 0) return { seconds: 0, fuel: 0 }
  const perFurnace = Math.ceil(items / count)
  // 燃料燃烧时间固定，高炉烧得快，所以一份燃料只够一半的物品
  const itemsPerFuel = fuel.items * (furnace.ticks / 200)
  return {
    seconds: (perFurnace * furnace.ticks) / TICKS_PER_SECOND,
    fuel: Math.ceil(items / itemsPerFuel)
  }
}

/** 比较器从容器读到的信号强度 */
export function comparatorSignal(items: number, slots: number, maxStack = 64): number {
  if (items <= 0 || slots <= 0) return 0
  const capacity = slots * maxStack
  const n = Math.min(items, capacity)
  return Math.floor((n / capacity) * 14) + 1
}

/** 想要信号强度 s，至少要放多少个物品 */
export function itemsForSignal(signal: number, slots: number, maxStack = 64): number {
  if (signal <= 0) return 0
  if (signal > 15) return NaN
  return Math.max(1, Math.ceil(((signal - 1) * slots * maxStack) / 14))
}

/** 红石刻 → 秒 */
export function redstoneTicksToSeconds(rt: number): number {
  return rt / 10
}

/** n 个中继器串起来（每个延迟 1~4 红石刻）总延迟多少红石刻；做成时钟时周期是两倍 */
export function repeaterDelay(delays: number[]): number {
  return delays.reduce((sum, d) => sum + Math.min(4, Math.max(1, Math.round(d))), 0)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${+seconds.toFixed(2)} 秒`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  return h > 0 ? `${h} 小时 ${m} 分 ${s} 秒` : `${m} 分 ${s} 秒`
}
