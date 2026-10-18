import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FileText,
  Lightbulb,
  Loader2,
  Terminal,
  X
} from 'lucide-react'
import { ShareButton, ShareStatus, useLogShare } from './LogShare'
import type { CrashAction, GameStatus } from '../../../shared/types'

const ACTION_LABELS: Record<CrashAction, string> = {
  versionSettings: '打开版本设置',
  versions: '前往「版本」页'
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface CrashCardProps {
  game: GameStatus
  onAction: (action: CrashAction) => void
  onDismiss: () => void
}

/** 启动失败或游戏崩溃时显示：识别出的原因、解决办法与相关文件 */
function CrashCard({ game, onAction, onDismiss }: CrashCardProps): JSX.Element {
  const analysis = game.analysis
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const share = useLogShare(() => window.api.shareCrashLogs())

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(cleanError(e))
    }
  }

  const exportInfo = async (): Promise<void> => {
    setExporting(true)
    await run(async () => {
      const path = await window.api.exportCrashInfo()
      if (path) setMessage(`已导出到 ${path}`)
    })
    setExporting(false)
  }

  const buttonClass =
    'flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="flex max-h-[55vh] min-h-0 flex-col rounded-2xl border border-red-400/20 bg-red-500/15 text-sm backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 px-5 pt-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
        <div className="min-w-0 flex-1 font-semibold text-red-100">
          {game.versionId} {analysis ? '崩溃了' : '启动失败'}
          {analysis?.exitCode !== undefined && analysis.exitCode !== null && (
            <span className="ml-2 text-xs font-normal text-red-200/60">退出码 {analysis.exitCode}</span>
          )}
        </div>
        <button
          onClick={onDismiss}
          title="关闭"
          className="rounded-lg p-1 text-red-200/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
        {!analysis && (
          <pre className="whitespace-pre-wrap break-all font-sans text-xs text-red-200/90">{game.error}</pre>
        )}
        {analysis && analysis.causes.length === 0 && (
          <div className="rounded-xl bg-black/20 px-4 py-3 text-white/80">
            <div className="font-medium">没能自动识别崩溃原因</div>
            {analysis.keyError && (
              <div className="mt-1 break-all font-mono text-xs text-red-200/90">{analysis.keyError}</div>
            )}
            <div className="mt-2 text-xs text-white/50">
              可以查看日志或崩溃报告，也可以「导出崩溃信息」发给别人帮忙看看。
            </div>
          </div>
        )}
        {analysis?.causes.map((cause, index) => (
          <div key={cause.title} className="rounded-xl bg-black/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">
                {analysis.causes.length > 1 && <span className="mr-1 text-red-300">{index + 1}.</span>}
                {cause.title}
              </span>
              {cause.action && (
                <button
                  onClick={() => onAction(cause.action!)}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  {ACTION_LABELS[cause.action]}
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="mt-1 text-xs text-white/70">{cause.detail}</div>
            {cause.mods && cause.mods.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cause.mods.map((mod) => (
                  <span key={mod} className="rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-200">
                    {mod}
                  </span>
                ))}
              </div>
            )}
            <ul className="mt-2 space-y-1">
              {cause.suggestions.map((s) => (
                <li key={s} className="flex items-start gap-1.5 text-xs text-white/80">
                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3">
        <button onClick={() => run(() => window.api.openLogWindow())} className={buttonClass}>
          <Terminal className="h-3.5 w-3.5" />
          查看日志
        </button>
        {analysis?.hasCrashReport && (
          <button onClick={() => run(() => window.api.openCrashFile('report'))} className={buttonClass}>
            <FileText className="h-3.5 w-3.5" />
            崩溃报告
          </button>
        )}
        {analysis?.hasNativeLog && (
          <button onClick={() => run(() => window.api.openCrashFile('native'))} className={buttonClass}>
            <FileText className="h-3.5 w-3.5" />
            Java 崩溃日志
          </button>
        )}
        {analysis && <ShareButton control={share} className={buttonClass} />}
        {analysis && (
          <button onClick={exportInfo} disabled={exporting} className={`${buttonClass} disabled:opacity-50`}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
            导出崩溃信息
          </button>
        )}
        {message && (
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-white/60" title={message}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {message}
          </span>
        )}
      </div>
      <ShareStatus control={share} className="mx-5 mb-3" />
    </motion.div>
  )
}

export default CrashCard
