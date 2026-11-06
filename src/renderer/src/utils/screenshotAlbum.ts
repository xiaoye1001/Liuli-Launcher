import type { ScreenshotAlbum } from '../../../shared/types'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function partOfDay(hour: number): string {
  if (hour < 5) return '凌晨'
  if (hour < 9) return '早上'
  if (hour < 12) return '上午'
  if (hour < 14) return '中午'
  if (hour < 18) return '下午'
  return '晚上'
}

/** 「2025年11月5日 周三 晚上」，今年的不写年份 */
export function albumDate(album: ScreenshotAlbum, now = new Date()): string {
  const d = new Date(album.start)
  const year = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}年`
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]} ${partOfDay(d.getHours())}`
}

/** 那次玩的地方：存档、服务器 */
export function albumPlaces(album: ScreenshotAlbum): string {
  return [...album.worlds, ...album.servers].join('、')
}

/** 拼图里最多放几张；太多时均匀挑 */
export function pickShots<T>(shots: T[], max = 24): T[] {
  if (shots.length <= max) return shots
  return Array.from({ length: max }, (_, i) => shots[Math.round((i * (shots.length - 1)) / (max - 1))])
}

/** 拼图的版式：几列、每格大小 */
export function collageLayout(count: number): { cols: number; rows: number; cellW: number; cellH: number } {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3
  const cellW = cols === 1 ? 960 : cols === 2 ? 600 : 480
  return { cols, rows: Math.max(1, Math.ceil(count / cols)), cellW, cellH: Math.round((cellW * 9) / 16) }
}
