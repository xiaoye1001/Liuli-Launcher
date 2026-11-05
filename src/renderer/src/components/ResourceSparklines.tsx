import { useMemo, useState } from 'react'
import type { GameResources } from '../../../shared/types'

/** 内存：不到 1 GB 时显示 MB */
function formatMemoryMb(mb: number): string {
  return mb < 1024 ? `${mb} MB` : `${(mb / 1024).toFixed(1)} GB`
}

/** 多久以前：x 秒前 / x 分钟前 */
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} 秒前` : `${Math.round(s / 60)} 分钟前`
}

const W = 200
const H = 32

interface LineProps {
  label: string
  /** 曲线颜色（文字颜色类，浅色主题会自动换成深一点的颜色） */
  tint: string
  points: { at: number; value: number | null }[]
  /** 纵轴最大值 */
  max: number
  format: (value: number) => string
  /** 平时显示在右上角的摘要（例如峰值）；现在的数值已经写在上面一行，这里不重复 */
  summary: string
}

/** 一条小曲线：右上角平时显示摘要，鼠标移上去显示那个时刻的数值 */
function Sparkline({ label, tint, points, max, format, summary }: LineProps): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const valid = points.filter((p): p is { at: number; value: number } => p.value !== null)
  const first = valid[0]?.at ?? 0
  const last = valid[valid.length - 1]?.at ?? 0
  const span = Math.max(1, last - first)
  const x = (at: number): number => ((at - first) / span) * W
  const y = (v: number): number => H - 1 - (Math.min(v, max) / max) * (H - 2)
  const line = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = valid.length > 1 ? `${line} L${W},${H} L0,${H} Z` : ''
  const shown = hover !== null ? valid[hover] : valid[valid.length - 1]

  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (valid.length < 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    const at = first + ((e.clientX - rect.left) / rect.width) * span
    let best = 0
    valid.forEach((p, i) => {
      if (Math.abs(p.at - at) < Math.abs(valid[best].at - at)) best = i
    })
    setHover(best)
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="shrink-0 text-white/50">{label}</span>
        <span className="truncate tabular-nums text-white/60">
          {hover !== null && shown ? (
            <>
              {format(shown.value)}
              <span className="text-white/40"> · {ago(last - shown.at)}</span>
            </>
          ) : (
            summary
          )}
        </span>
      </div>
      <div
        className={`relative ${tint}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${label}最近的变化，现在 ${shown ? format(shown.value) : '未知'}`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-8 w-full overflow-visible">
          <line
            x1={0}
            y1={H - 0.5}
            x2={W}
            y2={H - 0.5}
            className="stroke-white/10"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {area && <path d={area} fill="currentColor" fillOpacity={0.12} />}
          {valid.length > 1 && (
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover !== null && valid[hover] && (
            <line
              x1={x(valid[hover].at)}
              y1={0}
              x2={x(valid[hover].at)}
              y2={H}
              className="stroke-white/30"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* 圆点用 HTML 画，不随曲线一起被拉伸成椭圆 */}
        {shown && valid.length > 1 && (
          <span
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-black/30"
            style={{ left: `${(x(shown.at) / W) * 100}%`, top: `${(y(shown.value) / H) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

/** 主页启动区：游戏运行时内存和 CPU 占用的两条小曲线（两个量单位不同，分开画） */
function ResourceSparklines({ history }: { history: GameResources[] }): JSX.Element | null {
  const data = useMemo(() => history.slice(-200), [history])
  if (data.length < 2) return null
  const latest = data[data.length - 1]
  const peak = Math.max(...data.map((r) => r.memoryMb))
  const cpu = data.map((r) => r.cpuPercent).filter((v): v is number => v !== null)
  const cpuPeak = cpu.length > 0 ? Math.max(...cpu) : null
  const memoryMax = Math.max(latest.maxMemoryMb, peak, 1)
  const minutes = Math.max(1, Math.round((latest.at - data[0].at) / 60000))
  return (
    <div className="flex gap-4" data-testid="resource-sparklines" title={`最近 ${minutes} 分钟的占用`}>
      <Sparkline
        label="内存"
        tint="text-emerald-300"
        points={data.map((r) => ({ at: r.at, value: r.memoryMb }))}
        max={memoryMax}
        format={formatMemoryMb}
        summary={`峰值 ${formatMemoryMb(peak)}`}
      />
      <Sparkline
        label="CPU"
        tint="text-sky-300"
        points={data.map((r) => ({ at: r.at, value: r.cpuPercent }))}
        max={100}
        format={(v) => `${v}%`}
        summary={cpuPeak === null ? '—' : `最高 ${cpuPeak}%`}
      />
    </div>
  )
}

export default ResourceSparklines
