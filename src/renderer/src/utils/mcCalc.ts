/** Minecraft 小工具的计算：坐标换算、区块坐标、游戏时间 */

/** 下界和主世界的比例：下界走 1 格等于主世界 8 格 */
export const NETHER_SCALE = 8

/** 主世界坐标换算成下界坐标（方块坐标，Y 不变） */
export function overworldToNether(x: number, z: number): { x: number; z: number } {
  return { x: Math.floor(x / NETHER_SCALE), z: Math.floor(z / NETHER_SCALE) }
}

/** 下界坐标换算成主世界坐标 */
export function netherToOverworld(x: number, z: number): { x: number; z: number } {
  return { x: Math.floor(x) * NETHER_SCALE, z: Math.floor(z) * NETHER_SCALE }
}

export interface ChunkInfo {
  /** 区块坐标 */
  chunkX: number
  chunkZ: number
  /** 在区块里的位置（0~15） */
  localX: number
  localZ: number
  /** 区块覆盖的方块范围 */
  fromX: number
  toX: number
  fromZ: number
  toZ: number
  /** 存档 region 文件夹里对应的文件 */
  regionFile: string
}

/** 方块坐标所在的区块 */
export function chunkOf(x: number, z: number): ChunkInfo {
  const bx = Math.floor(x)
  const bz = Math.floor(z)
  const chunkX = Math.floor(bx / 16)
  const chunkZ = Math.floor(bz / 16)
  return {
    chunkX,
    chunkZ,
    localX: bx - chunkX * 16,
    localZ: bz - chunkZ * 16,
    fromX: chunkX * 16,
    toX: chunkX * 16 + 15,
    fromZ: chunkZ * 16,
    toZ: chunkZ * 16 + 15,
    regionFile: `r.${Math.floor(chunkX / 32)}.${Math.floor(chunkZ / 32)}.mca`
  }
}

/** 一个游戏日的刻数（现实 20 分钟） */
export const TICKS_PER_DAY = 24000

export interface GameTime {
  /** 第几天（从 1 开始） */
  day: number
  /** 游戏里的时刻，例如 06:00 */
  clock: string
  /** 一天里的刻数（/time set 用的值） */
  timeOfDay: number
  /** 现实里过了多久（秒） */
  realSeconds: number
  /** 白天 / 日落 / 夜晚 / 日出 */
  phase: string
}

/** 刻数换算成游戏时间：0 刻是第一天早上 6 点 */
export function ticksToGameTime(ticks: number): GameTime {
  const t = Math.max(0, Math.floor(ticks))
  const timeOfDay = t % TICKS_PER_DAY
  const totalMinutes = Math.floor(((timeOfDay + 6000) % TICKS_PER_DAY) * 0.06)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return {
    day: Math.floor(t / TICKS_PER_DAY) + 1,
    clock: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    timeOfDay,
    realSeconds: t / 20,
    phase: timeOfDay < 12000 ? '白天' : timeOfDay < 13000 ? '日落' : timeOfDay < 23000 ? '夜晚' : '日出'
  }
}

/** 游戏里的时刻（时、分）换算成 /time set 用的刻数 */
export function clockToTicks(hours: number, minutes: number): number {
  const h = ((Math.floor(hours) % 24) + 24) % 24
  const m = Math.min(59, Math.max(0, Math.floor(minutes)))
  return (((h - 6 + 24) % 24) * 1000 + Math.round((m * 1000) / 60)) % TICKS_PER_DAY
}

/** 现实时间（秒）的可读写法 */
export function formatRealTime(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  const h = Math.floor(s / 3600)
  return `${h} 小时 ${Math.floor((s % 3600) / 60)} 分`
}
