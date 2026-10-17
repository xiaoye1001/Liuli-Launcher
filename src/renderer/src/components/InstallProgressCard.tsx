import { motion } from 'framer-motion'
import { Check, CheckCircle2, Circle, Loader2, RotateCcw, X, XCircle } from 'lucide-react'
import type { InstallPhase, InstallStatus, InstallStep } from '../../../shared/types'

const PHASE_LABELS: Record<InstallPhase, string> = {
  version: '正在下载游戏本体',
  assets: '正在下载游戏资源文件',
  libraries: '正在下载依赖库',
  loader: '正在下载模组加载器',
  dependencies: '正在下载依赖库与资源文件',
  processing: '正在运行模组加载器安装程序，可能需要几分钟',
  java: '正在下载 Java 运行环境',
  modpack: '正在下载整合包的模组',
  unpack: '正在解压整合包里的文件'
}

/** 步骤列表里的名称 */
const STEP_LABELS: Record<InstallPhase, string> = {
  version: '游戏本体',
  assets: '游戏资源文件',
  libraries: '依赖库',
  loader: '模组加载器',
  dependencies: '依赖库与资源文件',
  processing: '安装模组加载器',
  java: 'Java 运行环境',
  modpack: '整合包的模组',
  unpack: '解压整合包文件'
}

/** 任务类型对应的动词（标题用） */
const ACTIONS = { install: '安装', repair: '修复', java: '下载' }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 一个步骤的进度：安装程序按「第几步」计数，其余按字节 */
function stepDetail(step: InstallStep): string {
  if (step.phase === 'processing') return step.total > 0 ? (step.done ? `${step.total} 步` : `${step.progress} / ${step.total} 步`) : ''
  if (step.total <= 0) return ''
  // 已完成的步骤只显示大小（文件已经存在、校验通过时不会有下载进度）
  if (step.done) return formatBytes(step.total)
  return `${formatBytes(step.progress)} / ${formatBytes(step.total)}`
}

/** 各个步骤的进度列表（同时进行的步骤会一起显示） */
function StepList({ steps, running }: { steps: InstallStep[]; running: boolean }): JSX.Element {
  return (
    <div className="mt-3 space-y-1">
      {steps.map((step) => {
        const percent = step.total > 0 ? Math.min(100, (step.progress / step.total) * 100) : 0
        return (
          <div key={step.phase} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : running ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-300" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-white/30" />
            )}
            <span className={`w-28 shrink-0 ${step.done ? 'text-white/50' : 'text-white/80'}`}>
              {STEP_LABELS[step.phase]}
            </span>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-black/30">
              <div
                className={`h-full rounded-full ${step.done ? 'bg-emerald-400/60' : 'bg-sky-400'}`}
                style={{ width: `${step.done ? 100 : percent}%` }}
              />
            </div>
            <span className="w-36 shrink-0 text-right font-mono text-white/40">{stepDetail(step)}</span>
          </div>
        )
      })}
    </div>
  )
}

interface InstallProgressCardProps {
  status: InstallStatus
  onCancel: () => void
  onRetry: () => void
  onDismiss: () => void
}

function InstallProgressCard({ status, onCancel, onRetry, onDismiss }: InstallProgressCardProps): JSX.Element {
  const action = ACTIONS[status.kind]
  const percent = status.total > 0 ? Math.min(100, (status.progress / status.total) * 100) : 0
  const running = status.state === 'running'

  const barColor =
    status.state === 'failed'
      ? 'from-red-500 to-rose-400'
      : status.state === 'cancelled'
        ? 'from-slate-500 to-slate-400'
        : 'from-emerald-500 to-cyan-400'

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        {running && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-300" />}
        {status.state === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
        {status.state === 'failed' && <XCircle className="h-5 w-5 shrink-0 text-red-400" />}
        {status.state === 'cancelled' && <XCircle className="h-5 w-5 shrink-0 text-white/50" />}

        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {running && `正在${status.kind === 'repair' ? '检查并修复' : action} ${status.versionId}`}
            {status.state === 'success' && `${status.versionId} ${action}完成`}
            {status.state === 'failed' && `${status.versionId} ${action}失败`}
            {status.state === 'cancelled' && `已取消${action} ${status.versionId}`}
          </div>
          <div className="text-xs text-white/50">
            {running ? PHASE_LABELS[status.phase] : `${formatBytes(status.progress)} / ${formatBytes(status.total)}`}
          </div>
        </div>

        {running && (
          <div className="text-right">
            <div className="font-mono text-lg font-bold text-emerald-300">{percent.toFixed(1)}%</div>
            {status.phase !== 'processing' && status.phase !== 'unpack' && (
              <div className="font-mono text-xs text-white/50">{formatBytes(status.speed)}/s</div>
            )}
          </div>
        )}

        {running ? (
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-red-500/30"
          >
            取消
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {status.state !== 'success' && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试
              </button>
            )}
            <button onClick={onDismiss} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
          animate={{ width: `${status.state === 'success' ? 100 : percent}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
        />
      </div>

      {running && (
        <div className="mt-2 font-mono text-xs text-white/40">
          {formatBytes(status.progress)} / {formatBytes(status.total)}
        </div>
      )}

      {status.steps && status.steps.length > 1 && <StepList steps={status.steps} running={running} />}
      {running && status.detail && (
        <div className="mt-2 truncate text-xs text-white/50" title={status.detail}>
          {status.detail}
        </div>
      )}

      {status.state === 'failed' && status.error && (
        <div className="mt-3 max-h-20 overflow-y-auto break-all rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">
          {status.error}
        </div>
      )}
    </motion.div>
  )
}

export default InstallProgressCard
