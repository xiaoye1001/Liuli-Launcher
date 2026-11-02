import { formatDuration } from './format'
import { PERIOD_INFO, type Period } from './playReport'
import type { PlayStats } from '../../../shared/types'

/** 一年的游玩报告（用于生成分享图片） */
export interface YearReport {
  year: number
  totalMs: number
  launches: number
  daysPlayed: number
  crashes: number
  longestMs: number
  /** 每个月的游玩时长（毫秒） */
  months: number[]
  /** 玩得最多的月份（0~11），没有时为 null */
  bestMonth: number | null
  favoritePeriod: Period | null
  /** 玩得最多的版本（最多 3 个） */
  topVersions: { id: string; ms: number }[]
  /** 根据游玩时长给的称号 */
  title: string
}

/** 有游玩记录的年份（新的在前） */
export function reportYears(stats: PlayStats): number[] {
  return Object.entries(stats.years ?? {})
    .filter(([, y]) => y.totalMs > 0)
    .map(([year]) => Number(year))
    .sort((a, b) => b - a)
}

function titleOf(hours: number): string {
  if (hours >= 300) return '方块传奇'
  if (hours >= 100) return '资深玩家'
  if (hours >= 30) return '常驻冒险家'
  if (hours >= 5) return '快乐矿工'
  return '萌新探索者'
}

