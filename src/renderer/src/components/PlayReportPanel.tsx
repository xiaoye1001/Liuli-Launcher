import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Clock, Gamepad2, Rocket, Sun, Trophy } from 'lucide-react'
import { EmptyState, LoadingState } from './EmptyState'
import { formatDuration } from '../utils/format'
import { buildPlayReport, PERIOD_INFO } from '../utils/playReport'
import type { LaunchTimingRecord, PlayStats } from '../../../shared/types'

function hours(ms: number): string {
  const h = ms / 3_600_000
  return h >= 10 ? `${Math.round(h)} 小时` : h >= 1 ? `${h.toFixed(1)} 小时` : `${Math.round(ms / 60_000)} 分钟`
}

function weekLabel(start: number): string {
  const d = new Date(start)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function Tile({
  icon: Icon,
  label,
  value,
  hint
}: {
  icon: typeof Clock
  label: string
  value: string
  hint?: string
}): JSX.Element {
  return (
    <div className="min-w-0 rounded-xl bg-black/20 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-white/50">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold">{value}</div>
      {hint && <div className="truncate text-xs text-white/40">{hint}</div>}
    </div>
  )
}

/** 百宝箱：我的游玩报告（根据启动器记录的游玩时长） */
function PlayReportPanel(): JSX.Element {
  const [stats, setStats] = useState<PlayStats | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [fastest, setFastest] = useState<LaunchTimingRecord | undefined>()

  useEffect(() => {
    void window.api.getPlayStats().then(setStats)
    void window.api.getLaunchTiming().then((t) => setFastest(t.best))
  }, [])

  const report = useMemo(() => (stats ? buildPlayReport(stats) : null), [stats])

  const box = 'rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl'
  if (!report) {
    return (
      <section className={box}>
        <LoadingState />
      </section>
    )
  }
  if (report.totalMs === 0) {
    return (
      <section className={box}>
        <EmptyState icon={BarChart3}>还没有游玩记录，玩一会儿再来看看吧</EmptyState>
      </section>
    )
  }

  const maxWeek = Math.max(...report.weeks.map((w) => w.ms), 1)
  const maxVersion = report.topVersions[0]?.totalMs ?? 1
  const period = report.favoritePeriod ? PERIOD_INFO[report.favoritePeriod] : null

  return (
    <section className={`${box} space-y-5`}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-emerald-300" />
          我的游玩报告
        </h2>
        <p className="text-xs text-white/50">
          {period ? `你是一位「${period.title}」：最常在${period.label}开始游戏` : '用琉璃启动器玩过的时间'}
          {report.weekendShare >= 0.6 && '，周末是你的主场'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Clock} label="累计游玩" value={formatDuration(report.totalMs)} />
        <Tile
          icon={Rocket}
          label="启动游戏"
          value={`${report.launches} 次`}
          hint={`玩过 ${report.versionCount} 个版本`}
        />
        <Tile
          icon={Trophy}
          label="最长的一次"
          value={report.longest ? formatDuration(report.longest.durationMs) : '没有记录'}
          hint={
            report.longest
              ? `${new Date(report.longest.start).toLocaleDateString('zh-CN')} · ${report.longest.versionId}`
              : undefined
          }
        />
        <Tile
          icon={Sun}
          label="周末游玩占比"
          value={`${Math.round(report.weekendShare * 100)}%`}
          hint={report.crashes > 0 ? `其中 ${report.crashes} 次异常退出` : '没有异常退出'}
        />
      </div>

      {/* 每周游玩时长：单个系列的柱状图，鼠标移上去显示具体时长 */}
      <div>
        <div className="text-sm font-medium">最近 8 周每周游玩时长</div>
        <div className="mt-3 flex h-40 items-end gap-[2px] border-b border-white/15 pb-px" role="list">
          {report.weeks.map((week, i) => {
            const height = week.ms > 0 ? Math.max(3, (week.ms / maxWeek) * 100) : 0
            return (
              <div
                key={week.start}
                role="listitem"
                aria-label={`${weekLabel(week.start)} 这一周：${week.ms > 0 ? hours(week.ms) : '没有玩'}`}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {hover === i && (
                  // 固定的深色底（浅色模式也不变），显示在柱子上方；最右边的柱子靠右对齐，不超出图表
                  <div
                    className={`pointer-events-none absolute z-10 mb-1 whitespace-nowrap rounded-md bg-[#111827] px-2 py-1 text-xs text-[#fff] shadow-lg ${
                      i === report.weeks.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    }`}
                    style={{ bottom: `${height}%` }}
                  >
                    {weekLabel(week.start)} 这一周 · {week.ms > 0 ? hours(week.ms) : '没有玩'}
                  </div>
                )}
                <div
                  className={`w-full max-w-10 rounded-t-[4px] transition-colors ${
                    hover === i ? 'bg-emerald-300' : 'bg-emerald-400/80'
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-[2px] text-[11px] text-white/40">
          {report.weeks.map((week, i) => (
            <div key={week.start} className="flex-1 text-center">
              {i === report.weeks.length - 1 ? '本周' : weekLabel(week.start)}
            </div>
          ))}
        </div>
      </div>

      {/* 最常玩的版本 */}
      <div>
        <div className="text-sm font-medium">最常玩的版本</div>
        <div className="mt-3 space-y-2">
          {report.topVersions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 text-sm">
              <Gamepad2 className="h-4 w-4 shrink-0 text-white/40" />
              <span className="w-40 shrink-0 truncate" title={v.id}>
                {v.id}
              </span>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-emerald-400/80"
                  style={{ width: `${Math.max(2, (v.totalMs / maxVersion) * 100)}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-xs text-white/60">{formatDuration(v.totalMs)}</span>
            </div>
          ))}
        </div>
      </div>

      {fastest && (
        <p className="text-xs text-white/60">
          最快的一次启动：{(fastest.ms / 1000).toFixed(1)} 秒（{fastest.versionId}，
          {new Date(fastest.at).toLocaleDateString('zh-CN')}），从游戏进程启动到窗口出现
        </p>
      )}

      <p className="text-[11px] text-white/40">
        每周时长、时段、最长的一次和周末占比根据最近 {report.sessionCount}{' '}
        次游玩记录计算；累计时长和启动次数包含所有记录
      </p>
    </section>
  )
}

export default PlayReportPanel
