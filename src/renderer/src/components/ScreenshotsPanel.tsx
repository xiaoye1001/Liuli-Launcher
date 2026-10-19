import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Trash2,
  X
} from 'lucide-react'
import type { Screenshot, ScreenshotList } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function imageUrl(versionId: string, shot: Screenshot, thumb: boolean): string {
  // 带上修改时间，截图被替换后不会显示缓存里的旧图
  return `liuli://screenshot/${encodeURIComponent(versionId)}/${encodeURIComponent(shot.fileName)}?t=${Math.round(shot.time)}${thumb ? '&thumb=1' : ''}`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 游戏截图：缩略图网格，点开大图预览，复制到剪贴板、在文件夹中显示、删除 */
function ScreenshotsPanel({ versionId }: { versionId: string }): JSX.Element {
  const [list, setList] = useState<ScreenshotList | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在预览的截图序号 */
  const [preview, setPreview] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await window.api.listScreenshots(versionId))
    } catch (e) {
      setError(cleanError(e))
      setList({ versionId, dir: '', items: [] })
    }
  }, [versionId])

  useEffect(() => {
    load()
  }, [load])

  const items = list?.items ?? []
  const current = preview !== null ? items[preview] : undefined
  /** 最新的截图列表：连续删除时，后一次删除不能用旧列表把前一次删掉的截图加回来 */
  const itemsRef = useRef(items)
  itemsRef.current = items

  const run = async (action: () => Promise<unknown>, message?: string): Promise<void> => {
    setError('')
    setNotice('')
    try {
      await action()
      if (message) setNotice(message)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const remove = (shot: Screenshot): Promise<void> =>
    run(async () => {
      await window.api.deleteScreenshot(versionId, shot.fileName)
      const next = itemsRef.current.filter((s) => s.fileName !== shot.fileName)
      itemsRef.current = next
      setList((prev) => prev && { ...prev, items: prev.items.filter((s) => s.fileName !== shot.fileName) })
      // 预览中删除时显示下一张，删完了就关闭预览
      setPreview((p) => (p === null || next.length === 0 ? null : Math.min(p, next.length - 1)))
    }, `已把 ${shot.fileName} 移到回收站`)

  // 预览时键盘左右切换、Esc 关闭
  useEffect(() => {
    if (preview === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPreview(null)
      if (e.key === 'ArrowLeft') setPreview((p) => (p !== null && p > 0 ? p - 1 : p))
      if (e.key === 'ArrowRight') setPreview((p) => (p !== null && p < items.length - 1 ? p + 1 : p))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, items.length])

  const iconButton = 'rounded-lg bg-black/50 p-1.5 text-[#fff] backdrop-blur hover:bg-black/70 disabled:opacity-40'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-white/50">
        <span className="truncate" title={list?.dir}>
          共 {items.length} 张 · {list?.dir ?? '…'}
        </span>
        <button
          onClick={() => run(() => window.api.openScreenshotsDir(versionId))}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          打开截图文件夹
        </button>
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      <section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        {!list && (
          <div className="flex justify-center py-10 text-white/50">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {list && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-white/40">
            <ImageIcon className="h-10 w-10 text-white/20" />
            还没有截图，在游戏中按 F2 截图
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          {items.map((shot, index) => (
            <div key={shot.fileName} className="group relative overflow-hidden rounded-xl bg-black/30">
              <button onClick={() => setPreview(index)} className="block w-full" title="点击查看大图">
                <img
                  src={imageUrl(versionId, shot, true)}
                  alt={shot.fileName}
                  loading="lazy"
                  className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-xs text-[#fff]/80">
                {formatTime(shot.time)}
              </div>
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => run(() => window.api.copyScreenshot(versionId, shot.fileName), '已复制到剪贴板')}
                  title="复制图片"
                  className={iconButton}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => run(() => window.api.showScreenshot(versionId, shot.fileName))}
                  title="在文件夹中显示"
                  className={iconButton}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(shot)} title="删除（移到回收站）" className={iconButton}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 大图预览：挂到 body 上，覆盖整个窗口（页面容器的动画会限制 fixed 定位的范围） */}
      {current &&
        preview !== null &&
        createPortal(
          <div className="pt-titlebar fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setPreview(null)}>
            <div className="flex items-center gap-3 px-5 py-3 text-sm text-[#fff]" onClick={(e) => e.stopPropagation()}>
              <span className="min-w-0 flex-1 truncate">
                {current.fileName}
                <span className="ml-3 text-xs text-[#fff]/50">
                  {formatTime(current.time)} · {formatSize(current.size)} · {preview + 1} / {items.length}
                </span>
              </span>
              <button
                onClick={() => run(() => window.api.copyScreenshot(versionId, current.fileName), '已复制到剪贴板')}
                className="flex items-center gap-1.5 rounded-lg bg-[#fff]/10 px-3 py-1.5 text-xs hover:bg-[#fff]/20"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
              <button
                onClick={() => run(() => window.api.showScreenshot(versionId, current.fileName))}
                className="flex items-center gap-1.5 rounded-lg bg-[#fff]/10 px-3 py-1.5 text-xs hover:bg-[#fff]/20"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                在文件夹中显示
              </button>
              <button
                onClick={() => remove(current)}
                className="flex items-center gap-1.5 rounded-lg bg-[#fff]/10 px-3 py-1.5 text-xs hover:bg-red-500/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
              <button
                onClick={() => setPreview(null)}
                title="关闭（Esc）"
                className="rounded-lg p-1.5 hover:bg-[#fff]/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
              <img
                src={imageUrl(versionId, current, false)}
                alt={current.fileName}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreview(preview - 1)
                }}
                disabled={preview === 0}
                title="上一张（←）"
                className="absolute left-4 rounded-full bg-[#fff]/10 p-2 text-[#fff] hover:bg-[#fff]/20 disabled:opacity-20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreview(preview + 1)
                }}
                disabled={preview === items.length - 1}
                title="下一张（→）"
                className="absolute right-4 rounded-full bg-[#fff]/10 p-2 text-[#fff] hover:bg-[#fff]/20 disabled:opacity-20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export default ScreenshotsPanel
