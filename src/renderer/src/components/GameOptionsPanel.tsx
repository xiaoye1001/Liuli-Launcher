import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Copy, Loader2, RotateCcw } from 'lucide-react'
import type { GameOptionsInfo, OptionsCopyMode } from '../../../shared/types'

/** 去掉 Electron 给 IPC 错误加的前缀 */
function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const COPY_MODES: [OptionsCopyMode, string][] = [
  ['all', '全部设置'],
  ['keys', '只复制按键']
]

/** 版本设置页里的「游戏内设置」：从其他版本复制设置、恢复修改前的设置 */
function GameOptionsPanel({ versionId }: { versionId: string }): JSX.Element {
  const [info, setInfo] = useState<GameOptionsInfo | null>(null)
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<OptionsCopyMode>('all')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await window.api.getGameOptionsInfo(versionId)
      setInfo(next)
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
    <div className="space-y-3">
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
