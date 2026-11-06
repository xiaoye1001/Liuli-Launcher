import { useEffect, useRef, useState } from 'react'
import { Loader2, LocateFixed, MapPinned } from 'lucide-react'
import type { Waypoint, WorldMap } from '../../../shared/types'
import { WAYPOINT_COLORS } from './WaypointsPanel'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SIZES = [128, 256, 512] as const

interface Point {
  x: number
  z: number
}

/** 存档地图预览：主世界的俯视图（北方在上），标出玩家位置、出生点和坐标笔记本里的地点；可以拖动、滚轮缩放 */
function WorldMapView({
  versionId,
  folder,
  player,
  spawn,
  waypoints = []
}: {
  versionId: string
  folder: string
  /** 玩家在主世界时的位置 */
  player?: Point
  spawn?: Point
  /** 坐标笔记本里主世界的地点 */
  waypoints?: Waypoint[]
}): JSX.Element {
  const centers: [string, string, Point][] = [
    ...(player ? [['player', '玩家位置', player] as [string, string, Point]] : []),
    ...(spawn ? [['spawn', '出生点', spawn] as [string, string, Point]] : []),
    ['origin', '坐标原点', { x: 0, z: 0 }],
    ...waypoints.slice(0, 8).map((w) => [`wp:${w.id}`, w.name, { x: w.x, z: w.z }] as [string, string, Point])
  ]
  const [centerKey, setCenterKey] = useState(centers[0][0])
  const [size, setSize] = useState<(typeof SIZES)[number]>(256)
  const [map, setMap] = useState<WorldMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 拖动后的中心（没有拖动时用选中的中心） */
  const [dragged, setDragged] = useState<Point | null>(null)
  /** 显示放大倍数（滚轮缩放） */
  const [zoom, setZoom] = useState(1)
  /** 拖动中的偏移（像素） */
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const center = dragged ?? (centers.find((c) => c[0] === centerKey) ?? centers[0])[2]

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    window.api
      .renderWorldMap(versionId, folder, center.x, center.z, size)
      .then((next) => alive && setMap(next))
      .catch((e) => alive && setError(cleanError(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // 中心点按坐标比较，避免每次渲染都重新读取
  }, [versionId, folder, center.x, center.z, size])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    canvas.width = map.size
    canvas.height = map.size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(map.pixels), map.size, map.size), 0, 0)
  }, [map])

  /** 标记在图上的位置（百分比），不在图里时为 null */
  const markerAt = (p: Point | undefined): { left: string; top: string } | null => {
    if (!p || !map) return null
    const x = (p.x - map.originX) / map.size
    const z = (p.z - map.originZ) / map.size
    if (x < 0 || z < 0 || x > 1 || z > 1) return null
    return { left: `${x * 100}%`, top: `${z * 100}%` }
  }
  const playerMarker = markerAt(player)
  const spawnMarker = markerAt(spawn)

  // 滚轮缩放：要阻止页面跟着滚动，只能用非 passive 的原生监听
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      setZoom((z) => Math.min(8, Math.max(1, e.deltaY < 0 ? z * 1.25 : z / 1.25)))
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  /** 鼠标位置对应的方块坐标（考虑缩放和拖动中的偏移） */
  const blockAt = (clientX: number, clientY: number): Point | null => {
    const box = boxRef.current
    if (!box || !map) return null
    const rect = box.getBoundingClientRect()
    const cx = (clientX - rect.left - rect.width / 2 - (offset?.x ?? 0)) / zoom + rect.width / 2
    const cy = (clientY - rect.top - rect.height / 2 - (offset?.y ?? 0)) / zoom + rect.height / 2
    return {
      x: Math.floor(map.originX + (cx / rect.width) * map.size),
      z: Math.floor(map.originZ + (cy / rect.height) * map.size)
    }
  }

  const endDrag = (clientX: number, clientY: number): void => {
    const start = dragStart.current
    dragStart.current = null
    const box = boxRef.current
    if (!start || !box || !map) return
    const dx = clientX - start.x
    const dy = clientY - start.y
    setOffset(null)
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    // 拖了多少像素 → 多少格：图的宽度对应 size 格，再除以放大倍数
    const perPixel = map.size / box.getBoundingClientRect().width / zoom
    setDragged({ x: Math.round(center.x - dx * perPixel), z: Math.round(center.z - dy * perPixel) })
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div
        ref={boxRef}
        data-testid="world-map"
        className="relative aspect-square w-full max-w-[22rem] cursor-grab touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-[#1b1f24] active:cursor-grabbing"
        onMouseDown={(e) => {
          dragStart.current = { x: e.clientX, y: e.clientY }
        }}
        onMouseMove={(e) => {
          if (dragStart.current) setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
          setHover(blockAt(e.clientX, e.clientY))
        }}
        onMouseUp={(e) => endDrag(e.clientX, e.clientY)}
        onMouseLeave={(e) => {
          if (dragStart.current) endDrag(e.clientX, e.clientY)
          setHover(null)
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px) scale(${zoom})`,
            transformOrigin: 'center'
          }}
        >
          <canvas
            ref={canvasRef}
            aria-label="存档地图"
            className="h-full w-full"
            style={{ imageRendering: 'pixelated' }}
          />
          {waypoints.map((w) => {
            const at = markerAt(w)
            return (
              at && (
                <span
                  key={w.id}
                  data-testid="map-waypoint"
                  title={`${w.name}（${w.x}, ${w.y}, ${w.z}）`}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-[#fff] shadow"
                  style={{
                    ...at,
                    background: WAYPOINT_COLORS[w.color] ?? '#10b981',
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`
                  }}
                />
              )
            )
          })}
          {spawnMarker && (
            <span
              title="出生点"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[#fff] bg-[#f59e0b] shadow"
              style={spawnMarker}
            />
          )}
          {playerMarker && (
            <span
              title="玩家位置"
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#fff] bg-[#ef4444] shadow"
              style={playerMarker}
            />
          )}
        </div>
        {hover && (
          <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-[#fff]">
            {hover.x}, {hover.z}
          </div>
        )}
        {zoom > 1 && (
          <div className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-[#fff]">
            {zoom.toFixed(1)}×
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-[#fff]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && map && map.chunks === 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-[#fff]/70">
            {map.unsupported ? '这个存档的格式不支持预览（1.13 以前的版本等）' : '这一带还没有生成地形'}
          </div>
        )}
      </div>

      <div className="min-w-[12rem] flex-1 space-y-3 text-xs text-white/60">
        <div>
          <div className="mb-1.5 text-white/70">中心</div>
          <div className="flex flex-wrap gap-1.5">
            {centers.map(([key, label, p]) => (
              <button
                key={key}
                onClick={() => {
                  setCenterKey(key)
                  setDragged(null)
                }}
                aria-pressed={!dragged && centerKey === key}
                title={`${p.x}, ${p.z}`}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  !dragged && centerKey === key ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-white/70">范围</div>
          <div className="flex gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={`rounded-lg px-2.5 py-1 font-mono transition-colors ${
                  size === s ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>
        {(dragged || zoom > 1) && (
          <button
            onClick={() => {
              setDragged(null)
              setZoom(1)
            }}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            回到中心（{center.x}, {center.z}）
          </button>
        )}
        <div className="flex items-start gap-1.5 leading-5">
          <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            主世界俯视图，北方在上，一个像素是一格。
            {player && '红点是玩家位置，'}
            {spawn && '黄色方块是出生点。'}
            {waypoints.length > 0 && '彩色小方块是坐标笔记本里的地点。'}
            拖动可以移动，滚轮放大缩小。
            {map && map.chunks > 0 && `画出了 ${map.chunks} 个区块。`}
          </span>
        </div>
        {error && <div className="text-red-300">{error}</div>}
      </div>
    </div>
  )
}

export default WorldMapView
