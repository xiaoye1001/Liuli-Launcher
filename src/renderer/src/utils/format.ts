import { t } from './i18n'
/** 游玩时长：不到 1 分钟、x 分钟、x 小时 y 分钟 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return t('不到 1 分钟')
  if (minutes < 60) return t('{0} 分钟', { 0: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours >= 100 || rest === 0) return t('{0} 小时', { 0: hours })
  return t('{0} 小时 {1} 分钟', { 0: hours, 1: rest })
}

/** 计时器格式：12:34 或 1:02:03 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 相对时间：刚刚、x 分钟前、x 小时前、x 天前，更早显示日期 */
export function formatRelative(ms: number): string {
  if (!ms) return t('从未')
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('刚刚')
  if (minutes < 60) return t('{0} 分钟前', { 0: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{0} 小时前', { 0: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('{0} 天前', { 0: days })
  return new Date(ms).toLocaleDateString('zh-CN')
}
