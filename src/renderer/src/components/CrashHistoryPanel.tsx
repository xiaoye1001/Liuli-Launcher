import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, Trash2 } from 'lucide-react'
import { EmptyState, LoadingState } from './EmptyState'
import type { CrashRecord } from '../../../shared/types'

/** 百宝箱：崩溃记录（每次崩溃或启动失败的原因，看看是不是同一个问题反复出现） */
function CrashHistoryPanel(): JSX.Element {
  const [list, setList] = useState<CrashRecord[] | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    void window.api
      .listCrashHistory()
      .then(setList)
      .catch(() => setList([]))
  }, [])

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  /** 每个原因出现的次数 */
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of list ?? []) for (const c of r.causes) map.set(c, (map.get(c) ?? 0) + 1)
    return map
  }, [list])
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const recent = (list ?? []).filter((r) => Date.now() - r.at < 30 * 86_400_000).length

  const clear = async (): Promise<void> => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    setConfirmClear(false)
    await window.api.clearCrashHistory()
    setList([])
  }

  const box = 'rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl'
  if (!list) {
    return (
      <section className={box}>
        <LoadingState />
      </section>
    )
  }

  return (
    <section className={`${box} space-y-4`}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bug className="h-5 w-5 text-rose-300" />
            崩溃记录
          </h2>
          <p className="text-xs text-white/50">
            {list.length === 0
              ? '每次游戏崩溃或启动失败都会记在这里（最多 50 条）'
              : `最近 30 天 ${recent} 次${top && top[1] > 1 ? `；最常见的原因「${top[0]}」出现了 ${top[1]} 次` : ''}`}
          </p>
        </div>
        {list.length > 0 && (
          <button
            onClick={() => void clear()}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              confirmClear ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmClear ? '确认清空？' : '清空记录'}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Bug}>还没有崩溃过，真棒</EmptyState>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="rounded-xl bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                    r.kind === 'crash' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {r.kind === 'crash' ? '游戏崩溃' : '启动失败'}
                </span>
                <span className="font-medium">{r.versionId}</span>
                {r.exitCode !== null && <span className="text-xs text-white/40">退出码 {r.exitCode}</span>}
                <span className="ml-auto text-xs text-white/40">{new Date(r.at).toLocaleString('zh-CN')}</span>
              </div>
              {r.causes.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.causes.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80"
                    >
                      {c}
                      {(counts.get(c) ?? 0) > 1 && (
                        <span
                          title={`这个原因一共出现了 ${counts.get(c)} 次`}
                          className="rounded bg-rose-500/25 px-1 text-[10px] text-rose-200"
                        >
                          ×{counts.get(c)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              ) : r.detail ? (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-white/60">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="line-clamp-2 break-all font-mono">{r.detail}</span>
                </div>
              ) : (
                <div className="mt-1.5 text-xs text-white/40">没能自动识别原因</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default CrashHistoryPanel
