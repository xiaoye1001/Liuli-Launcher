import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Copy, Gauge, Keyboard, Loader2, RotateCcw, Scale, Sparkles, type LucideIcon } from 'lucide-react'
import type { GameOptionsInfo, KeyConflict, OptionsCopyMode, VideoPreset } from '../../../shared/types'

/** 去掉 Electron 给 IPC 错误加的前缀 */
function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const COPY_MODES: [OptionsCopyMode, string][] = [
  ['all', '全部设置'],
  ['keys', '只复制按键']
]

/** 画质档位：名称、图标、说明 */
const PRESETS: { id: VideoPreset; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'smooth', label: '流畅', icon: Gauge, desc: '视距 6，关闭阴影和平滑光照，适合配置较低的电脑' },
  { id: 'balanced', label: '均衡', icon: Scale, desc: '视距 10，高品质图形，大多数电脑' },
  { id: 'high', label: '高画质', icon: Sparkles, desc: '视距 16，更远更细致，适合配置较好的电脑' }
]

/** 版本设置页里的「游戏内设置」：画质档位、从其他版本复制设置、恢复修改前的设置 */
function GameOptionsPanel({ versionId }: { versionId: string }): JSX.Element {
  const [info, setInfo] = useState<GameOptionsInfo | null>(null)
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<OptionsCopyMode>('all')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<KeyConflict[]>([])
  const [confirmReset, setConfirmReset] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await window.api.getGameOptionsInfo(versionId)
      setInfo(next)
      setConflicts(await window.api.getKeyConflicts(versionId).catch(() => []))
      setSource((prev) => (next.sources.some((s) => s.id === prev) ? prev : (next.sources[0]?.id ?? '')))
    } catch (e) {
      setError(cleanError(e))
    }
  }, [versionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<string>): Promise<void> => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const copy = (): Promise<void> =>
    run(async () => {
      const result = await window.api.copyGameOptions(source, versionId, mode)
      return result.keptKeys
        ? `已复制「${source}」的设置；按键格式不同，保留了这个版本原来的按键`
        : `已复制「${source}」的${mode === 'keys' ? '按键' : '设置'}，下次启动游戏生效`
    })

  const applyPreset = (preset: VideoPreset): Promise<void> =>
    run(async () => {
      await window.api.applyVideoPreset(versionId, preset)
      return `已切换到「${PRESETS.find((p) => p.id === preset)?.label}」画质，下次启动游戏生效`
    })

  const unbind = (action: { id: string; name: string }): Promise<void> =>
    run(async () => {
      await window.api.unbindKey(versionId, action.id)
      return `已解除「${action.name}」的按键，可以进游戏重新设置`
    })

  const resetKeys = (): Promise<void> => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
      return Promise.resolve()
    }
    setConfirmReset(false)
    return run(async () => {
      await window.api.resetKeyBindings(versionId)
      return '已把全部按键恢复默认，下次进入游戏生效'
    })
  }

  const restore = (): Promise<void> =>
    run(async () => {
      await window.api.restoreGameOptions(versionId)
      return '已恢复修改前的设置'
    })

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在读取游戏设置…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 画质档位 */}
      <div>
        <div className="mb-2 text-sm font-medium">画质档位</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRESETS.map(({ id, label, icon: Icon, desc }) => {
            const active = info.videoPreset === id
            return (
              <button
                key={id}
                onClick={() => void applyPreset(id)}
                disabled={busy || !info.videoPresetSupported}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-fuchsia-400/40 bg-fuchsia-500/15'
                    : 'border-white/10 bg-black/20 enabled:hover:bg-black/30'
                }`}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className={`h-4 w-4 ${active ? 'text-fuchsia-300' : 'text-white/50'}`} />
                  {label}
                  {active && <span className="ml-auto text-[11px] text-fuchsia-300">当前</span>}
                </div>
                <div className="mt-1 text-xs leading-5 text-white/50">{desc}</div>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-white/40">
          {info.videoPresetSupported
            ? '只修改视距、图形质量、粒子、实体阴影、平滑光照等几项，其他设置不变'
            : info.hasOptions
              ? '这个版本太旧，不支持画质档位'
              : '这个版本还没有游戏设置，先启动一次游戏再选择画质档位'}
        </p>
      </div>

      {/* 按键冲突 */}
      {info.hasOptions && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            按键冲突
            <button
              onClick={() => void resetKeys()}
              disabled={busy}
              className={`ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-normal transition-colors disabled:opacity-50 ${
                confirmReset ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <RotateCcw className="h-3 w-3" />
              {confirmReset ? '确认恢复？' : '全部按键恢复默认'}
            </button>
          </div>
          {conflicts.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-white/50">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              没有绑在同一个键上的操作
            </p>
          ) : (
            <div className="space-y-2">
              {conflicts.map((c) => (
                <div key={c.key} className="rounded-xl bg-black/20 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-amber-200">
                    <Keyboard className="h-3.5 w-3.5" />「{c.label}」上绑了 {c.actions.length} 个操作
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.actions.map((a) => (
                      <span
                        key={a.id}
                        className="flex items-center gap-1 rounded-lg bg-white/10 py-0.5 pl-2 pr-1 text-xs"
                        title={a.id}
                      >
                        {a.name}
                        <button
                          onClick={() => void unbind(a)}
                          disabled={busy}
                          className="rounded px-1 text-white/50 hover:bg-white/15 hover:text-white disabled:opacity-50"
                        >
                          解绑
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 从其他版本复制设置 */}
      <div>
        <div className="mb-2 text-sm font-medium">从其他版本复制设置</div>
        {info.sources.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="复制设置的来源版本"
              className="max-w-[16rem] cursor-pointer truncate rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 outline-none"
            >
              {info.sources.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-800 text-white">
                  {s.id}
                  {s.minecraftVersion && s.minecraftVersion !== s.id ? `（${s.minecraftVersion}）` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {COPY_MODES.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                    mode === value ? 'bg-fuchsia-500/25 text-fuchsia-300' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => void copy()}
              disabled={busy || !source}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              复制到这个版本
            </button>
          </div>
        ) : (
          <p className="text-xs text-white/50">
            其他版本还没有可以复制的设置（启动过一次游戏才会有设置；不隔离的版本本来就共用同一份设置）
          </p>
        )}
        <p className="mt-2 text-xs text-white/40">
          「全部设置」包括视频、声音、按键、语言等；「只复制按键」不改其他设置。修改前会自动备份这个版本原来的设置
        </p>
      </div>

      {info.backupAt !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs text-white/60">
          <span>上次修改前的设置已备份（{new Date(info.backupAt).toLocaleString('zh-CN')}）</span>
          <button
            onClick={() => void restore()}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复修改前的设置
          </button>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message}
        </div>
      )}
      {error && <div className="text-xs text-rose-300">{error}</div>}
    </div>
  )
}

export default GameOptionsPanel
