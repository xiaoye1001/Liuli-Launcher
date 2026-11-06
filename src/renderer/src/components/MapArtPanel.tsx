import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, ImagePlus, Loader2, Palette } from 'lucide-react'
import type { InstalledVersion } from '../../../shared/types'
import { flatColor } from '../../../shared/mapColors'
import { countBlocks, paletteFor, quantize } from '../utils/mapArt'
import { stackText } from './SchematicsPanel'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SELECT =
  'rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/50'

/** 地图画生成器：图片 → 地图颜色 → 材料清单和投影文件 */
function MapArtPanel(): JSX.Element {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapsX, setMapsX] = useState(1)
  const [mapsY, setMapsY] = useState(1)
  const [target, setTarget] = useState<12 | 16 | 17>(17)
  const [dither, setDither] = useState(true)
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [versionId, setVersionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([window.api.getInstalledVersions(), window.api.getSettings()]).then(([list, s]) => {
      setVersions(list)
      setVersionId(list.some((v) => v.id === s.selectedVersion) ? s.selectedVersion : (list[0]?.id ?? ''))
    })
  }, [])

  const width = mapsX * 128
  const height = mapsY * 128
  const palette = useMemo(() => paletteFor(target), [target])

  /** 缩放到地图大小后算出每个像素用哪个方块 */
  const result = useMemo(() => {
    if (!image) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)
    const data = ctx.getImageData(0, 0, width, height).data
    const indices = quantize(data, width, height, palette, dither)
    return { indices, counts: countBlocks(indices, palette) }
  }, [image, width, height, palette, dither])

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !result) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(width, height)
    result.indices.forEach((k, i) => {
      if (k < 0) return
      const [r, g, b] = flatColor(palette[k].rgb)
      img.data.set([r, g, b, 255], i * 4)
    })
    ctx.putImageData(img, 0, 0)
  }, [result, width, height, palette])

  const pick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) {
      setError('请选择 PNG、JPG、WebP 图片')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('图片太大（超过 20 MB）')
      return
    }
    setError('')
    setNotice('')
    // 用 data URL 读图片（界面的安全策略不允许 blob: 图片）
    const reader = new FileReader()
    reader.onerror = () => setError('无法读取这张图片')
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        setImage(img)
        setFileName(file.name.replace(/\.[^.]+$/, ''))
      }
      img.onerror = () => setError('无法读取这张图片')
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const total = result ? result.counts.reduce((n, c) => n + c.count, 0) : 0

  const exportSchematic = async (): Promise<void> => {
    if (!result || !versionId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      // 只把用到的方块放进调色板
      const used = result.counts.map((c) => c.block)
      const remap = new Map(used.map((b, i) => [palette.indexOf(b), i]))
      // 透明像素用用得最多的方块填上
      const pixels = Array.from(result.indices, (k) => (k < 0 ? 0 : (remap.get(k) ?? 0)))
      const r = await window.api.exportMapArt(versionId, {
        name: `地图画-${fileName || '图片'}`,
        width,
        height,
        palette: used.map((b) => b.block),
        pixels,
        target: target === 17 ? 20 : target
      })
      setNotice(
        `已保存投影：${r.path.split(/[\\/]/).pop()}（${r.blocks} 个方块）。进游戏后用 Litematica 加载，或者在版本的「资源 → 投影」里查看`
      )
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const copyList = (): void => {
    if (!result) return
    const text = [
      `地图画 ${mapsX}×${mapsY}（${width}×${height}）材料清单`,
      ...result.counts.map(
        (c) => `${c.block.name}\t${c.count}${stackText(c.count) ? `（${stackText(c.count)}）` : ''}`
      ),
      `另外最北边一排圆石 ${width} 个（让最上面一排颜色正常）`
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <Palette className="h-4 w-4 text-violet-300" />
          地图画生成器
        </div>
        <p className="text-xs text-white/50">
          {
            '选一张图片，换成地图上能显示的颜色，得到需要的方块清单和 Litematica 投影。平铺的地图画（所有方块一样高），一张地图 128×128 格'
          }
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 font-medium text-white"
          >
            <ImagePlus className="h-4 w-4" />
            选择图片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="选择地图画图片"
            onChange={pick}
          />
          <span className="text-white/60">大小</span>
          <select
            value={mapsX}
            onChange={(e) => setMapsX(Number(e.target.value))}
            aria-label="横向几张地图"
            className={SELECT}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                宽 {n} 张
              </option>
            ))}
          </select>
          <select
            value={mapsY}
            onChange={(e) => setMapsY(Number(e.target.value))}
            aria-label="纵向几张地图"
            className={SELECT}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                高 {n} 张
              </option>
            ))}
          </select>
          <select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value) as 12 | 16 | 17)}
            aria-label="游戏版本"
            className={SELECT}
          >
            <option value={12}>1.12～1.15 的方块</option>
            <option value={16}>1.16 的方块</option>
            <option value={17}>1.17 及以上的方块</option>
          </select>
          <label className="flex items-center gap-1.5 text-white/70">
            <input
              type="checkbox"
              checked={dither}
              onChange={(e) => setDither(e.target.checked)}
              className="accent-emerald-500"
            />
            抖动（渐变更自然）
          </label>
        </div>
        {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
      </section>

      {image && result && (
        <section
          className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl"
          data-testid="map-art-result"
        >
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <div className="text-xs text-white/50">原图</div>
              <img src={image.src} alt="原图" className="h-56 w-56 rounded-lg bg-black/20 object-contain" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-white/50">
                地图上的样子（{width}×{height}）
              </div>
              <canvas
                ref={previewRef}
                data-testid="map-art-preview"
                className="h-56 w-56 rounded-lg bg-black/20 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="min-w-[14rem] flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {`${result.counts.length} 种方块，共 ${total.toLocaleString()} 个（另加最北边一排圆石 ${width} 个）`}
                </span>
                <button
                  onClick={copyList}
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  {copied ? '已复制' : '复制清单'}
                </button>
              </div>
              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                {result.counts.map((c) => {
                  const [r, g, b] = flatColor(c.block.rgb)
                  return (
                    <div key={c.block.block} data-testid="map-art-block" className="flex items-center gap-2 text-xs">
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: `rgb(${r},${g},${b})` }} />
                      <span className="min-w-0 flex-1 truncate">{c.block.name}</span>
                      <span className="tabular-nums">{c.count}</span>
                      <span className="w-24 text-right text-white/40">{stackText(c.count)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                <select
                  value={versionId}
                  onChange={(e) => setVersionId(e.target.value)}
                  aria-label="保存到哪个版本"
                  className={SELECT}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void exportSchematic()}
                  disabled={busy || !versionId}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  保存成投影
                </button>
              </div>
              {notice && <div className="text-xs text-emerald-300">{notice}</div>}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default MapArtPanel
