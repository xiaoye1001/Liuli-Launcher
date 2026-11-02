import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Sparkles, X } from 'lucide-react'
import type { PerformanceModResult, ShaderChoice, ShaderSetupResult } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const CHOICES: { id: ShaderChoice; name: string; desc: string }[] = [
  { id: 'quality', name: '画面好', desc: 'Complementary Reimagined：光影、水面、天空都很漂亮，适合配置较好的电脑' },
  { id: 'fast', name: '流畅', desc: 'MakeUp Ultra Fast：轻量光影，配置一般的电脑也能比较流畅' }
]

const STATUS_TEXT: Record<PerformanceModResult['status'], string> = {
  installed: '完成',
  already: '已经有了',
  skipped: '跳过',
  unavailable: '没有适用的版本',
  failed: '失败'
}

/** 一键光影：选择光影包，自动装好光影加载器和渲染优化模组，下载光影包并开启 */
function ShaderSetupDialog({
  versionId,
  onClose,
  onDone
}: {
  versionId: string
  onClose: () => void
  /** 装好了一些东西：刷新光影列表 */
  onDone: () => void
}): JSX.Element {
  const [choice, setChoice] = useState<ShaderChoice>('quality')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ShaderSetupResult | null>(null)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const next = await window.api.setupShaders(versionId, choice)
      setResult(next)
      onDone()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label={`一键光影 ${versionId}`}
        className="flex max-h-[85vh] w-[32rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <span className="min-w-0 flex-1 truncate">一键光影 · {versionId}</span>
          <button
            onClick={() => closeRef.current()}
            disabled={busy}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/50">
          自动安装光影加载器（Fabric 用 Iris，Forge 用 Oculus，已经有 OptiFine 时直接用它）和需要的渲染优化模组，
          下载光影包并开启，下次进入游戏生效
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="光影包">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={choice === c.id}
              onClick={() => setChoice(c.id)}
              disabled={busy}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                choice === c.id
                  ? 'border-amber-400/40 bg-amber-500/15'
                  : 'border-white/10 bg-white/5 enabled:hover:bg-white/10'
              }`}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="mt-1 text-xs leading-5 text-white/50">{c.desc}</div>
            </button>
          ))}
        </div>

        {result && (
          <div className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                {step.status === 'installed' || step.status === 'already' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                ) : step.status === 'failed' ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
                ) : (
                  <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{step.name}</span>
                  <span className="ml-1.5 text-white/50">{STATUS_TEXT[step.status]}</span>
                  {step.detail && <div className="break-all text-white/50">{step.detail}</div>}
                </div>
              </div>
            ))}
            <div className={`pt-1 text-xs ${result.activated ? 'text-emerald-300' : 'text-amber-200'}`} role="status">
              {result.activated
                ? `光影已经开启，启动游戏就能看到。觉得卡可以在游戏的光影设置里调低质量${choice === 'quality' ? '，或者换成「流畅」' : ''}`
                : '没能全部完成，可以看看上面的说明'}
            </div>
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => closeRef.current()}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {result ? '完成' : '取消'}
          </button>
          {!result?.activated && (
            <button
              onClick={() => void start()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/80 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy ? '正在安装…' : result ? '再试一次' : '安装并开启'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ShaderSetupDialog
