import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, Download, LayoutGrid, Loader2, X } from 'lucide-react'
import type { ScreenshotAlbum } from '../../../shared/types'
import { albumDate, albumPlaces, collageLayout, pickShots } from '../utils/screenshotAlbum'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const PAD = 32
const GAP = 12
const HEADER = 104
const FOOTER = 44

/** 把一次游玩的截图拼成一张长图：标题写日期和存档，可以保存或复制 */
function ScreenshotCollageDialog({
  versionId,
  album,
  onClose
}: {
  versionId: string
  album: ScreenshotAlbum
  onClose: () => void
}): JSX.Element {
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const picked = pickShots(album.shots)
  const places = albumPlaces(album)
  const title = places || albumDate(album)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let alive = true
    const { cols, rows, cellW, cellH } = collageLayout(picked.length)
    void (async () => {
      try {
        const urls = await window.api.getScreenshotImages(
          versionId,
          picked.map((s) => s.fileName),
          cellW
        )
        const images = await Promise.all(urls.map(loadImage))
        if (!alive) return
        const canvas = document.createElement('canvas')
        canvas.width = PAD * 2 + cols * cellW + (cols - 1) * GAP
        canvas.height = HEADER + rows * cellH + (rows - 1) * GAP + FOOTER + PAD
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法生成图片')
        const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
        bg.addColorStop(0, '#0f172a')
        bg.addColorStop(1, '#1e293b')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 34px "Microsoft YaHei", "PingFang SC", sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(title, PAD, PAD, canvas.width - PAD * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif'
        const sub = [places ? albumDate(album) : '', album.versionId, `${album.shots.length} 张截图`]
          .filter(Boolean)
          .join(' · ')
        ctx.fillText(sub, PAD, PAD + 46, canvas.width - PAD * 2)
        images.forEach((img, i) => {
          const x = PAD + (i % cols) * (cellW + GAP)
          const y = HEADER + Math.floor(i / cols) * (cellH + GAP)
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x, y, cellW, cellH, 10)
          ctx.clip()
          ctx.fillStyle = '#000'
          ctx.fillRect(x, y, cellW, cellH)
          if (img) {
            // 按格子比例裁切，铺满格子
            const scale = Math.max(cellW / img.width, cellH / img.height)
            const w = img.width * scale
            const h = img.height * scale
            ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h)
          }
          ctx.restore()
        })
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '15px "Microsoft YaHei", "PingFang SC", sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText('琉璃启动器', canvas.width - PAD, canvas.height - PAD - 18)
        setImage(canvas.toDataURL('image/png'))
      } catch (e) {
        if (alive) setError(cleanError(e))
      }
    })()
    return () => {
      alive = false
    }
    // 打开对话框时生成一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label="拼成一张图"
        className="flex max-h-[90vh] w-[40rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <LayoutGrid className="h-4 w-4 text-emerald-300" />
          <span className="flex-1">拼成一张图</span>
          <button
            onClick={onClose}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {album.shots.length > picked.length && (
          <div className="mt-2 text-xs text-white/50">{`这次有 ${album.shots.length} 张，均匀挑了 ${picked.length} 张`}</div>
        )}
        <div className="mt-4 flex min-h-0 flex-1 justify-center overflow-y-auto">
          {image ? (
            <img src={image} alt="拼图" data-testid="collage-image" className="h-auto w-full rounded-xl shadow-xl" />
          ) : (
            !error && (
              <div className="flex items-center py-16 text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )
          )}
        </div>
        {message && (
          <div className="mt-3 flex items-start gap-1.5 break-all text-xs text-emerald-300" role="status">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {message}
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() =>
              image &&
              void run('copy', async () => {
                await window.api.copyReportImage(image)
                return '已复制，可以直接粘贴到聊天里'
              })
            }
            disabled={!image || !!busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            复制图片
          </button>
          <button
            onClick={() =>
              image &&
              void run('save', async () => {
                const path = await window.api.saveReportImage(image, `${title} 截图`)
                return path ? `已保存到 ${path}` : ''
              })
            }
            disabled={!image || !!busy}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            保存图片
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ScreenshotCollageDialog
