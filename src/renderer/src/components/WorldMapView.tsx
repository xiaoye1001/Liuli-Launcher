import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPinned } from 'lucide-react'
import type { WorldMap } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SIZES = [128, 256, 512] as const

interface Point {
  x: number
  z: number
}

/** 存档地图预览：主世界的俯视图（北方在上），标出玩家位置和出生点 */
function WorldMapView({
  versionId,
  folder,
  player,
  spawn
}: {
  versionId: string
  folder: string
  /** 玩家在主世界时的位置 */
  player?: Point
  spawn?: Point
}): JSX.Element {
  const centers: [string, string, Point][] = [
    ...(player ? [['player', '玩家位置', player] as [string, string, Point]] : []),
    ...(spawn ? [['spawn', '出生点', spawn] as [string, string, Point]] : []),
    ['origin', '坐标原点', { x: 0, z: 0 }]
  ]
  const [centerKey, setCenterKey] = useState(centers[0][0])
  const [size, setSize] = useState<(typeof SIZES)[number]>(256)
  const [map, setMap] = useState<WorldMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const center = (centers.find((c) => c[0] === centerKey) ?? centers[0])[2]

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

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative aspect-square w-full max-w-[22rem] overflow-hidden rounded-lg border border-white/10 bg-[#1b1f24]">
        <canvas
          ref={canvasRef}
          aria-label="存档地图"
          className="h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
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
                onClick={() => setCenterKey(key)}
                aria-pressed={centerKey === key}
                title={`${p.x}, ${p.z}`}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  centerKey === key ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 hover:bg-white/20'
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
        <div className="flex items-start gap-1.5 leading-5">
          <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            主世界俯视图，北方在上，一个像素是一格。
            {player && '红点是玩家位置，'}
            {spawn && '黄色方块是出生点。'}
            {map && map.chunks > 0 && `画出了 ${map.chunks} 个区块。`}
          </span>
        </div>
        {error && <div className="text-red-300">{error}</div>}
      </div>
    </div>
  )
}

export default WorldMapView
