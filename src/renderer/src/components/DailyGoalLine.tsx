import { useEffect, useState } from 'react'
import { Check, Flame, RefreshCw, Target } from 'lucide-react'
import type { DailyGoalStatus } from '../../../shared/types'

/** 主页的「每日小目标」：每天一个游戏里的小挑战，完成后打卡，连续打卡有成就 */
function DailyGoalLine(): JSX.Element | null {
  const [status, setStatus] = useState<DailyGoalStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api
      .getDailyGoal()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  const run = async (action: () => Promise<DailyGoalStatus>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      setStatus(await action())
    } catch {
      // 失败时保持原样
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  return (
    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-white/50" data-testid="daily-goal">
      <Target className={`mt-px h-3.5 w-3.5 shrink-0 ${status.done ? 'text-emerald-300' : 'text-sky-300'}`} />
      <span className={`min-w-0 ${status.done ? 'text-white/40 line-through decoration-white/30' : ''}`}>
        <span className={status.done ? '' : 'text-white/60'}>今日小目标：</span>
        {status.goal}
      </span>
      {!status.done && status.skipsLeft > 0 && (
        <button
          onClick={() => void run(() => window.api.skipDailyGoal())}
          disabled={busy}
          title={`换一个（今天还能换 ${status.skipsLeft} 次）`}
          aria-label="换一个小目标"
          className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/70"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
      <button
        onClick={() => void run(() => window.api.setDailyGoalDone(!status.done))}
        disabled={busy}
        aria-pressed={status.done}
        title={status.done ? '今天已经打卡了（点击取消）' : '在游戏里做到了就点一下打卡'}
        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-px transition-colors ${
          status.done
            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            : 'border border-white/15 text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Check className="h-3 w-3" />
        {status.done ? '已完成' : '完成打卡'}
      </button>
      {status.streak > 1 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-amber-300"
          title={`最长连续 ${status.best} 天，一共完成 ${status.total} 天`}
        >
          <Flame className="h-3 w-3" />
          连续 {status.streak} 天
        </span>
      )}
    </div>
  )
}

export default DailyGoalLine
