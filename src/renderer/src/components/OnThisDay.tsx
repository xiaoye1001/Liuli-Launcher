import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarHeart, Copy, FolderOpen, X } from 'lucide-react'
import type { OnThisDayShot } from '../../../shared/types'

function shotUrl(shot: OnThisDayShot, thumb: boolean): string {
  return `liuli://screenshot/${encodeURIComponent(shot.versionId)}/${encodeURIComponent(shot.fileName)}${thumb ? '?thumb=1' : ''}`
}

/** 那年今日的截图：按年份分组，点小图看大图 */
function OnThisDayDialog({ shots, onClose }: { shots: OnThisDayShot[]; onClose: () => void }): JSX.Element {
  const [current, setCurrent] = useState(shots[0])
  const [message, setMessage] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const thisYear = new Date().getFullYear()
  const years = useMemo(() => [...new Set(shots.map((s) => s.year))], [shots])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        setCurrent((c) => {
          const i = shots.indexOf(c) + (e.key === 'ArrowRight' ? 1 : -1)
          return shots[(i + shots.length) % shots.length]
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, shots])

  const copy = async (): Promise<void> => {
    try {
      await window.api.copyScreenshot(current.versionId, current.fileName)
      setMessage('已复制图片，可以直接粘贴到聊天里')
    } catch {
      setMessage('复制失败')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="那年今日"
        className="flex max-h-[90vh] w-[46rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <CalendarHeart className="h-4 w-4 text-rose-300" />
          <span className="flex-1">那年今日</span>
          <button
            onClick={onClose}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">
          {new Date().getMonth() + 1} 月 {new Date().getDate()} 日，往年的今天你在游戏里拍下了这些截图
        </p>

        <div className="mt-3 flex h-[40vh] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/40">
          <img src={shotUrl(current, false)} alt={current.fileName} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span className="min-w-0 flex-1 truncate">
            {new Date(current.time).toLocaleString('zh-CN', { hour12: false })} · {current.versionId}
          </span>
          <button
            onClick={() => void copy()}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
          >
            <Copy className="h-3.5 w-3.5" />
            复制图片
          </button>
          <button
            onClick={() => void window.api.showScreenshot(current.versionId, current.fileName)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            在文件夹中显示
          </button>
        </div>
        {message && <div className="mt-1 text-xs text-emerald-300">{message}</div>}

        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {years.map((year) => (
            <div key={year}>
              <div className="mb-1.5 text-xs text-white/60">
                {year} 年 · {thisYear - year} 年前
              </div>
              <div className="flex flex-wrap gap-2">
                {shots
                  .filter((s) => s.year === year)
                  .map((s) => (
                    <button
                      key={`${s.versionId}/${s.fileName}`}
                      onClick={() => setCurrent(s)}
                      aria-pressed={s === current}
                      title={s.fileName}
                      className={`overflow-hidden rounded-lg border-2 transition-colors ${
                        s === current ? 'border-emerald-400' : 'border-transparent hover:border-white/30'
                      }`}
                    >
                      <img src={shotUrl(s, true)} alt="" loading="lazy" className="h-16 w-28 object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 主页的「那年今日」小标签：往年的今天拍过截图时才显示，点开看截图 */
function OnThisDay({ className }: { className: string }): JSX.Element | null {
  const [shots, setShots] = useState<OnThisDayShot[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.api
      .screenshotsOnThisDay()
      .then(setShots)
      .catch(() => setShots([]))
  }, [])

  if (shots.length === 0) return null
  const years = new Set(shots.map((s) => s.year))
  const when = years.size === 1 ? `${new Date().getFullYear() - shots[0].year} 年前的今天` : '往年的今天'
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="往年的今天拍的游戏截图"
        className={`flex items-center gap-1.5 ${className}`}
      >
        <CalendarHeart className="h-3.5 w-3.5 shrink-0 text-rose-300" />
        那年今日 · {when} · {shots.length} 张截图
      </button>
      {open && <OnThisDayDialog shots={shots} onClose={() => setOpen(false)} />}
    </>
  )
}

export default OnThisDay
