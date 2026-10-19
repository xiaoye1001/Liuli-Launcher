import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  Link2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import {
  SOURCE_LABELS,
  SOURCE_STYLES,
  STATUS_LABELS,
  cleanIpcError,
  fileNameFromUrl,
  formatBytes,
  formatSpeed,
  isActiveDownload,
  useDownloads
} from '../utils/downloads'
import type { FastDownloadStatus, FastDownloadTask } from '../../../shared/types'

const MIN_THREADS = 1
const MAX_THREADS = 32
const DEFAULT_THREADS = 16
const PREFS_KEY = 'liuli-toolbox-downloader'

interface Prefs {
  directory: string
  threads: number
}

function clampThreads(value: unknown): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(MAX_THREADS, Math.max(MIN_THREADS, n)) : DEFAULT_THREADS
}

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return {
      directory: typeof saved.directory === 'string' ? saved.directory : '',
      threads: saved.threads === undefined ? DEFAULT_THREADS : clampThreads(saved.threads)
    }
  } catch {
    return { directory: '', threads: DEFAULT_THREADS }
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 无法保存时只是下次需要重新选择
  }
}

/** 进度条的颜色 */
const BAR_COLORS: Record<FastDownloadStatus, string> = {
  downloading: 'bg-emerald-400',
  paused: 'bg-amber-400',
  completed: 'bg-emerald-500',
  error: 'bg-red-400',
  cancelled: 'bg-white/30',
  fallback_retrying: 'bg-orange-400'
}

/** 总进度条 */
function TotalBar({ task }: { task: FastDownloadTask }): JSX.Element {
  return (
    <div
      className="relative h-2 overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-label="总进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(task.progress)}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${BAR_COLORS[task.status]} transition-[width] duration-200 ease-linear`}
        style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
      />
      {task.status === 'downloading' && task.progress > 0 && task.progress < 100 && (
        // 下载中时进度条上流动的高光
        <div className="download-shimmer absolute inset-0" style={{ width: `${task.progress}%` }} />
      )}
    </div>
  )
}

/** 类似 IDM / PCL2 的多格分块进度条：每个线程一格 */
function ChunkBar({ task }: { task: FastDownloadTask }): JSX.Element {
  const color = BAR_COLORS[task.status]
  return (
    <div
      className="flex h-2 gap-[2px]"
      aria-label={`分块进度，共 ${task.chunks.length} 块`}
      data-chunks={task.chunks.length}
    >
      {task.chunks.map((value, i) => (
        <div
          key={i}
          className="relative flex-1 overflow-hidden rounded-[3px] bg-white/10"
          title={`线程 ${i + 1}：${value.toFixed(0)}%`}
        >
          <div
            className={`absolute inset-y-0 left-0 ${color} transition-[width] duration-200 ease-linear ${
              task.status === 'downloading' && value > 0 && value < 100 ? 'chunk-active' : ''
            }`}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        </div>
      ))}
    </div>
  )
}

/** 来源标签：Mod / 整合包 / 百宝箱直链 / 资源；回退时显示「兼容模式下载中」 */
function SourceTags({ task }: { task: FastDownloadTask }): JSX.Element {
  const original = task.source === 'fallback' ? task.originalSource : task.source
  return (
    <>
      {original && (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${SOURCE_STYLES[original]}`}>
          {SOURCE_LABELS[original]}
        </span>
      )}
      {task.source === 'fallback' && (
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${SOURCE_STYLES.fallback}`}>
          {task.status === 'fallback_retrying' ? '兼容模式下载中' : '兼容模式'}
        </span>
      )}
    </>
  )
}

function StatusBadge({ task }: { task: FastDownloadTask }): JSX.Element | null {
  // 兼容模式下载中已经由来源标签显示
  if (task.status === 'fallback_retrying') return null
  const styles: Record<FastDownloadStatus, string> = {
    downloading: 'bg-emerald-500/15 text-emerald-300',
    paused: 'bg-amber-500/15 text-amber-300',
    completed: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-red-500/15 text-red-300',
    cancelled: 'bg-white/10 text-white/50',
    fallback_retrying: ''
  }
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${styles[task.status]}`}>
      {STATUS_LABELS[task.status]}
    </span>
  )
}

/** 保存位置所在的文件夹 */
function folderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

