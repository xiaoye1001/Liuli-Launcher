import { useState } from 'react'
import { ChevronDown, HardDrive, Loader2, Scissors } from 'lucide-react'
import type { WorldSizeReport, WorldTrimPlan } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const SELECT =
  'rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs outline-none focus:border-emerald-400/50'

/** 存档体积：各部分占多少空间，删掉几乎没去过的区域 */
function WorldSizePanel({
  versionId,
  folder,
  onTrimmed
}: {
  versionId: string
  folder: string
  onTrimmed?: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<WorldSizeReport | null>(null)
  const [plan, setPlan] = useState<WorldTrimPlan | null>(null)
  const [minutes, setMinutes] = useState(1)
  const [radius, setRadius] = useState(1024)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false)

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const analyze = (): Promise<void> =>
    run('analyze', async () => {
      setReport(await window.api.analyzeWorldSize(versionId, folder))
    })

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && !report) void analyze()
  }

  const check = (): Promise<void> =>
    run('plan', async () => {
      setNotice('')
      setConfirm(false)
      setPlan(await window.api.planWorldTrim(versionId, folder, minutes, radius))
    })

  const apply = (): Promise<void> =>
    run('apply', async () => {
      const r = await window.api.applyWorldTrim(versionId, folder, minutes, radius)
      setNotice(
        `已删掉 ${r.removed} 个区域，省下 ${formatBytes(r.bytes)}。删之前的完整备份：${r.backup.split(/[\\/]/).pop()}`
      )
      setPlan(null)
      setConfirm(false)
      setReport(await window.api.analyzeWorldSize(versionId, folder))
      onTrimmed?.()
    })

  const max = report ? Math.max(...report.parts.map((p) => p.bytes), 1) : 1

  return (
    <div data-testid="world-size">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        存档体积和瘦身
        {report && <span className="text-white/40">{formatBytes(report.total)}</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {!report && busy === 'analyze' && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
          {report && (
            <div className="space-y-1">
              {report.parts.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-xs" data-testid="world-size-part">
                  <span className="w-28 shrink-0 truncate text-white/70">{p.name}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${(p.bytes / max) * 100}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums text-white/60">
                    {formatBytes(p.bytes)}
                    {p.regions > 0 && <span className="text-white/40"> · {p.regions} 区</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 rounded-lg bg-black/20 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-white/80">
              <Scissors className="h-3.5 w-3.5" />
              瘦身：删掉几乎没去过的区域
            </div>
            <div className="text-white/50">
              {
                '游戏记着你在每块区域待了多久。几乎没待过、离出生点和你的位置都远的区域可以删掉，下次走过去时会按种子重新生成（里面建的东西会没有）。删之前会先完整备份存档'
              }
            </div>
            <div className="flex flex-wrap items-center gap-2 text-white/70">
              待过的时间
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                aria-label="待过的时间"
                className={SELECT}
              >
                <option value={0}>完全没待过</option>
                <option value={1}>少于 1 分钟</option>
                <option value={5}>少于 5 分钟</option>
              </select>
              保留出生点和我的位置周围
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                aria-label="保留范围"
                className={SELECT}
              >
                {[256, 512, 1024, 2048].map((r) => (
                  <option key={r} value={r}>
                    {r} 格
                  </option>
                ))}
              </select>
              <button
                onClick={() => void check()}
                disabled={!!busy}
                className="rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20 disabled:opacity-50"
              >
                {busy === 'plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '看看能省多少'}
              </button>
            </div>
            {plan && (
              <div className="space-y-1.5" data-testid="world-trim-plan">
                {plan.regions.length === 0 ? (
                  <div className="text-white/60">{`检查了 ${plan.scanned} 个区域，没有可以删掉的`}</div>
                ) : (
                  <>
                    <div className="text-white/70">
                      {`检查了 ${plan.scanned} 个区域，可以删掉 ${plan.regions.length} 个，省下 ${formatBytes(plan.bytes)}`}
                    </div>
                    <div className="max-h-24 overflow-y-auto font-mono text-[11px] text-white/40">
                      {plan.regions.map((r) => `${r.dimensionName} ${r.file}`).join('、')}
                    </div>
                    <button
                      onClick={() => (confirm ? void apply() : setConfirm(true))}
                      disabled={!!busy}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium text-white disabled:opacity-50 ${confirm ? 'bg-red-500/80 hover:bg-red-500' : 'bg-amber-500/80 hover:bg-amber-500'}`}
                    >
                      {busy === 'apply' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5" />
                      )}
                      {confirm ? '确认：备份后删掉这些区域' : `删掉这 ${plan.regions.length} 个区域`}
                    </button>
                  </>
                )}
              </div>
            )}
            {notice && <div className="text-emerald-300">{notice}</div>}
            {error && <div className="text-red-300">{error}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default WorldSizePanel
