import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  Gauge,
  Link2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  cleanIpcError,
  formatBytes,
  formatSpeed,
  isActiveDownload,
  useDownloads
} from '../utils/downloads'
import type { FastDownloadStatus, FastDownloadTask } from '../../../shared/types'

const THREAD_OPTIONS = [1, 2, 4, 8, 16, 32]
const PREFS_KEY = 'liuli-toolbox-downloader'

interface Prefs {
  directory: string
  threads: number
}

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return {
      directory: typeof saved.directory === 'string' ? saved.directory : '',
      threads: THREAD_OPTIONS.includes(Number(saved.threads)) ? Number(saved.threads) : 8
    }
  } catch {
    return { directory: '', threads: 8 }
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 无法保存时只是下次需要重新选择
  }
}

/** 分块进度条的颜色 */
const BAR_COLORS: Record<FastDownloadStatus, string> = {
  downloading: 'bg-emerald-400',
  paused: 'bg-amber-400',
  completed: 'bg-emerald-500',
  error: 'bg-red-400',
  cancelled: 'bg-white/30',
  fallback_retrying: 'bg-sky-400'
}

/** 类似 IDM / PCL2 的多格分块进度条：每个线程一格 */
function ChunkBar({ task }: { task: FastDownloadTask }): JSX.Element {
  const color = BAR_COLORS[task.status]
  return (
    <div
      className="flex h-2.5 gap-[2px]"
      aria-label={`分块进度，共 ${task.chunks.length} 块`}
      data-chunks={task.chunks.length}
    >
      {task.chunks.map((value, i) => (
        <div key={i} className="relative flex-1 overflow-hidden rounded-sm bg-white/10">
          <div
            className={`absolute inset-y-0 left-0 ${color} transition-[width] duration-200 ease-linear`}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ task }: { task: FastDownloadTask }): JSX.Element {
  const styles: Record<FastDownloadStatus, string> = {
    downloading: 'bg-emerald-500/15 text-emerald-300',
    paused: 'bg-amber-500/15 text-amber-300',
    completed: 'bg-emerald-500/15 text-emerald-300',
    error: 'bg-red-500/15 text-red-300',
    cancelled: 'bg-white/10 text-white/50',
    fallback_retrying: 'bg-sky-500/15 text-sky-300'
  }
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${styles[task.status]}`}>{STATUS_LABELS[task.status]}</span>
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
  const sourceLabel =
    task.source === 'fallback' && task.originalSource
      ? `${SOURCE_LABELS[task.originalSource]} · 普通下载`
      : SOURCE_LABELS[task.source]
  const sizeText =
    task.totalBytes > 0
      ? `${formatBytes(task.downloadedBytes)} / ${formatBytes(task.totalBytes)}`
      : formatBytes(task.downloadedBytes)
  const running = task.status === 'downloading' || task.status === 'fallback_retrying'
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" title={task.destination || task.url}>
              {task.fileName}
            </span>
            <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">
              {sourceLabel}
            </span>
            <StatusBadge task={task} />
            {task.chunked && task.status !== 'fallback_retrying' && (
              <span className="shrink-0 text-[11px] text-white/40">{task.chunks.length} 线程</span>
            )}
          </div>
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
          {task.destination && (
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
              title="取消"
              aria-label="取消"
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

      <div className="mt-2.5">
        <ChunkBar task={task} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
        <span>{task.progress.toFixed(1)}%</span>
        <span>{sizeText}</span>
        {task.status === 'downloading' && task.downloadedBytes === 0 && task.totalBytes === 0 ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在连接…
          </span>
        ) : (
          running && (
            <>
              <span className="flex items-center gap-1 text-emerald-300">
                <Gauge className="h-3.5 w-3.5" />
                {task.speedText}
              </span>
              <span>剩余 {task.etaText}</span>
            </>
          )
        )}
      </div>
      {task.status === 'fallback_retrying' && (
        <div className="mt-1.5 text-xs text-sky-300/90">
          高速下载没有成功，已自动改用普通方式下载：{task.fallbackReason}
        </div>
      )}
      {task.status === 'completed' && task.source === 'fallback' && (
        <div className="mt-1.5 text-xs text-white/40">高速下载没有成功，已用普通方式下载完成</div>
      )}
      {task.status === 'error' && task.error && (
        <div className="mt-1.5 break-all text-xs text-red-300">{task.error}</div>
      )}
    </motion.div>
  )
}

/** 百宝箱：高速多线程下载器 */
function FastDownloadPanel(): JSX.Element {
  const tasks = useDownloads()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  useEffect(() => savePrefs(prefs), [prefs])

  const start = async (link: string, directory = prefs.directory): Promise<void> => {
    setError('')
    setBusy(true)
    try {
      await window.api.createDirectDownload(link.trim(), { directory: directory || undefined, threads: prefs.threads })
      setUrl('')
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(false)
    }
  }

  const pickDirectory = async (): Promise<void> => {
    const dir = await window.api.pickDownloadDir().catch(() => null)
    if (dir) setPrefs((p) => ({ ...p, directory: dir }))
  }

  const retry = (task: FastDownloadTask): void => {
    void window.api.removeDownload(task.taskId)
    void start(task.url, task.destination ? folderOf(task.destination) : prefs.directory)
  }

  const active = tasks.filter(isActiveDownload)
  const totalSpeed = active.reduce((sum, t) => sum + (t.status === 'paused' ? 0 : t.speed), 0)
  const shown = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'active' ? isActiveDownload(t) : !isActiveDownload(t)
  )
  const finishedCount = tasks.length - active.length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* 新建下载 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4 text-emerald-300" />
          高速多线程下载器
        </div>
        <p className="mt-1 text-xs text-white/50">
          输入 HTTP / HTTPS 直链，服务器支持时自动分块多线程下载；模组、整合包的下载也会显示在下面
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim() && !busy) void start(url)
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-400/50">
            <Link2 className="h-4 w-4 shrink-0 text-white/40" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              aria-label="下载地址"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || busy}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            开始下载
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
          <label className="flex items-center gap-2">
            线程数
            <select
              value={prefs.threads}
              onChange={(e) => setPrefs((p) => ({ ...p, threads: Number(e.target.value) }))}
              aria-label="线程数"
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none"
            >
              {THREAD_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 items-center gap-2">
            保存到
            <span className="max-w-[22rem] truncate text-white/80" title={prefs.directory || '系统的「下载」文件夹'}>
              {prefs.directory || '系统的「下载」文件夹'}
            </span>
            <button onClick={() => void pickDirectory()} className="text-emerald-300 hover:underline">
              更改
            </button>
            {prefs.directory && (
              <button
                onClick={() => setPrefs((p) => ({ ...p, directory: '' }))}
                className="text-white/40 hover:text-white"
              >
                恢复默认
              </button>
            )}
          </div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      </section>

      {/* 任务列表 */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
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
                className={`rounded-md px-2.5 py-1 transition-colors ${filter === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-white/50">
            {active.length > 0 && (
              <span className="flex items-center gap-1 text-emerald-300" aria-label="总速度">
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
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {shown.length === 0 ? (
            <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 text-sm text-white/40">
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
