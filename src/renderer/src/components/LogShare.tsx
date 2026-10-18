import { useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Share2, X } from 'lucide-react'
import type { SharedLog } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

type ShareState =
  | { step: 'idle' }
  | { step: 'confirm' }
  | { step: 'uploading' }
  | { step: 'done'; logs: SharedLog[] }
  | { step: 'error'; message: string }

export interface LogShareControl {
  state: ShareState
  /** 点分享按钮：先请用户确认 */
  ask: () => void
  confirm: () => Promise<void>
  close: () => void
}

/** 分享日志的流程：确认 → 上传 → 显示链接（第一个链接自动复制到剪贴板） */
export function useLogShare(share: () => Promise<SharedLog[]>): LogShareControl {
  const [state, setState] = useState<ShareState>({ step: 'idle' })
  return {
    state,
    ask: () => setState({ step: 'confirm' }),
    close: () => setState({ step: 'idle' }),
    confirm: async () => {
      setState({ step: 'uploading' })
      try {
        const logs = await share()
        setState({ step: 'done', logs })
        await navigator.clipboard.writeText(logs.map((l) => l.url).join('\n')).catch(() => undefined)
      } catch (e) {
        setState({ step: 'error', message: cleanError(e) })
      }
    }
  }
}

/** 分享按钮 */
export function ShareButton({
  control,
  label = '分享日志',
  className
}: {
  control: LogShareControl
  label?: string
  className: string
}): JSX.Element {
  const uploading = control.state.step === 'uploading'
  return (
    <button
      onClick={control.ask}
      disabled={uploading}
      title="上传到 mclo.gs，得到一个链接，发给别人就能查看日志"
      className={`${className} disabled:opacity-50`}
    >
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

function LinkRow({ log }: { log: SharedLog }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-white/60">{log.label}：</span>
      <a href={log.url} target="_blank" rel="noreferrer" className="truncate font-mono text-emerald-300 underline">
        {log.url}
      </a>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(log.url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        title="复制链接"
        className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <a
        href={log.url}
        target="_blank"
        rel="noreferrer"
        title="在浏览器中打开"
        className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

/** 分享的确认提示、上传结果或错误；没有在分享时不显示 */
export function ShareStatus({
  control,
  className = ''
}: {
  control: LogShareControl
  className?: string
}): JSX.Element | null {
  const { state } = control
  if (state.step === 'idle') return null
  const box = `flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-2.5 text-xs ${className}`
  const closeButton = (
    <button
      onClick={control.close}
      title="关闭"
      className="ml-auto rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )

  if (state.step === 'confirm') {
    return (
      <div className={`${box} bg-black/30`}>
        <span className="min-w-0 flex-1 text-white/70">
          日志会上传到 <b>mclo.gs</b>，拿到链接的人都能查看。上传前会去掉登录令牌和用户文件夹路径，mclo.gs 也会自动隐藏
          IP 地址。
        </span>
        <button
          onClick={control.confirm}
          className="rounded-lg bg-emerald-500/80 px-3 py-1.5 font-medium text-white hover:bg-emerald-500"
        >
          上传并获取链接
        </button>
        <button onClick={control.close} className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/10">
          取消
        </button>
      </div>
    )
  }
  if (state.step === 'uploading') {
    return (
      <div className={`${box} bg-black/30 text-white/60`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在上传…
      </div>
    )
  }
  if (state.step === 'error') {
    return (
      <div className={`${box} bg-red-500/20 text-red-200`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 break-all">{state.message}</span>
        <button onClick={control.confirm} className="rounded-lg px-2 py-1 hover:bg-white/10">
          重试
        </button>
        {closeButton}
      </div>
    )
  }
  return (
    <div className={`${box} bg-emerald-500/15`}>
      <div className="flex w-full items-center gap-2 text-emerald-200">
        <Check className="h-3.5 w-3.5 shrink-0" />
        已上传，链接已复制，发给别人即可查看
        {closeButton}
      </div>
      {state.logs.map((log) => (
        <LinkRow key={log.url} log={log} />
      ))}
    </div>
  )
}