export function buildYearReport(stats: PlayStats, year: number): YearReport | null {
  const y = stats.years?.[String(year)]
  if (!y || y.totalMs <= 0) return null
  const periods: Record<Period, number> = { night: 0, morning: 0, afternoon: 0, evening: 0 }
  y.hours.forEach((count, hour) => {
    periods[hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'] += count
  })
  const favorite = (Object.entries(periods) as [Period, number][]).sort((a, b) => b[1] - a[1])[0]
  const maxMonth = Math.max(...y.months)
  return {
    year,
    totalMs: y.totalMs,
    launches: y.launches,
    daysPlayed: y.days.length,
    crashes: y.crashes,
    longestMs: y.longestMs,
    months: y.months,
    bestMonth: maxMonth > 0 ? y.months.indexOf(maxMonth) : null,
    favoritePeriod: favorite && favorite[1] > 0 ? favorite[0] : null,
    topVersions: Object.entries(y.versions)
      .map(([id, ms]) => ({ id, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 3),
    title: titleOf(y.totalMs / 3_600_000)
  }
}

// ---------- 画图 ----------

const WIDTH = 1080
const HEIGHT = 1500
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif'
const EMERALD = '#34d399'
const AMBER = '#fbbf24'
const SKY = '#38bdf8'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 太长的文字截断加省略号 */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

/** 总时长的大号数字：不到 1 小时显示分钟 */
function heroNumber(ms: number): [string, string] {
  const hours = ms / 3_600_000
  if (hours < 1) return [String(Math.max(1, Math.round(ms / 60_000))), '分钟']
  return [hours < 10 ? hours.toFixed(1) : String(Math.round(hours)), '小时']
}

/** 背景上随意散落的小方块（每年的位置固定，同一年生成的图片一样） */
function drawBlocks(ctx: CanvasRenderingContext2D, seed: number): void {
  let s = seed
  const random = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const colors = [EMERALD, SKY, AMBER]
  // 只放在右上角和左下角的空白处，不挡住文字
  for (let i = 0; i < 22; i++) {
    const size = 14 + Math.floor(random() * 4) * 10
    const top = i % 3 !== 2
    const x = top ? 640 + random() * 400 : random() * 520
    const y = top ? 20 + random() * 280 : HEIGHT - 70 + random() * 40
    ctx.globalAlpha = 0.06 + random() * 0.1
    ctx.fillStyle = colors[i % colors.length]
    ctx.fillRect(Math.round(x / 10) * 10, Math.round(y / 10) * 10, size, size)
  }
  ctx.globalAlpha = 1
}

/** 画出年度报告图片 */
export function drawYearReport(report: YearReport, playerName: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // 背景
  const bg = ctx.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT)
  bg.addColorStop(0, '#0b1220')
  bg.addColorStop(0.55, '#0f2a2c')
  bg.addColorStop(1, '#123a33')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = ctx.createRadialGradient(WIDTH * 0.85, 120, 0, WIDTH * 0.85, 120, 520)
  glow.addColorStop(0, 'rgba(52, 211, 153, 0.22)')
  glow.addColorStop(1, 'rgba(52, 211, 153, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  drawBlocks(ctx, report.year)

  const left = 80
  const inner = WIDTH - left * 2

  // 标题
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `500 30px ${FONT}`
  ctx.fillText(`${report.year} 年度游玩报告`, left, 130)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 68px ${FONT}`
  ctx.fillText(fit(ctx, playerName ? `${playerName} 的 ${report.year}` : `我的 ${report.year}`, inner), left, 215)

  // 称号
  ctx.font = `600 30px ${FONT}`
  const tag = report.title
  const tagWidth = ctx.measureText(tag).width + 48
  roundRect(ctx, left, 250, tagWidth, 56, 28)
  ctx.fillStyle = 'rgba(251, 191, 36, 0.18)'
  ctx.fill()
  ctx.fillStyle = AMBER
  ctx.fillText(tag, left + 24, 289)

  // 总时长
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `500 32px ${FONT}`
  ctx.fillText('这一年一共玩了', left, 400)
  const [num, unit] = heroNumber(report.totalMs)
  ctx.fillStyle = EMERALD
  ctx.font = `800 150px ${FONT}`
  ctx.fillText(num, left - 6, 545)
  const numWidth = ctx.measureText(num).width
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 48px ${FONT}`
  ctx.fillText(unit, left + numWidth + 16, 540)

  // 四个小卡片
  const period = report.favoritePeriod ? PERIOD_INFO[report.favoritePeriod] : null
  const tiles: [string, string][] = [
    ['玩过的日子', `${report.daysPlayed} 天`],
    ['启动游戏', `${report.launches} 次`],
    ['最长的一次', formatDuration(report.longestMs)],
    ['最常在', period ? period.label.replace(/（.*）/, '') : '—']
  ]
  const tileW = (inner - 24) / 2
  tiles.forEach(([label, value], i) => {
    const x = left + (i % 2) * (tileW + 24)
    const y = 600 + Math.floor(i / 2) * 170
    roundRect(ctx, x, y, tileW, 146, 24)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `500 26px ${FONT}`
    ctx.fillText(label, x + 30, y + 50)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 46px ${FONT}`
    ctx.fillText(fit(ctx, value, tileW - 60), x + 30, y + 112)
  })
  if (period) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `500 24px ${FONT}`
    ctx.fillText(`开始游戏，是一位「${period.title}」`, left, 958)
  }

  // 每月游玩时长
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 32px ${FONT}`
  ctx.fillText('每个月的游玩时长', left, 1040)
  if (report.bestMonth !== null) {
    ctx.fillStyle = AMBER
    ctx.font = `500 26px ${FONT}`
    const text = `最爱的月份：${report.bestMonth + 1} 月`
    ctx.fillText(text, left + inner - ctx.measureText(text).width, 1040)
  }
  const chartTop = 1070
  const chartHeight = 150
  const max = Math.max(...report.months, 1)
  const gap = 14
  const barW = (inner - gap * 11) / 12
  report.months.forEach((ms, i) => {
    const h = ms > 0 ? Math.max(6, (ms / max) * chartHeight) : 3
    const x = left + i * (barW + gap)
    roundRect(ctx, x, chartTop + chartHeight - h, barW, h, Math.min(8, h / 2))
    ctx.fillStyle = i === report.bestMonth ? AMBER : ms > 0 ? EMERALD : 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `500 22px ${FONT}`
    const label = String(i + 1)
    ctx.fillText(label, x + (barW - ctx.measureText(label).width) / 2, chartTop + chartHeight + 34)
  })

  // 最常玩的版本
  if (report.topVersions.length > 0) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 32px ${FONT}`
    ctx.fillText('最常玩的版本', left, 1320)
    report.topVersions.forEach((v, i) => {
      const y = 1368
      const x = left + i * ((inner + 24) / 3)
      const w = (inner - 48) / 3
      ctx.fillStyle = i === 0 ? SKY : 'rgba(255,255,255,0.75)'
      ctx.font = `600 28px ${FONT}`
      ctx.fillText(fit(ctx, `${i + 1}. ${v.id}`, w), x, y)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = `500 22px ${FONT}`
      ctx.fillText(formatDuration(v.ms), x, y + 36)
    })
  }

  // 页脚
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = `500 22px ${FONT}`
  const footer = `琉璃启动器 · 生成于 ${new Date().toLocaleDateString('zh-CN')}`
  ctx.fillText(footer, WIDTH - left - ctx.measureText(footer).width, HEIGHT - 40)
  return canvas
}
