import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Trash2,
  Wallpaper,
  X
} from 'lucide-react'
import type { Screenshot, ScreenshotAlbum, ScreenshotList } from '../../../shared/types'
import { EmptyState, LoadingState } from './EmptyState'
import ScreenshotCollageDialog from './ScreenshotCollageDialog'
import { albumDate, albumPlaces } from '../utils/screenshotAlbum'
import { screenshotTakenAt } from '../../../shared/screenshotTime'

/** 记住「按游玩整理」开关（只是界面偏好） */
const GROUPED_KEY = 'liuli.screenshots.grouped'

function readGrouped(): boolean {
  try {
    return localStorage.getItem(GROUPED_KEY) === '1'
  } catch {
    return false
  }
}

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
  /** 按每次游玩分组显示 */
  const [grouped, setGrouped] = useState(readGrouped)
  const [albums, setAlbums] = useState<ScreenshotAlbum[] | null>(null)
  const [collage, setCollage] = useState<ScreenshotAlbum | null>(null)

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

  // 分组：截图列表变化（删除、刷新）后重新分组
  useEffect(() => {
    if (!grouped || !list) return
    let alive = true
    window.api
      .listScreenshotAlbums(versionId)
      .then((a) => alive && setAlbums(a))
      .catch(() => alive && setAlbums([]))
    return () => {
      alive = false
    }
  }, [grouped, list, versionId])

  const toggleGrouped = (): void => {
    const next = !grouped
    setGrouped(next)
    try {
      localStorage.setItem(GROUPED_KEY, next ? '1' : '0')
    } catch {
      // 存不了也没关系
    }
  }
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

  /** 正在设为背景：连点两下只处理一次 */
  const settingWallpaper = useRef(false)
  const setAsWallpaper = async (shot: Screenshot): Promise<void> => {
    if (settingWallpaper.current) return
    settingWallpaper.current = true
    try {
      await run(() => window.api.backgroundFromScreenshot(versionId, shot.fileName), '已设为启动器背景')
    } finally {
      settingWallpaper.current = false
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

  const indexOf = new Map(items.map((shot, index) => [shot.fileName, index]))

  const tile = (shot: Screenshot, index: number): JSX.Element => (
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
        {formatTime(screenshotTakenAt(shot.fileName, shot.time))}
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
        <button onClick={() => setAsWallpaper(shot)} title="设为启动器背景" className={iconButton}>
          <Wallpaper className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => remove(shot)} title="删除（移到回收站）" className={iconButton}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-white/50">
        <span className="truncate" title={list?.dir}>
          共 {items.length} 张 · {list?.dir ?? '…'}
        </span>
        <button
          onClick={toggleGrouped}
          aria-pressed={grouped}
          className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-white ${grouped ? 'bg-emerald-500/30 hover:bg-emerald-500/40' : 'bg-white/10 hover:bg-white/20'}`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          按游玩整理
        </button>
        <button
          onClick={() => run(() => window.api.openScreenshotsDir(versionId))}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
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
        {!list && <LoadingState />}
        {list && items.length === 0 && <EmptyState icon={ImageIcon}>还没有截图，在游戏中按 F2 截图</EmptyState>}
        {!grouped && <div className="grid grid-cols-3 gap-3">{items.map((shot, index) => tile(shot, index))}</div>}
        {grouped && list && items.length > 0 && !albums && <LoadingState />}
        {grouped &&
          albums?.map((album) => {
            // 和大图预览左右切换的顺序一致（新的在前）
            const shots = album.shots
              .map((s) => indexOf.get(s.fileName) ?? -1)
              .filter((index) => index >= 0)
              .sort((x, y) => x - y)
            if (shots.length === 0) return null
            const places = albumPlaces(album)
            return (
              <div key={`${album.start}-${album.shots[0]?.fileName}`} className="mb-5" data-testid="screenshot-album">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 shrink-0 text-white/50" />
                  <span className="font-medium">{albumDate(album)}</span>
                  {places && <span className="truncate text-emerald-300">{places}</span>}
                  <span className="shrink-0 text-xs text-white/40">
                    {`${shots.length} 张`}
                    {album.versionId !== versionId && ` · ${album.versionId}`}
                  </span>
                  <button
                    onClick={() => setCollage(album)}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    拼成一张图
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">{shots.map((index) => tile(items[index], index))}</div>
              </div>
            )
          })}
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
                  {formatTime(screenshotTakenAt(current.fileName, current.time))} · {formatSize(current.size)} ·{' '}
                  {preview + 1} / {items.length}
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
                onClick={() => setAsWallpaper(current)}
                className="flex items-center gap-1.5 rounded-lg bg-[#fff]/10 px-3 py-1.5 text-xs hover:bg-[#fff]/20"
              >
                <Wallpaper className="h-3.5 w-3.5" />
                设为启动器背景
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
      {collage && <ScreenshotCollageDialog versionId={versionId} album={collage} onClose={() => setCollage(null)} />}
    </div>
  )
}

export default ScreenshotsPanel
