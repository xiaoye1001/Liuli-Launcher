import { useEffect, useState } from 'react'
import { ChevronDown, Gauge, Settings2, X } from 'lucide-react'
import type { LagReport } from '../../../shared/types'
import { LAG_LEVELS, lagResources, lagSummary, lagTipText } from '../utils/lagReport'

/** 建议列表 */
function LagTips({
  report,
  onOpenVersionSettings
}: {
  report: LagReport
  onOpenVersionSettings?: (versionId: string) => void
}): JSX.Element {
  const resources = lagResources(report)
  return (
    <div className="space-y-1.5 text-xs" data-testid="lag-tips">
      {report.tips.map((tip) => {
        const t = lagTipText(tip, report)
        return (
          <div key={tip} className="rounded-lg bg-black/20 px-2.5 py-1.5">
            <div className="flex items-center gap-2 font-medium text-white/85">
              {t.title}
              {t.action === 'versionSettings' && onOpenVersionSettings && (
                <button
                  onClick={() => onOpenVersionSettings(report.versionId)}
                  className="ml-auto flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 font-normal hover:bg-white/20"
                >
                  <Settings2 className="h-3 w-3" />
                  去版本设置
                </button>
              )}
            </div>
            <div className="mt-0.5 text-white/60">{t.text}</div>
          </div>
        )
      })}
      {resources && <div className="text-white/40">{resources}</div>}
    </div>
  )
}

/** 主页提醒：刚结束的那次游戏卡了，说说为什么 */
export function LagReportBanner({
  onOpenVersionSettings
}: {
  onOpenVersionSettings?: (versionId: string) => void
}): JSX.Element | null {
  const [report, setReport] = useState<LagReport | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = (r: LagReport | undefined): void => {
      // 只提醒最近 6 小时内、没看过、有问题的那次
      if (r && !r.seen && r.level !== 'good' && Date.now() - r.end < 6 * 3600 * 1000) setReport(r)
    }
    void window.api
      .listLagReports()
      .then((list) => show(list[0]))
      .catch(() => undefined)
    return window.api.onLagReport((r) => {
      setOpen(false)
      setReport(null)
      show(r)
    })
  }, [])

  if (!report) return null
  const dismiss = (): void => {
    setReport(null)
    void window.api.markLagReportSeen(report.id).catch(() => undefined)
  }
  return (
    <div
      data-testid="lag-banner"
      className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-sm"
    >
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 shrink-0 text-amber-300" />
        <span className="min-w-0 flex-1 truncate">
          {`刚才那次游戏${report.level === 'bad' ? '很卡' : '有点卡'}：${lagSummary(report)}`}
        </span>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          看看为什么
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={dismiss}
          title="知道了"
          aria-label="关闭卡顿提醒"
          className="shrink-0 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="mt-2 pb-1">
          <LagTips report={report} onOpenVersionSettings={onOpenVersionSettings} />
        </div>
      )}
    </div>
  )
}

function when(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    hour12: false,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** 游玩报告里的「最近的卡顿报告」 */
export function LagReportList(): JSX.Element | null {
  const [reports, setReports] = useState<LagReport[] | null>(null)
  const [open, setOpen] = useState('')

  useEffect(() => {
    void window.api
      .listLagReports()
      .then(setReports)
      .catch(() => setReports([]))
    return window.api.onLagReport((r) => setReports((list) => [r, ...(list ?? [])]))
  }, [])

  if (!reports) return null
  return (
    <div className="space-y-2" data-testid="lag-reports">
      <div className="flex items-center gap-1.5 text-sm font-medium text-white/80">
        <Gauge className="h-4 w-4" />
        最近的卡顿报告
      </div>
      {reports.length === 0 ? (
        <div className="text-xs text-white/50">还没有记录，玩一会儿之后再来看</div>
      ) : (
        <div className="space-y-1">
          {reports.slice(0, 10).map((r) => {
            const level = LAG_LEVELS[r.level]
            const expanded = open === r.id
            return (
              <div key={r.id} className="rounded-lg bg-black/15 px-2.5 py-1.5" data-testid="lag-report">
                <button
                  onClick={() => setOpen(expanded ? '' : r.id)}
                  disabled={r.tips.length === 0 && !lagResources(r)}
                  className="flex w-full items-center gap-2 text-left text-xs"
                >
                  <span className={`shrink-0 rounded px-1.5 py-0.5 ${level.className}`}>{level.label}</span>
                  <span className="shrink-0 text-white/50">{when(r.start)}</span>
                  <span className="shrink-0 text-white/70">{r.versionId}</span>
                  <span className="min-w-0 flex-1 truncate text-white/60">{lagSummary(r)}</span>
                  {(r.tips.length > 0 || lagResources(r)) && (
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
                {expanded && (
                  <div className="mt-1.5">
                    <LagTips report={r} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-white/40">
        {
          '游戏不会在日志里记录帧数，这里根据游戏日志（服务器跟不上、内存不足、连接超时）和游戏运行时的内存、CPU 占用来判断'
        }
      </p>
    </div>
  )
}
