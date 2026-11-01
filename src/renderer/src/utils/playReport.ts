import type { PlayStats } from '../../../shared/types'

/** 「我的游玩报告」要显示的数据（由游玩记录计算） */
export interface PlayReport {
  totalMs: number
  launches: number
  /** 玩过的版本数 */
  versionCount: number
  /** 游玩最久的版本（最多 5 个） */
  topVersions: { id: string; totalMs: number; launches: number }[]
  /** 最长的一次 */
  longest: { versionId: string; durationMs: number; start: number } | null
  /** 最近几周每周的游玩时长（最早的在前） */
  weeks: { start: number; ms: number }[]
  /** 游玩记录里最常开始玩的时段 */
  favoritePeriod: Period | null
  /** 周末游玩时长占比（0~1） */
  weekendShare: number
  /** 异常退出（崩溃）的次数 */
  crashes: number
  /** 计算用的游玩记录条数（只保留最近 100 次） */
  sessionCount: number
}

export type Period = 'night' | 'morning' | 'afternoon' | 'evening'

export const PERIOD_INFO: Record<Period, { label: string; title: string }> = {
  night: { label: '凌晨（0~6 点）', title: '夜猫子' },
  morning: { label: '上午（6~12 点）', title: '早起的鸟儿' },
  afternoon: { label: '下午（12~18 点）', title: '午后冒险家' },
  evening: { label: '晚上（18~24 点）', title: '晚间建筑师' }
}

function periodOf(hour: number): Period {
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** 这一周的周一 0 点 */
function weekStart(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export function buildPlayReport(stats: PlayStats, now = Date.now(), weekCount = 8): PlayReport {
  const versions = Object.entries(stats.versions)
  const topVersions = versions
    .filter(([, v]) => v.totalMs > 0)
    .map(([id, v]) => ({ id, totalMs: v.totalMs, launches: v.launches }))
    .sort((a, b) => b.totalMs - a.totalMs)
  const sessions = stats.sessions.filter((s) => s.start > 0)

  let longest: PlayReport['longest'] = null
  for (const s of sessions) {
    if (!longest || s.durationMs > longest.durationMs) {
      longest = { versionId: s.versionId, durationMs: s.durationMs, start: s.start }
    }
  }

  const thisWeek = weekStart(now)
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const d = new Date(thisWeek)
    d.setDate(d.getDate() - 7 * (weekCount - 1 - i))
    return { start: d.getTime(), ms: 0 }
  })
  const periods: Record<Period, number> = { night: 0, morning: 0, afternoon: 0, evening: 0 }
  let weekendMs = 0
  let sessionMs = 0
  for (const s of sessions) {
    const week = weeks.find((w, i) => s.start >= w.start && (i === weeks.length - 1 || s.start < weeks[i + 1].start))
    if (week) week.ms += s.durationMs
    const date = new Date(s.start)
    periods[periodOf(date.getHours())] += s.durationMs
    if (date.getDay() === 0 || date.getDay() === 6) weekendMs += s.durationMs
    sessionMs += s.durationMs
  }
  const favorite = (Object.entries(periods) as [Period, number][]).sort((a, b) => b[1] - a[1])[0]

  return {
    totalMs: versions.reduce((sum, [, v]) => sum + v.totalMs, 0),
    launches: versions.reduce((sum, [, v]) => sum + v.launches, 0),
    versionCount: topVersions.length,
    topVersions: topVersions.slice(0, 5),
    longest,
    weeks,
    favoritePeriod: favorite && favorite[1] > 0 ? favorite[0] : null,
    weekendShare: sessionMs > 0 ? weekendMs / sessionMs : 0,
    crashes: sessions.filter((s) => s.crashed).length,
    sessionCount: sessions.length
  }
}
