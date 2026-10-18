import { useEffect, useState } from 'react'
import { ChevronDown, Clock, EyeOff, Play } from 'lucide-react'
import VersionIcon from './VersionIcon'
import { formatDuration, formatRelative } from '../utils/format'
import type { GameStatus, InstalledVersion, PlayStats } from '../../../shared/types'

interface RecentPlaysProps {
  versions: InstalledVersion[]
  game: GameStatus
  onLaunch: (versionId: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  /** 关闭（不再显示，可以在设置中重新打开） */
  onHide: () => void
}

/** 主页「最近游玩」：最近玩过的版本（最多 4 个），显示累计时长，点击直接启动 */
function RecentPlays({
  versions,
  game,
  onLaunch,
  collapsed,
  onToggleCollapsed,
  onHide
}: RecentPlaysProps): JSX.Element | null {
  const [stats, setStats] = useState<PlayStats | null>(null)

  // 每次游戏结束后刷新统计
  useEffect(() => {
    if (game.state === 'launching' || game.state === 'running') return
    window.api
      .getPlayStats()
      .then(setStats)
      .catch(() => undefined)
  }, [game.state])

  if (!stats) return null
  const installed = new Set(versions.map((v) => v.id))
  const recent: string[] = []
  for (const session of stats.sessions) {
    if (installed.has(session.versionId) && !recent.includes(session.versionId)) recent.push(session.versionId)
    if (recent.length >= 4) break
  }
  if (recent.length === 0) return null
  const busy = game.state === 'launching' || game.state === 'running'
  const total = Object.entries(stats.versions)
    .filter(([id]) => installed.has(id))
    .reduce((sum, [, v]) => sum + v.totalMs, 0)

  return (
    <section>
      <div className={`flex items-center gap-2 px-1 text-sm text-white/70 ${collapsed ? '' : 'mb-2'}`}>
        <button
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? '展开' : '收起'}
          className="-ml-1 flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-white/10 hover:text-white"
        >
          <Clock className="h-4 w-4" />
          最近游玩
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        {collapsed && <span className="truncate text-xs text-white/40">{recent.join('、')}</span>}
        <span className="ml-auto shrink-0 text-xs text-white/40">累计游玩 {formatDuration(total)}</span>
        <button
          onClick={onHide}
          title="不再显示最近游玩（可以在「设置 → 个性化」中重新打开）"
          className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={`grid grid-cols-4 gap-3 ${collapsed ? 'hidden' : ''}`}>
        {recent.map((id) => {
          const v = stats.versions[id]
          const info = versions.find((x) => x.id === id)
          return (
            <button
              key={id}
              onClick={() => onLaunch(id)}
              disabled={busy}
              title={busy ? '游戏正在运行' : `启动 ${id}`}
              className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/10 p-4 text-left shadow-xl backdrop-blur-xl transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <VersionIcon icon={info?.icon} iconUrl={info?.iconUrl} className="h-8 w-8" />
                <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/80 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0">
                  <Play className="h-4 w-4 fill-current" />
                </span>
              </div>
              <div className="truncate font-semibold" title={id}>
                {id}
              </div>
              <div className="text-xs text-white/50">
                {formatRelative(v?.lastPlayed ?? 0)} · 已玩 {formatDuration(v?.totalMs ?? 0)}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default RecentPlays
