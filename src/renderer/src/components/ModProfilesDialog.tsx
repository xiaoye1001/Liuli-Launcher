import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Layers3, Loader2, Save, Trash2, X } from 'lucide-react'
import type { ModProfile } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 模组启用方案：把现在的模组开关存成方案，一键切换 */
function ModProfilesDialog({
  versionId,
  onClose,
  onApplied
}: {
  versionId: string
  onClose: () => void
  /** 切换了方案：刷新模组列表 */
  onApplied: () => void
}): JSX.Element {
  const [profiles, setProfiles] = useState<ModProfile[] | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.listModProfiles(versionId)
      setProfiles(result.profiles)
      setCurrent(result.current)
    } catch (e) {
      setError(cleanError(e))
      setProfiles([])
    }
  }, [versionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setBusy(key)
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

  const save = (): Promise<void> =>
    run('save', async () => {
      const profile = await window.api.saveModProfile(versionId, name)
      setName('')
      return `已保存「${profile.name}」：开 ${profile.enabled.length} 个、关 ${profile.disabled.length} 个模组`
    })

  const apply = (p: ModProfile): Promise<void> =>
    run(`apply:${p.id}`, async () => {
      const r = await window.api.applyModProfile(versionId, p.id)
      onApplied()
      const parts = [`打开 ${r.enabled} 个`, `关闭 ${r.disabled} 个`]
      if (r.untouched > 0) parts.push(`${r.untouched} 个之后新加的模组没有改动`)
      if (r.missing > 0) parts.push(`${r.missing} 个模组已经删掉了`)
      if (r.failed.length > 0) parts.push(`这些没能切换：${r.failed.join('、')}`)
      return `已切换到「${p.name}」：${parts.join('，')}`
    })

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label="模组启用方案"
        className="flex max-h-[85vh] w-[30rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Layers3 className="h-4 w-4 text-emerald-300" />
          <span className="flex-1">模组启用方案</span>
          <button
            onClick={() => closeRef.current()}
            disabled={!!busy}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/50">
          把现在哪些模组开、哪些关存成方案（例如「生存」「光影」「建筑」），以后一键切换，不用逐个点开关
        </p>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {!profiles && (
            <div className="flex justify-center py-6 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {profiles?.length === 0 && (
            <div className="rounded-xl bg-white/5 px-4 py-6 text-center text-xs text-white/50">
              还没有方案：先把模组开关调好，再在下面存成方案
            </div>
          )}
          {profiles?.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {current === p.id && (
                    <span className="rounded bg-emerald-500/20 px-1.5 text-[11px] text-emerald-300">当前</span>
                  )}
                </div>
                <div className="text-xs text-white/40">
                  开 {p.enabled.length} 个 · 关 {p.disabled.length} 个 ·{' '}
                  {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <button
                onClick={() => void apply(p)}
                disabled={!!busy || current === p.id}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/40"
              >
                {busy === `apply:${p.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                切换
              </button>
              <button
                onClick={() =>
                  void run(`delete:${p.id}`, async () => {
                    await window.api.deleteModProfile(versionId, p.id)
                    return `已删除「${p.name}」（不影响模组）`
                  })
                }
                disabled={!!busy}
                title="删除方案（不影响模组）"
                className="rounded-lg p-1.5 text-white/50 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {message && (
          <div className="mt-3 flex items-start gap-2 text-xs text-emerald-300" role="status">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{message}</span>
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && name.trim() && void save()}
            maxLength={30}
            placeholder="方案名称，例如 生存"
            aria-label="方案名称"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-emerald-400/50"
          />
          <button
            onClick={() => void save()}
            disabled={!!busy || !name.trim()}
            title="同名的方案会被更新成现在的开关状态"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            存为方案
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ModProfilesDialog
