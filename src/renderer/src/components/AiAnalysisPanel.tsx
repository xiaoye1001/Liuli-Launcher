import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, Settings2, Sparkles, Square } from 'lucide-react'
import Markdown from './Markdown'
import type { AiAnalysisResult, AiConfig } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function newId(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

type Phase = 'idle' | 'running' | 'done' | 'error'

interface AiAnalysisPanelProps {
  /** 打开「设置 → AI 助手」 */
  onOpenSettings: () => void
  /** 当前分析的编号变化时通知（关闭崩溃卡片时用来取消） */
  onAnalysisId?: (id: string | null) => void
}

/**
 * 崩溃卡片里的 AI 分析：开启了自动分析时卡片出现就开始，回答逐字显示；
 * 没有设置 AI 助手时提示去设置
 */
function AiAnalysisPanel({ onOpenSettings, onAnalysisId }: AiAnalysisPanelProps): JSX.Element | null {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [result, setResult] = useState<AiAnalysisResult | null>(null)
  const [error, setError] = useState('')
  const idRef = useRef<string | null>(null)
  const pending = useRef('')
  const flushTimer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(true)
  // 回调放在 ref 里：父组件每次渲染传入新函数时，不能让自动分析重新开始
  const onAnalysisIdRef = useRef(onAnalysisId)
  onAnalysisIdRef.current = onAnalysisId

  // 新文字攒一小会儿再显示，避免每个字都重新渲染
  useEffect(() => {
    mounted.current = true
    const off = window.api.onAiDelta((delta) => {
      if (delta.id !== idRef.current) return
      pending.current += delta.text
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          flushTimer.current = undefined
          const chunk = pending.current
          pending.current = ''
          setText((prev) => prev + chunk)
        }, 60)
      }
    })
    return () => {
      mounted.current = false
      off()
      clearTimeout(flushTimer.current)
      flushTimer.current = undefined
    }
  }, [])

  const start = useCallback(async (force: boolean) => {
    const id = newId()
    idRef.current = id
    onAnalysisIdRef.current?.(id)
    pending.current = ''
    setText('')
    setResult(null)
    setError('')
    setPhase('running')
    try {
      const res = await window.api.aiAnalyze(id, force)
      if (!mounted.current || idRef.current !== id) return
      clearTimeout(flushTimer.current)
      flushTimer.current = undefined
      pending.current = ''
      setText(res.text)
      setResult(res)
      setPhase('done')
    } catch (e) {
      if (!mounted.current || idRef.current !== id) return
      const message = cleanError(e)
      if (message === '已取消') {
        setPhase('idle')
      } else {
        setError(message)
        setPhase('error')
      }
    } finally {
      if (idRef.current === id) {
        idRef.current = null
        onAnalysisIdRef.current?.(null)
      }
    }
  }, [])

  // 读取设置；开启了自动分析就直接开始（同一次崩溃已经分析过时会直接得到上次的结果）
  useEffect(() => {
    let alive = true
    void window.api.aiGetConfig().then((cfg) => {
      if (!alive) return
      setConfig(cfg)
      if (cfg.ready && cfg.autoAnalyze) void start(false)
    })
    return () => {
      alive = false
    }
  }, [start])

  const stop = (): void => {
    const id = idRef.current
    if (id) void window.api.aiCancel(id)
  }

  if (!config) return null

  const smallButton =
    'flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20'

  // 还没有设置：提示去设置
  if (!config.ready) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-300" />
        <div className="min-w-0 flex-1 text-xs text-white/70">
          在「设置 → AI 助手」里填写自己的 API Key 后，可以让 AI 分析崩溃原因并给出解决方法
        </div>
        <button onClick={onOpenSettings} className={smallButton}>
          <Settings2 className="h-3.5 w-3.5" />
          去设置
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-black/25 px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="font-semibold text-white">AI 分析</span>
        {phase === 'running' && (
          <span className="flex items-center gap-1 text-xs text-white/50">
            <Loader2 className="h-3 w-3 animate-spin" />
            {text ? '正在回答…' : '正在思考…'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {phase === 'idle' && (
            <button
              onClick={() => void start(false)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
            >
              <Sparkles className="h-3.5 w-3.5" />
              分析原因
            </button>
          )}
          {phase === 'running' && (
            <button onClick={stop} className={smallButton}>
              <Square className="h-3 w-3 fill-current" />
              停止
            </button>
          )}
          {(phase === 'done' || phase === 'error') && (
            <button onClick={() => void start(true)} className={smallButton}>
              <RotateCcw className="h-3.5 w-3.5" />
              {phase === 'error' ? '重试' : '重新分析'}
            </button>
          )}
        </div>
      </div>

      {phase === 'idle' && (
        <div className="mt-2 text-xs text-white/50">
          会把崩溃报告和日志的关键部分（已去掉登录令牌、电脑用户名等隐私信息）发送给你在设置里选择的服务商。
        </div>
      )}
      {text && <Markdown text={text} className="mt-2" />}
      {phase === 'error' && (
        <div className="mt-2 flex items-start gap-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-all">{error}</span>
          {/(设置|API Key|模型|接口)/.test(error) && (
            <button onClick={onOpenSettings} className={smallButton}>
              <Settings2 className="h-3.5 w-3.5" />
              去设置
            </button>
          )}
        </div>
      )}
      {phase === 'done' && result && (
        <div className="mt-2 text-[11px] text-white/40">
          由 {result.model} 生成，仅供参考
          {result.cached && ' · 这次崩溃之前分析过，显示的是上次的结果'}
          {result.trimmedInput && ' · 日志较长，只发送了关键部分'}
          {result.truncated && ' · 回答太长被截断了'}
        </div>
      )}
    </div>
  )
}

export default AiAnalysisPanel
