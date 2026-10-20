import { useEffect, useState } from 'react'
import { FolderOpen, Gamepad2, Music, Music2, Plus, Trash2, Volume1, Volume2, VolumeX } from 'lucide-react'
import { playTrack, refreshMusic, trackTitle, useMusic } from '../utils/music'
import type { AppSettings, MusicOrder } from '../../../shared/types'

const ORDERS: { key: MusicOrder; label: string }[] = [
  { key: 'sequential', label: '列表循环' },
  { key: 'shuffle', label: '随机播放' },
  { key: 'single', label: '单曲循环' }
]

function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/20'}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
      />
    </button>
  )
}

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
  updateSlider: (patch: Partial<AppSettings>) => void
}

/** 设置 → 个性化 → 背景音乐 */
function MusicSettings({ settings, update, updateSlider }: Props): JSX.Element {
  const music = useMusic()
  const [error, setError] = useState('')
  const enabled = settings.musicEnabled === true

  useEffect(() => {
    void refreshMusic()
  }, [])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError('')
    try {
      await action()
      await refreshMusic()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const volume = settings.musicVolume ?? 40
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  return (
    <div className="mt-6 rounded-xl bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Music className="h-4 w-4 text-emerald-300" />
          <div>
            <div className="text-sm font-medium">背景音乐</div>
            <div className="text-xs text-white/50">打开启动器时播放，支持 MP3、OGG、FLAC、WAV、M4A 等格式</div>
          </div>
        </div>
        <Switch checked={enabled} onChange={() => update({ musicEnabled: !enabled })} label="背景音乐" />
      </div>

      {enabled && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {/* 正在只播放主题的专属音乐 */}
          {music.themeTrack && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <Music2 className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">正在循环播放主题音乐「{trackTitle(music.themeTrack)}」</span>
              <button
                onClick={() => update({ themeMusic: '' })}
                className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-white/80 hover:bg-white/20 hover:text-white"
              >
                播放全部音乐
              </button>
            </div>
          )}
          {/* 曲目列表 */}
          <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10" aria-label="音乐列表">
            {music.tracks.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/40">
                还没有音乐。点击「添加音乐…」，或打开音乐文件夹把文件放进去
              </div>
            ) : (
              music.tracks.map((name, i) => {
                const current = name === music.current
                return (
                  <div
                    key={name}
                    data-track={name}
                    className={`group flex items-center gap-3 px-3 py-1.5 text-sm ${
                      current ? 'bg-emerald-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center text-xs text-white/40">
                      {current && music.playing ? <Music2 className="mx-auto h-3.5 w-3.5 text-emerald-300" /> : i + 1}
                    </span>
                    <button
                      onClick={() => playTrack(name)}
                      title="播放"
                      className={`min-w-0 flex-1 truncate text-left ${current ? 'text-emerald-300' : ''}`}
                    >
                      {trackTitle(name)}
                    </button>
                    <button
                      onClick={() => run(() => window.api.removeMusic(name))}
                      title="删除"
                      aria-label={`删除 ${trackTitle(name)}`}
                      className="rounded p-1 text-white/50 opacity-0 transition-opacity hover:bg-red-500/30 hover:text-white focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={() => run(() => window.api.addMusic())}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <Plus className="h-4 w-4" />
              添加音乐…
            </button>
            <button
              onClick={() => run(() => window.api.openMusicDir())}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <FolderOpen className="h-4 w-4" />
              打开音乐文件夹
            </button>
          </div>
          {(error || music.error) && (
            <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error || music.error}</div>
          )}

          {/* 播放顺序与音量 */}
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-white/60">播放顺序</div>
              <div className="mt-2 flex rounded-xl bg-black/20 p-1" role="radiogroup" aria-label="播放顺序">
                {ORDERS.map((o) => (
                  <button
                    key={o.key}
                    role="radio"
                    aria-checked={settings.musicOrder === o.key}
                    onClick={() => update({ musicOrder: o.key })}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                      settings.musicOrder === o.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <div className="flex justify-between text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <VolumeIcon className="h-3.5 w-3.5" />
                  音量
                </span>
                <span>{volume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                aria-label="音量"
                onChange={(e) => updateSlider({ musicVolume: Number(e.target.value) })}
                className="mt-3 w-full accent-emerald-500"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Gamepad2 className="h-4 w-4 text-white/50" />
              <div>
                <div className="text-sm">游戏运行时暂停</div>
                <div className="text-xs text-white/50">游戏启动后自动暂停，退出游戏后继续播放</div>
              </div>
            </div>
            <Switch
              checked={settings.musicPauseInGame !== false}
              onChange={() => update({ musicPauseInGame: settings.musicPauseInGame === false })}
              label="游戏运行时暂停"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default MusicSettings
