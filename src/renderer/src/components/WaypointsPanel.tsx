import { useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Waypoint, WaypointDimension } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export const DIMENSIONS: { key: WaypointDimension; label: string; className: string }[] = [
  { key: 'overworld', label: '主世界', className: 'bg-emerald-500/20 text-emerald-200' },
  { key: 'the_nether', label: '下界', className: 'bg-rose-500/20 text-rose-200' },
  { key: 'the_end', label: '末地', className: 'bg-violet-500/20 text-violet-200' }
]

export const WAYPOINT_COLORS: Record<string, string> = {
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#64748b'
}

/** 传送命令：主世界直接 /tp，其他维度用 /execute in（1.13 起） */
export function teleportCommand(w: Pick<Waypoint, 'x' | 'y' | 'z' | 'dimension'>): string {
  return w.dimension === 'overworld'
    ? `/tp @s ${w.x} ${w.y} ${w.z}`
    : `/execute in minecraft:${w.dimension} run tp @s ${w.x} ${w.y} ${w.z}`
}

const INPUT =
  'min-w-0 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm outline-none focus:border-emerald-400/50'

interface Draft {
  id?: string
  name: string
  x: string
  y: string
  z: string
  dimension: WaypointDimension
  note: string
  color: string
}

const EMPTY: Draft = { name: '', x: '', y: '64', z: '', dimension: 'overworld', note: '', color: 'emerald' }

/** 坐标笔记本：给存档记下重要地点 */
function WaypointsPanel({
  versionId,
  folder,
  player,
  onChange
}: {
  versionId: string
  folder: string
  /** 玩家现在的位置（「填入我现在的位置」用） */
  player?: { x: number; y: number; z: number; dimension: string }
  /** 地点有变化（地图上的标记跟着更新） */
  onChange?: (list: Waypoint[]) => void
}): JSX.Element {
  const [list, setList] = useState<Waypoint[]>([])
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)

  const update = (next: Waypoint[]): void => {
    setList(next)
    onChange?.(next)
  }

  useEffect(() => {
    window.api
      .listWaypoints(versionId, folder)
      .then(update)
      .catch(() => update([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, folder])

  const save = async (): Promise<void> => {
    if (!draft) return
    setError('')
    try {
      update(await window.api.saveWaypoint(versionId, folder, { ...draft }))
      setDraft(null)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const copy = (w: Waypoint): void => {
    void navigator.clipboard.writeText(teleportCommand(w)).then(() => {
      setCopied(w.id)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  const fromPlayer = (): void => {
    if (!player || !draft) return
    const dim = player.dimension.replace(/^minecraft:/, '')
    setDraft({
      ...draft,
      x: String(player.x),
      y: String(player.y),
      z: String(player.z),
      dimension: (DIMENSIONS.some((d) => d.key === dim) ? dim : 'overworld') as WaypointDimension
    })
  }

  return (
    <div data-testid="waypoints">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
          坐标笔记本
          <span className="text-white/40">{list.length > 0 ? `${list.length} 个地点` : ''}</span>
        </button>
        {open && !draft && (
          <button
            onClick={() => setDraft({ ...EMPTY })}
            className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
          >
            <Plus className="h-3 w-3" />
            记一个地点
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5">
          {draft && (
            <div className="space-y-2 rounded-lg bg-black/20 p-2.5" data-testid="waypoint-form">
              <div className="flex flex-wrap gap-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="名字，例如 家、刷铁机"
                  maxLength={40}
                  aria-label="地点名字"
                  className={`${INPUT} w-44`}
                />
                {(['x', 'y', 'z'] as const).map((k) => (
                  <input
                    key={k}
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    placeholder={k.toUpperCase()}
                    inputMode="numeric"
                    aria-label={`${k.toUpperCase()} 坐标`}
                    className={`${INPUT} w-20 font-mono`}
                  />
                ))}
                <select
                  value={draft.dimension}
                  onChange={(e) => setDraft({ ...draft, dimension: e.target.value as WaypointDimension })}
                  aria-label="维度"
                  className={INPUT}
                >
                  {DIMENSIONS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="备注（可以不填）"
                  maxLength={200}
                  aria-label="备注"
                  className={`${INPUT} min-w-[12rem] flex-1`}
                />
                <div className="flex gap-1" role="radiogroup" aria-label="颜色">
                  {Object.entries(WAYPOINT_COLORS).map(([key, hex]) => (
                    <button
                      key={key}
                      role="radio"
                      aria-checked={draft.color === key}
                      aria-label={key}
                      onClick={() => setDraft({ ...draft, color: key })}
                      className={`h-5 w-5 rounded-full border-2 ${draft.color === key ? 'border-white' : 'border-transparent'}`}
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {player && (
                  <button onClick={fromPlayer} className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                    填入我上次退出时的位置
                  </button>
                )}
                <span className="flex-1" />
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-lg px-2 py-1 text-xs text-white/60 hover:text-white"
                >
                  取消
                </button>
                <button
                  onClick={() => void save()}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  <Check className="h-3.5 w-3.5" />
                  保存
                </button>
              </div>
              {error && <div className="text-xs text-red-300">{error}</div>}
            </div>
          )}
          {list.length === 0 && !draft && (
            <div className="text-xs text-white/40">
              还没有记地点。家、刷怪塔、要塞、传送门的坐标记在这里，随时复制传送命令
            </div>
          )}
          {list.map((w) => {
            const dim = DIMENSIONS.find((d) => d.key === w.dimension) ?? DIMENSIONS[0]
            // 主世界和下界坐标换算（÷8 / ×8）
            const other =
              w.dimension === 'overworld'
                ? `下界 ${Math.floor(w.x / 8)}, ${Math.floor(w.z / 8)}`
                : w.dimension === 'the_nether'
                  ? `主世界 ${w.x * 8}, ${w.z * 8}`
                  : ''
            return (
              <div
                key={w.id}
                data-testid="waypoint"
                className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5 text-sm"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: WAYPOINT_COLORS[w.color] }} />
                <span className="min-w-0 truncate font-medium">{w.name}</span>
                <span className={`shrink-0 rounded px-1.5 text-[11px] ${dim.className}`}>{dim.label}</span>
                <span className="shrink-0 font-mono text-xs text-white/70">
                  {w.x} {w.y} {w.z}
                </span>
                {other && <span className="hidden shrink-0 text-[11px] text-white/40 lg:inline">（{other}）</span>}
                <span className="min-w-0 flex-1 truncate text-xs text-white/40" title={w.note}>
                  {w.note}
                </span>
                <button
                  onClick={() => copy(w)}
                  title={`复制传送命令：${teleportCommand(w)}`}
                  aria-label={`复制 ${w.name} 的传送命令`}
                  className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  {copied === w.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setDraft({ ...w, x: String(w.x), y: String(w.y), z: String(w.z) })}
                  title="修改"
                  aria-label={`修改 ${w.name}`}
                  className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {confirm === w.id ? (
                  <button
                    onClick={() => {
                      setConfirm(null)
                      void window.api.deleteWaypoint(versionId, folder, w.id).then(update)
                    }}
                    onBlur={() => setConfirm(null)}
                    className="shrink-0 rounded bg-red-500/30 px-1.5 text-xs text-red-100"
                  >
                    确认删除
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirm(w.id)}
                    title="删除"
                    aria-label={`删除 ${w.name}`}
                    className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-red-300"
                  >
                    {confirm === w.id ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default WaypointsPanel
