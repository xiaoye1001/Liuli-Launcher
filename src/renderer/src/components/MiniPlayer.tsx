import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { nextTrack, prevTrack, togglePlay, trackTitle, useMusic } from '../utils/music'

/** 正在播放时跳动的音量条 */
function Equalizer({ active }: { active: boolean }): JSX.Element {
  return (
    <span className="flex h-4 w-4 items-end justify-center gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm bg-emerald-300 ${active ? 'music-bar' : ''}`}
          style={{ height: active ? undefined : '30%', animationDelay: `${i * -0.35}s` }}
        />
      ))}
    </span>
  )
}

/** 侧边栏底部的背景音乐控制 */
function MiniPlayer(): JSX.Element | null {
  const music = useMusic()
  if (!music.enabled || music.tracks.length === 0) return null
  const status = music.error
    ? music.error
    : music.gamePaused
      ? '游戏运行中，已暂停'
      : music.userPaused
        ? '已暂停'
        : '正在播放'
  const paused = music.userPaused || music.gamePaused || !music.playing
  const button = 'rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white'
  return (
    <div
      className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3 [@media(max-height:680px)]:mb-0"
      aria-label="背景音乐"
    >
      <div className="flex items-center gap-2">
        {music.playing ? <Equalizer active /> : <Music className="h-4 w-4 shrink-0 text-emerald-300" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={trackTitle(music.current)}>
            {music.current ? trackTitle(music.current) : '背景音乐'}
          </div>
          <div className={`truncate text-[11px] ${music.error ? 'text-red-300' : 'text-white/40'}`} title={status}>
            {status}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button onClick={prevTrack} className={button} title="上一首" aria-label="上一首">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          title={paused ? '播放' : '暂停'}
          aria-label={paused ? '播放' : '暂停'}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button onClick={nextTrack} className={button} title="下一首" aria-label="下一首">
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default MiniPlayer
