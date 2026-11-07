import { useEffect, useState } from 'react'
import { AlertTriangle, HardDrive, MemoryStick, Package, Play, Settings2, X } from 'lucide-react'
import type { LaunchCheckIssue } from '../../../shared/types'

const ICONS: Record<LaunchCheckIssue['kind'], typeof MemoryStick> = {
  memory: MemoryStick,
  mods: Package,
  disk: HardDrive
}

/**
 * 启动前检查发现问题时弹出：列出问题，可以仍然启动、去版本设置处理，或者取消。
 * 勾选「以后不再检查」后关掉启动前检查（设置 → 启动里可以再打开）
 */
function LaunchCheckDialog({
  versionId,
  issues,
  onContinue,
  onCancel,
  onOpenSettings
}: {
  versionId: string
  issues: LaunchCheckIssue[]
  onContinue: () => void
  onCancel: () => void
  /** 去版本设置（内存、模组问题在那里处理） */
  onOpenSettings?: () => void
}): JSX.Element {
  const [dontAsk, setDontAsk] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const remember = async (): Promise<void> => {
    if (dontAsk) await window.api.updateSettings({ preLaunchCheck: false }).catch(() => undefined)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="启动前检查"
        data-testid="launch-check"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-white/15 popover-background p-5 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              启动 {versionId} 之前发现了 {issues.length} 个问题
            </div>
            <div className="text-xs text-white/50">可以先处理再启动，也可以直接启动</div>
          </div>
          <button
            onClick={onCancel}
            aria-label="取消启动"
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {issues.map((issue, i) => {
            const Icon = ICONS[issue.kind]
            return (
              <li
                key={i}
                className="flex gap-3 rounded-xl bg-black/20 px-3 py-2.5"
                data-testid={`launch-check-${issue.kind}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{issue.title}</div>
                  <div className="mt-0.5 break-words text-xs text-white/60">{issue.detail}</div>
                </div>
              </li>
            )
          })}
        </ul>

        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="accent-emerald-500"
          />
          以后不再检查（可以在「设置 → 启动」里重新打开）
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {onOpenSettings && issues.some((i) => i.kind !== 'disk') && (
            <button
              onClick={() => void remember().then(onOpenSettings)}
              className="mr-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              <Settings2 className="h-4 w-4" />
              去版本设置
            </button>
          )}
          <button
            onClick={() => void remember().then(onCancel)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            取消
          </button>
          <button
            autoFocus
            onClick={() => void remember().then(onContinue)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-1.5 text-sm font-medium text-white"
          >
            <Play className="h-4 w-4 fill-current" />
            仍然启动
          </button>
        </div>
      </div>
    </div>
  )
}

export default LaunchCheckDialog
