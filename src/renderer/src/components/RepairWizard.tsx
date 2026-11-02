import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Loader2, Wrench, X } from 'lucide-react'
import type { InstallStatus, RepairInfo } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 自定义启动设置的名称 */
const ARG_NAMES: Record<string, string> = {
  jvmArgs: 'JVM 参数',
  gameArgs: '游戏参数',
  wrapperCommand: '包装命令',
  envVars: '环境变量',
  preLaunchCommand: '启动前执行的命令'
}

type StepState = 'todo' | 'running' | 'done' | 'ok' | 'error'

/** 向导里的一步：序号、标题、说明、状态和操作按钮 */
function Step({
  index,
  title,
  state,
  children,
  action
}: {
  index: number
  title: string
  state: StepState
  children: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex gap-3 rounded-xl bg-white/5 px-3 py-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          state === 'done' || state === 'ok'
            ? 'bg-emerald-500/25 text-emerald-300'
            : state === 'error'
              ? 'bg-red-500/25 text-red-300'
              : 'bg-white/10 text-white/70'
        }`}
      >
        {state === 'done' || state === 'ok' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : state === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          index
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-sm font-medium">{title}</div>
          {action}
        </div>
        <div className="mt-1 text-xs leading-5 text-white/60">{children}</div>
      </div>
    </div>
  )
}

const ACTION_CLASS =
  'flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50'

/** 游戏打不开修复向导：按顺序排查常见原因，每一步都可以单独执行 */
function RepairWizard({ versionId, onClose }: { versionId: string; onClose: () => void }): JSX.Element {
  const [info, setInfo] = useState<RepairInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  /** 每一步的状态和结果文字 */
  const [states, setStates] = useState<Record<string, { state: StepState; text?: string }>>({})
  const [repair, setRepair] = useState<InstallStatus | null>(null)
  const repairStarted = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const refresh = useCallback(async () => {
    try {
      setInfo(await window.api.getRepairInfo(versionId))
    } catch (e) {
      setLoadError(cleanError(e))
    }
  }, [versionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 检查游戏文件的进度
  useEffect(
    () =>
      window.api.onInstallStatus((status) => {
        if (!repairStarted.current || !status || status.kind !== 'repair' || status.versionId !== versionId) return
        setRepair(status)
      }),
    [versionId]
  )

  const setStep = (key: string, state: StepState, text?: string): void =>
    setStates((prev) => ({ ...prev, [key]: { state, text } }))

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setStep(key, 'running')
    try {
      setStep(key, 'done', await action())
    } catch (e) {
      setStep(key, 'error', cleanError(e))
    }
    void refresh()
  }

  const startRepair = async (): Promise<void> => {
    setStep('files', 'running')
    setRepair(null)
    repairStarted.current = true
    try {
      await window.api.repairVersion(versionId)
    } catch (e) {
      repairStarted.current = false
      setStep('files', 'error', cleanError(e))
    }
  }

  // 修复任务结束时更新这一步的状态
  useEffect(() => {
    if (!repair) return
    if (repair.state === 'success') setStep('files', 'done', '游戏文件已经完整，缺失或损坏的文件都重新下载了')
    else if (repair.state === 'failed') setStep('files', 'error', `检查失败：${repair.error || '未知原因'}`)
    else if (repair.state === 'cancelled') setStep('files', 'error', '已取消')
  }, [repair])

  const stateOf = (key: string, fallback: StepState): StepState => states[key]?.state ?? fallback
  const resultLine = (key: string): ReactNode => {
    const s = states[key]
    if (!s?.text || s.state === 'running') return null
    return (
      <div className={`mt-1 ${s.state === 'error' ? 'text-red-300' : 'text-emerald-300'}`} role="status">
        {s.text}
      </div>
    )
  }
  const busy = Object.values(states).some((s) => s.state === 'running')

  const javaAuto = info ? info.javaMode === 'auto' || (info.javaMode === 'global' && info.javaAuto) : false
  const repairPercent =
    repair && repair.state === 'running' && repair.total > 0 ? Math.floor((repair.progress / repair.total) * 100) : null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label={`修复向导 ${versionId}`}
        className="flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Wrench className="h-4 w-4 text-emerald-300" />
          <span className="min-w-0 flex-1 truncate">游戏打不开？修复向导 · {versionId}</span>
          <button
            onClick={onClose}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">按顺序试试下面的办法，每做一步可以先启动游戏看看好了没有</p>

        {loadError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {loadError}
          </div>
        )}
        {!info && !loadError && (
          <div className="flex justify-center py-10 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {info && (
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
            <Step
              index={1}
              title="检查并修复游戏文件"
              state={stateOf('files', 'todo')}
              action={
                <button onClick={() => void startRepair()} disabled={busy} className={ACTION_CLASS}>
                  开始检查
                </button>
              }
            >
              重新下载缺失或损坏的游戏本体、依赖库和资源文件
              {repairPercent !== null && <div className="mt-1 text-white/70">正在检查… {repairPercent}%</div>}
              {resultLine('files')}
            </Step>

            <Step
              index={2}
              title="Java 改为自动选择"
              state={stateOf('java', javaAuto ? 'ok' : 'todo')}
              action={
                !javaAuto && (
                  <button
                    onClick={() =>
                      void run('java', async () => {
                        await window.api.repairAutoJava(versionId)
                        return '已改为自动选择，启动时会挑选合适的 Java'
                      })
                    }
                    disabled={busy}
                    className={ACTION_CLASS}
                  >
                    改为自动选择
                  </button>
                )
              }
            >
              {javaAuto
                ? '已经是自动选择：启动时挑选这个版本需要的 Java，本机没有时自动下载'
                : `这个版本使用${info.javaMode === 'custom' ? '单独指定' : '全局设置里指定'}的 Java，版本不合适时游戏会打不开`}
              {resultLine('java')}
            </Step>

            <Step
              index={3}
              title="清除自定义启动参数"
              state={stateOf('args', info.customArgs.length === 0 ? 'ok' : 'todo')}
              action={
                info.customArgs.length > 0 && (
                  <button
                    onClick={() =>
                      void run('args', async () => {
                        await window.api.repairClearArgs(versionId)
                        return '已清除，可以在版本设置的「高级选项」里重新填写'
                      })
                    }
                    disabled={busy}
                    className={ACTION_CLASS}
                  >
                    清除
                  </button>
                )
              }
            >
              {info.customArgs.length === 0
                ? '这个版本没有设置过自定义启动参数'
                : `这个版本设置了：${info.customArgs.map((k) => ARG_NAMES[k] ?? k).join('、')}，填错时游戏会打不开`}
              {resultLine('args')}
            </Step>

            <Step
              index={4}
              title="暂时禁用最近添加的模组"
              state={stateOf('mods', info.recentMods.length === 0 ? 'ok' : 'todo')}
              action={
                info.recentMods.length > 0 &&
                !info.allModsRecent && (
                  <button
                    onClick={() =>
                      void run('mods', async () => {
                        const { done, failed } = await window.api.repairDisableMods(versionId, info.recentMods)
                        if (failed.length > 0) throw new Error(`以下模组没能禁用：${failed.join('、')}`)
                        return `已禁用 ${done.length} 个模组，确认是哪个模组的问题后可以在模组页重新启用其他的`
                      })
                    }
                    disabled={busy}
                    className={ACTION_CLASS}
                  >
                    禁用这 {info.recentMods.length} 个
                  </button>
                )
              }
            >
              {info.recentMods.length === 0
                ? '最近 3 天没有添加或更新过模组'
                : info.allModsRecent
                  ? '这个版本的模组都是最近装的，没法判断是哪个模组的问题，可以先试试其他办法或查看日志'
                  : '最近 3 天添加或更新了下面这些模组，新模组和其他模组不兼容时游戏会打不开：'}
              {info.recentMods.length > 0 && !info.allModsRecent && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {info.recentMods.map((mod) => (
                    <span
                      key={mod}
                      className="rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] text-amber-200"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              )}
              {resultLine('mods')}
            </Step>

            <Step
              index={5}
              title="画质改成流畅、关闭全屏"
              state={stateOf('video', 'todo')}
              action={
                <button
                  onClick={() =>
                    void run('video', async () => {
                      await window.api.repairResetVideo(versionId)
                      return info.hasOptions
                        ? '已改成流畅画质并关闭全屏，原来的设置已备份，可以在版本设置的「游戏内设置」里恢复'
                        : '已关闭「全屏启动」'
                    })
                  }
                  disabled={busy}
                  className={ACTION_CLASS}
                >
                  重置
                </button>
              }
            >
              显卡驱动较旧、全屏切换出问题、视距太远内存不够时，游戏可能黑屏或闪退
              {resultLine('video')}
            </Step>
          </div>
        )}

        <div className="mt-4 text-xs leading-5 text-white/50">
          还是打不开？可以在崩溃提示里查看日志、导出崩溃信息发给别人帮忙看看，或者让「AI 助手」分析原因。
        </div>
      </div>
    </div>,
    document.body
  )
}

export default RepairWizard
