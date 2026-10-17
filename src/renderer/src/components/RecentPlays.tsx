import { useEffect, useState } from 'react'
import { Clock, Play } from 'lucide-react'
import GrassBlockIcon from './GrassBlockIcon'
import { formatDuration, formatRelative } from '../utils/format'
import type { GameStatus, InstalledVersion, PlayStats } from '../../../shared/types'

interface RecentPlaysProps {
  versions: InstalledVersion[]
  game: GameStatus
  onLaunch: (versionId: string) => void
}

/** 主页「最近游玩」：最近玩过的版本（最多 4 个），显示累计时长，点击直接启动 */
function RecentPlays({ versions, game, onLaunch }: RecentPlaysProps): JSX.Element | null {
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
      <div className="mb-2 flex items-center gap-2 px-1 text-sm text-white/70">
        <Clock className="h-4 w-4" />
        最近游玩
        <span className="ml-auto text-xs text-white/40">累计游玩 {formatDuration(total)}</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {recent.map((id) => {
          const v = stats.versions[id]
          return (
            <button
              key={id}
              onClick={() => onLaunch(id)}
              disabled={busy}
              title={busy ? '游戏正在运行' : `启动 ${id}`}
              className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/10 p-4 text-left shadow-xl backdrop-blur-xl transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <GrassBlockIcon className="h-8 w-8 shrink-0" />
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
