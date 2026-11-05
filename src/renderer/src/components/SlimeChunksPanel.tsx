import { useEffect, useMemo, useRef, useState } from 'react'
import { Grid2x2Check } from 'lucide-react'
import { isSlimeChunk } from '../utils/slime'
import { effectiveSeed } from '../utils/seed'
import type { SeedFavorite } from '../../../shared/types'

/** 地图向四周各显示多少个区块 */
const RADIUS = 20
const SIZE = RADIUS * 2 + 1
const CELL = 12

/** 地图固定用深色底（浅色主题下也一样），颜色只在画布里用 */
const COLORS = {
  background: '#111827',
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.28)',
  slime: '#4ade80',
  center: '#ffffff',
  hover: 'rgba(255,255,255,0.55)'
}

const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-white/30 focus:border-emerald-400/50'

function toNumber(text: string): number {
  const n = Number(text)
  return Number.isFinite(n) ? Math.max(-30_000_000, Math.min(30_000_000, Math.floor(n))) : 0
}

/** 百宝箱：史莱姆区块查看（Java 版） */
function SlimeChunksPanel(): JSX.Element {
  const [seedText, setSeedText] = useState('')
  const [x, setX] = useState('0')
  const [z, setZ] = useState('0')
  const [favorites, setFavorites] = useState<SeedFavorite[]>([])
  const [hover, setHover] = useState<{ cx: number; cz: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    window.api
      .listSeedFavorites()
      .then(setFavorites)
      .catch(() => setFavorites([]))
  }, [])

  const seed = useMemo(() => {
    const value = effectiveSeed(seedText)
    return value === null ? null : BigInt(value)
  }, [seedText])
  const centerX = Math.floor(toNumber(x) / 16)
  const centerZ = Math.floor(toNumber(z) / 16)

  /** 地图上每个区块是不是史莱姆区块（按行，北边在上） */
  const grid = useMemo(() => {
    if (seed === null) return null
    const rows: boolean[][] = []
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      const row: boolean[] = []
      for (let dx = -RADIUS; dx <= RADIUS; dx++) row.push(isSlimeChunk(seed, centerX + dx, centerZ + dz))
      rows.push(row)
    }
    return rows
  }, [seed, centerX, centerZ])

  /** 离中心最近的史莱姆区块（按区块中心的距离） */
  const nearest = useMemo(() => {
    if (!grid) return null
    let best: { cx: number; cz: number; d: number } | null = null
    grid.forEach((row, iz) =>
      row.forEach((slime, ix) => {
        if (!slime) return
        const dx = ix - RADIUS
        const dz = iz - RADIUS
        const d = Math.hypot(dx, dz)
        if (!best || d < best.d) best = { cx: centerX + dx, cz: centerZ + dz, d }
      })
    )
    return best as { cx: number; cz: number; d: number } | null
  }, [grid, centerX, centerZ])

  const count = grid ? grid.reduce((n, row) => n + row.filter(Boolean).length, 0) : 0

  // 画地图
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = SIZE * CELL * ratio
    canvas.height = SIZE * CELL * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, SIZE * CELL, SIZE * CELL)
    ctx.fillStyle = COLORS.grid
    for (let i = 0; i <= SIZE; i++) {
      ctx.fillRect(i * CELL, 0, 1, SIZE * CELL)
      ctx.fillRect(0, i * CELL, SIZE * CELL, 1)
    }
    // 区块坐标 0 的线（世界中心）
    ctx.fillStyle = COLORS.axis
    const axisX = -centerX + RADIUS
    const axisZ = -centerZ + RADIUS
    if (axisX >= 0 && axisX <= SIZE) ctx.fillRect(axisX * CELL, 0, 1, SIZE * CELL)
    if (axisZ >= 0 && axisZ <= SIZE) ctx.fillRect(0, axisZ * CELL, SIZE * CELL, 1)
    ctx.fillStyle = COLORS.slime
    grid.forEach((row, iz) =>
      row.forEach((slime, ix) => {
        if (slime) ctx.fillRect(ix * CELL + 2, iz * CELL + 2, CELL - 3, CELL - 3)
      })
    )
    ctx.lineWidth = 2
    ctx.strokeStyle = COLORS.center
    ctx.strokeRect(RADIUS * CELL + 1, RADIUS * CELL + 1, CELL - 1, CELL - 1)
    if (hover) {
      ctx.strokeStyle = COLORS.hover
      ctx.lineWidth = 1
      ctx.strokeRect((hover.cx - centerX + RADIUS) * CELL + 0.5, (hover.cz - centerZ + RADIUS) * CELL + 0.5, CELL, CELL)
    }
  }, [grid, centerX, centerZ, hover])

  const chunkAt = (e: React.MouseEvent<HTMLCanvasElement>): { cx: number; cz: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ix = Math.min(SIZE - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * SIZE)))
    const iz = Math.min(SIZE - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * SIZE)))
    return { cx: centerX + ix - RADIUS, cz: centerZ + iz - RADIUS }
  }

  const describe = (c: { cx: number; cz: number }): string =>
    `区块 ${c.cx}, ${c.cz} · 方块 X ${c.cx * 16} ~ ${c.cx * 16 + 15}，Z ${c.cz * 16} ~ ${c.cz * 16 + 15}`

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Grid2x2Check className="h-5 w-5 text-emerald-300" />
        <h2 className="font-semibold">史莱姆区块查看</h2>
        <span className="text-xs text-white/50">Java 版 · 和游戏的算法一样</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1.6fr_0.7fr_0.7fr]">
        <label className="block min-w-0">
          <span className="text-xs text-white/50">世界种子</span>
          <div className="mt-1 flex gap-2">
            <input
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
              placeholder="在存档详情里可以复制种子"
              aria-label="世界种子"
              spellCheck={false}
              className={INPUT}
            />
            {favorites.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const f = favorites.find((s) => s.id === e.target.value)
                  if (f) setSeedText(f.seed)
                }}
                aria-label="从种子收藏夹选择"
                className="w-28 shrink-0 cursor-pointer truncate rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm outline-none"
              >
                <option value="" className="bg-slate-800 text-white">
                  收藏夹…
                </option>
                {favorites.map((f) => (
                  <option key={f.id} value={f.id} className="bg-slate-800 text-white">
                    {f.name || f.seed}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-white/50">中心 X</span>
          <input value={x} onChange={(e) => setX(e.target.value)} aria-label="中心 X" className={`mt-1 ${INPUT}`} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-white/50">中心 Z</span>
          <input value={z} onChange={(e) => setZ(e.target.value)} aria-label="中心 Z" className={`mt-1 ${INPUT}`} />
        </label>
      </div>

      {seed === null ? (
        <p className="py-6 text-center text-xs text-white/50">
          输入世界种子，查看坐标附近哪些区块是史莱姆区块（可以从种子收藏夹选择）
        </p>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="shrink-0">
            <div className="mb-1 text-center text-[11px] text-white/40">北（-Z）</div>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`史莱姆区块地图：以区块 ${centerX}, ${centerZ} 为中心，${SIZE}×${SIZE} 个区块里有 ${count} 个史莱姆区块`}
              onMouseMove={(e) => setHover(chunkAt(e))}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                const c = chunkAt(e)
                setX(String(c.cx * 16 + 8))
                setZ(String(c.cz * 16 + 8))
              }}
              className="block cursor-crosshair rounded-lg"
              style={{ width: SIZE * CELL, height: SIZE * CELL, maxWidth: '100%' }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-white/40">
              <span>西（-X）</span>
              <span>南（+Z）</span>
              <span>东（+X）</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLORS.slime }} />
                史莱姆区块
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border-2 border-white/80" />
                中心坐标所在的区块
              </span>
            </div>
            <div className="rounded-lg bg-black/20 px-3 py-2" data-testid="slime-readout">
              {hover ? (
                <>
                  <div className="text-xs text-white/50">鼠标所在</div>
                  <div className="mt-0.5">{describe(hover)}</div>
                  <div className={isSlimeChunk(seed, hover.cx, hover.cz) ? 'text-emerald-300' : 'text-white/50'}>
                    {isSlimeChunk(seed, hover.cx, hover.cz) ? '是史莱姆区块' : '不是史莱姆区块'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-white/50">中心</div>
                  <div className="mt-0.5">{describe({ cx: centerX, cz: centerZ })}</div>
                  <div className={grid?.[RADIUS][RADIUS] ? 'text-emerald-300' : 'text-white/50'}>
                    {grid?.[RADIUS][RADIUS] ? '是史莱姆区块' : '不是史莱姆区块'}
                  </div>
                </>
              )}
            </div>
            {nearest && (
              <div className="rounded-lg bg-black/20 px-3 py-2" data-testid="slime-nearest">
                <div className="text-xs text-white/50">离中心最近的史莱姆区块</div>
                <div className="mt-0.5">{describe(nearest)}</div>
                <div className="text-xs text-white/50">
                  大约 {Math.round(nearest.d * 16)} 格远
                  {nearest.d === 0 ? '（就是这个区块）' : ''}
                </div>
              </div>
            )}
            <p className="text-xs text-white/50">
              这片 {SIZE}×{SIZE} 个区块里有 {count} 个史莱姆区块。点地图上的区块可以把它设为中心
            </p>
            <p className="text-xs leading-5 text-white/40">
              史莱姆只会在史莱姆区块的 Y 40 以下生成（沼泽在夜晚也会生成，不看区块）。基岩版的算法不同，这里只适用于
              Java 版
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

export default SlimeChunksPanel