function TaskCard({
  task,
  onError,
  onRetry
}: {
  task: FastDownloadTask
  onError: (message: string) => void
  onRetry: (task: FastDownloadTask) => void
}): JSX.Element {
  const run = (action: () => Promise<unknown>): void => {
    action().catch((e) => onError(cleanIpcError(e)))
  }
  const sizeText =
    task.totalBytes > 0
      ? `${formatBytes(task.downloadedBytes)} / ${formatBytes(task.totalBytes)}`
      : formatBytes(task.downloadedBytes)
  const running = task.status === 'downloading' || task.status === 'fallback_retrying'
  const connecting = task.status === 'downloading' && task.downloadedBytes === 0 && task.totalBytes === 0
  const button = 'rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      className="rounded-xl border border-white/10 bg-black/20 p-3"
      data-task={task.taskId}
      data-status={task.status}
    >
      <div className="flex items-center gap-2">
        {task.status === 'completed' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
        ) : task.status === 'error' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" />
        ) : running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-300" />
        ) : (
          <Download className="h-4 w-4 shrink-0 text-white/40" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={task.destination || task.url}>
            {task.fileName}
          </span>
          <SourceTags task={task} />
          <StatusBadge task={task} />
          {task.chunked && task.status !== 'fallback_retrying' && (
            <span className="shrink-0 text-[11px] text-white/40">{task.chunks.length} 线程</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {task.status === 'downloading' && (
            <button
              className={button}
              title="暂停"
              aria-label="暂停"
              onClick={() => run(() => window.api.pauseDownload(task.taskId))}
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
          {task.status === 'paused' && (
            <button
              className={button}
              title="继续"
              aria-label="继续"
              onClick={() => run(() => window.api.resumeDownload(task.taskId))}
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          {(task.status === 'error' || task.status === 'cancelled') && task.source === 'toolbox' && (
            <button className={button} title="重新下载" aria-label="重新下载" onClick={() => onRetry(task)}>
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {task.status === 'completed' && task.destination && (
            <button
              className={button}
              title="打开所在文件夹"
              aria-label="打开所在文件夹"
              onClick={() => run(() => window.api.openDownloadFolder(task.taskId))}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
          {(task.status === 'downloading' || task.status === 'paused') && (
            <button
              className={`${button} hover:bg-red-500/20`}
              title="取消任务"
              aria-label="取消任务"
              onClick={() => run(() => window.api.cancelDownload(task.taskId))}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {!isActiveDownload(task) && (
            <button
              className={button}
              title="从列表中移除"
              aria-label="从列表中移除"
              onClick={() => run(() => window.api.removeDownload(task.taskId))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 总进度 + 各线程分块 */}
      <div className="mt-2.5 flex flex-col gap-1.5">
        <TotalBar task={task} />
        <ChunkBar task={task} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
        <span className="font-medium text-white/80">{task.progress.toFixed(1)}%</span>
        <span>{sizeText}</span>
        {connecting ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在连接…
          </span>
        ) : (
          running && (
            <>
              <span className="flex items-center gap-1 font-medium tabular-nums text-emerald-300" aria-label="网速">
                <Gauge className="h-3.5 w-3.5" />
                {task.speedText}
              </span>
              <span>剩余 {task.etaText}</span>
            </>
          )
        )}
      </div>
      {task.status === 'fallback_retrying' && (
        <div className="mt-1.5 text-xs text-orange-300/90">
          高速下载没有成功，已自动切换到兼容模式继续下载（{task.fallbackReason}）
        </div>
      )}
      {task.status === 'completed' && task.source === 'fallback' && (
        <div className="mt-1.5 text-xs text-white/40">高速下载没有成功，已用兼容模式下载完成</div>
      )}
      {task.status === 'error' && task.error && (
        <div className="mt-1.5 break-all text-xs text-red-300">{task.error}</div>
      )}
    </motion.div>
  )
}

/** 百宝箱：高速多线程下载器（新建直链 + 全局任务列表） */
function FastDownloadPanel(): JSX.Element {
  const tasks = useDownloads()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [url, setUrl] = useState('')
  /** 保存的文件名；没有手动改过时跟随地址自动解析 */
  const [fileName, setFileName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  useEffect(() => savePrefs(prefs), [prefs])

  const changeUrl = (value: string): void => {
    setUrl(value)
    if (!nameEdited) setFileName(fileNameFromUrl(value))
  }

  const start = async (link: string, options: { directory?: string; fileName?: string } = {}): Promise<boolean> => {
    setError('')
    setBusy(true)
    try {
      await window.api.createDirectDownload(link.trim(), {
        directory: (options.directory ?? prefs.directory) || undefined,
        threads: prefs.threads,
        fileName: options.fileName
      })
      return true
    } catch (e) {
      setError(cleanIpcError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (!url.trim() || busy) return
    // 没有手动改过文件名时交给主进程决定（优先使用服务器提供的文件名）
    const ok = await start(url, { fileName: nameEdited ? fileName.trim() || undefined : undefined })
    if (ok) {
      setUrl('')
      setFileName('')
      setNameEdited(false)
    }
  }

  const browse = async (): Promise<void> => {
    const dir = await window.api.pickDownloadDir().catch(() => null)
    if (dir) setPrefs((p) => ({ ...p, directory: dir }))
  }

  const retry = (task: FastDownloadTask): void => {
    void window.api.removeDownload(task.taskId)
    void start(task.url, {
      directory: task.destination ? folderOf(task.destination) : prefs.directory,
      fileName: task.fileName
    })
  }

  const active = tasks.filter(isActiveDownload)
  const totalSpeed = active.reduce((sum, t) => sum + (t.status === 'paused' ? 0 : t.speed), 0)
  const shown = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'active' ? isActiveDownload(t) : !isActiveDownload(t)
  )
  const finishedCount = tasks.length - active.length

  return (
    <div className="flex flex-col gap-4">
      {/* 新建直链下载 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-amber-300" />
          高速多线程下载器
        </div>
        <p className="mt-1 text-xs text-white/50">
          粘贴任意 HTTP / HTTPS 直链，服务器支持时自动分块多线程下载；Mod、整合包的下载也会显示在下面的任务列表里
        </p>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-400/50">
            <Link2 className="h-4 w-4 shrink-0 text-white/40" />
            <input
              value={url}
              onChange={(e) => changeUrl(e.target.value)}
              placeholder="粘贴下载直链，例如 https://example.com/file.zip"
              aria-label="下载地址"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-400/50">
              <FileText className="h-4 w-4 shrink-0 text-white/40" />
              <input
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value)
                  setNameEdited(true)
                }}
                placeholder="保存的文件名（留空时使用服务器提供的文件名）"
                aria-label="保存的文件名"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-white/30"
              />
              {nameEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setNameEdited(false)
                    setFileName(fileNameFromUrl(url))
                  }}
                  className="shrink-0 text-xs text-white/40 hover:text-white"
                >
                  自动
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void browse()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm hover:bg-white/20"
            >
              <FolderOpen className="h-4 w-4" />
              浏览
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            保存到
            <span
              className="min-w-0 flex-1 truncate text-white/80"
              title={prefs.directory || '系统的「下载」文件夹'}
              data-directory
            >
              {prefs.directory || '系统的「下载」文件夹'}
            </span>
            {prefs.directory && (
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, directory: '' }))}
                className="shrink-0 text-white/40 hover:text-white"
              >
                恢复默认
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex min-w-0 flex-1 items-center gap-3 text-xs text-white/60">
              <span className="shrink-0">线程数</span>
              <input
                type="range"
                min={MIN_THREADS}
                max={MAX_THREADS}
                step={1}
                value={prefs.threads}
                onChange={(e) => setPrefs((p) => ({ ...p, threads: clampThreads(e.target.value) }))}
                aria-label="线程数"
                className="min-w-0 flex-1 accent-emerald-500"
              />
              <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums text-white" data-threads>
                {prefs.threads} 线程
              </span>
            </label>
            <button
              type="submit"
              disabled={!url.trim() || busy}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 transition-transform hover:scale-[1.02] disabled:scale-100 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              立即高速下载
            </button>
          </div>
        </form>
        {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      </section>

      {/* 全局任务列表 */}
      <section className="flex flex-col rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">下载任务</div>
          <div className="flex rounded-lg bg-black/20 p-0.5 text-xs" role="tablist">
            {(
              [
                ['all', `全部 ${tasks.length}`],
                ['active', `进行中 ${active.length}`],
                ['done', `已结束 ${finishedCount}`]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  filter === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-white/50">
            {active.length > 0 && (
              <span className="flex items-center gap-1 font-medium tabular-nums text-emerald-300" aria-label="总速度">
                <Gauge className="h-3.5 w-3.5" />
                {formatSpeed(totalSpeed)}
              </span>
            )}
            {finishedCount > 0 && (
              <button
                onClick={() => void window.api.removeDownload()}
                className="flex items-center gap-1 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除已结束
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          {shown.length === 0 ? (
            <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 text-sm text-white/40">
              <Download className="h-8 w-8" />
              {tasks.length === 0 ? '还没有下载任务' : '没有符合条件的任务'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {shown.map((task) => (
                  <TaskCard key={task.taskId} task={task} onError={setError} onRetry={retry} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default FastDownloadPanel
