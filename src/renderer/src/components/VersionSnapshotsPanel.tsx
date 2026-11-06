import { useCallback, useEffect, useState } from 'react'
import { Camera, CheckCircle2, History, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { formatBytes } from '../utils/downloads'
import type { VersionSnapshot } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 版本设置页里的「版本快照」：保存模组、模组配置和游戏设置，改坏了一键恢复 */
function VersionSnapshotsPanel({
  versionId,
  onRestored
}: {
  versionId: string
  /** 恢复了快照：刷新游戏内设置 */
  onRestored: () => void
}): JSX.Element {
  const [list, setList] = useState<VersionSnapshot[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  /** 改模组前自动拍快照（全局设置） */
  const [auto, setAuto] = useState<boolean | null>(null)

  useEffect(() => {
    window.api
      .getSettings()
      .then((s) => setAuto(s.autoSnapshots))
      .catch(() => setAuto(null))
  }, [])

  const toggleAuto = async (): Promise<void> => {
    if (auto === null) return
    try {
      setAuto((await window.api.updateSettings({ autoSnapshots: !auto })).autoSnapshots)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const refresh = useCallback(async () => {
    try {
      setList(await window.api.listSnapshots(versionId))
    } catch (e) {
      setError(cleanError(e))
      setList([])
    }
  }, [versionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setBusy(key)
    setConfirm('')
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
      void refresh()
    }
  }

  const create = (): Promise<void> =>
    run('create', async () => {
      const s = await window.api.createSnapshot(versionId, name)
      setName('')
      return `已创建快照「${s.name}」（${s.modCount} 个模组，${formatBytes(s.bytes)}）`
    })

  const restore = (s: VersionSnapshot): void => {
    if (confirm !== s.id) {
      setConfirm(s.id)
      setTimeout(() => setConfirm((c) => (c === s.id ? '' : c)), 3000)
      return
    }
    void run(`restore:${s.id}`, async () => {
      await window.api.restoreSnapshot(versionId, s.id)
      onRestored()
      return `已恢复到「${s.name}」。恢复前的状态已自动保存，需要时可以再换回来`
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && void create()}
          maxLength={40}
          placeholder="快照名称（可以不填），例如 装光影之前"
          aria-label="快照名称"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-sky-400/50"
        />
        <button
          onClick={() => void create()}
          disabled={!!busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          创建快照
        </button>
      </div>

      {!list && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在读取快照…
        </div>
      )}
      {list?.length === 0 && (
        <p className="text-xs text-white/50">还没有快照。装新模组、更新整合包之前先拍一张，出问题时一键恢复</p>
      )}
      {list && list.length > 0 && (
        <div className="space-y-1.5">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
              <History className={`h-4 w-4 shrink-0 ${s.auto ? 'text-white/40' : 'text-sky-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{s.name}</span>
                  {s.auto && (
                    <span className="shrink-0 rounded bg-white/10 px-1.5 text-[11px] text-white/50">自动</span>
                  )}
                </div>
                <div className="truncate text-xs text-white/40">
                  {new Date(s.createdAt).toLocaleString('zh-CN', { hour12: false })} · {s.modCount} 个模组 ·{' '}
                  {formatBytes(s.bytes)}
                  {s.versionId && s.versionId !== versionId ? ` · 来自 ${s.versionId}` : ''}
                </div>
              </div>
              <button
                onClick={() => restore(s)}
                disabled={!!busy}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                  confirm === s.id ? 'bg-amber-500/80 text-white hover:bg-amber-500' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {busy === `restore:${s.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                {confirm === s.id ? '确认恢复？' : '恢复'}
              </button>
              <button
                onClick={() => {
                  // 删除快照不能恢复：点两次才删
                  if (confirm !== `delete:${s.id}`) {
                    setConfirm(`delete:${s.id}`)
                    setTimeout(() => setConfirm((c) => (c === `delete:${s.id}` ? '' : c)), 3000)
                    return
                  }
                  void run(`delete:${s.id}`, async () => {
                    await window.api.deleteSnapshot(versionId, s.id)
                    return `已删除快照「${s.name}」`
                  })
                }}
                disabled={!!busy}
                title="删除快照（不能恢复）"
                className={`flex items-center gap-1 rounded-lg p-1.5 text-xs transition-colors disabled:opacity-40 ${
                  confirm === `delete:${s.id}`
                    ? 'bg-red-500/80 px-2 text-white'
                    : 'text-white/50 hover:bg-red-500/30 hover:text-red-200'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirm === `delete:${s.id}` && '确认删除？'}
              </button>
            </div>
          ))}
        </div>
      )}

      {auto !== null && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={() => void toggleAuto()}
            aria-label="改模组前自动拍快照"
            className="mt-1"
          />
          <span>
            改模组前自动拍快照
            <span className="block text-xs text-white/50">
              更新模组或整合包、安装模组或合集、一键优化、一键光影、迁移模组之前自动保存一份（10 分钟内只拍一次， 超过 2
              GB 不拍），标「自动」，只留最近 5 个
            </span>
          </span>
        </label>
      )}

      <p className="text-xs text-white/40">
        快照包含模组、模组配置（config）和游戏设置（options.txt），不包含存档（存档请用存档备份）。
        恢复时会先自动保存现在的状态
      </p>
      {message && (
        <div className="flex items-start gap-2 text-xs text-emerald-300" role="status">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message}
        </div>
      )}
      {error && <div className="text-xs text-rose-300">{error}</div>}
    </div>
  )
}

export default VersionSnapshotsPanel
