import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronDown, Library, Loader2, Pencil, Save, Trash2, X } from 'lucide-react'
import type { ModCollection, PerformanceModResult } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

/** 装合集的结果：新装了几个、已经有几个、哪些没有适用版本或失败 */
function summarize(results: PerformanceModResult[]): string {
  const count = (status: PerformanceModResult['status']): number => results.filter((r) => r.status === status).length
  const parts = [`新装了 ${count('installed')} 个`, `已经有 ${count('already')} 个`]
  const unavailable = results.filter((r) => r.status === 'unavailable').map((r) => r.name)
  const failed = results.filter((r) => r.status === 'failed').map((r) => r.name)
  if (unavailable.length > 0) parts.push(`没有适用于这个版本的：${unavailable.join('、')}`)
  if (failed.length > 0) parts.push(`下载失败：${failed.join('、')}`)
  return parts.join('；')
}

/** 我的常用模组合集：把这个版本的模组存为合集，或者把合集装到这个版本 */
function ModCollectionsDialog({
  versionId,
  onClose,
  onInstalled
}: {
  versionId: string
  onClose: () => void
  /** 装了合集：刷新模组列表 */
  onInstalled: () => void
}): JSX.Element {
  const [list, setList] = useState<ModCollection[] | null>(null)
  const [name, setName] = useState('')
  /** 正在进行的操作：save、apply:<id>、delete:<id>、rename:<id> */
  const [busy, setBusy] = useState('')
  const [expanded, setExpanded] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  const refresh = useCallback(async () => {
    try {
      setList(await window.api.listModCollections())
    } catch (e) {
      setError(cleanError(e))
      setList([])
    }
  }, [])

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
      const { collection, unknown } = await window.api.saveModCollection(versionId, name)
      setName('')
      return (
        `已保存「${collection.name}」，共 ${collection.mods.length} 个模组` +
        (unknown.length > 0 ? `；这些不是从 Modrinth 下载的，没有保存：${unknown.join('、')}` : '')
      )
    })

  const apply = (c: ModCollection): Promise<void> =>
    run(`apply:${c.id}`, async () => {
      const results = await window.api.applyModCollection(versionId, c.id)
      onInstalled()
      return `「${c.name}」：${summarize(results)}`
    })

  const remove = (c: ModCollection): Promise<void> =>
    run(`delete:${c.id}`, async () => {
      await window.api.deleteModCollection(c.id)
      return `已删除「${c.name}」`
    })

  const rename = (): Promise<void> => {
    if (!renaming) return Promise.resolve()
    const target = renaming
    return run(`rename:${target.id}`, async () => {
      await window.api.renameModCollection(target.id, target.name)
      setRenaming(null)
      return '已重命名'
    })
  }

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
        aria-label="我的模组合集"
        className="flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Library className="h-4 w-4 text-emerald-300" />
          <span className="flex-1">我的模组合集</span>
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
          把常用的模组存成合集，以后装到别的版本时按那个版本自动下载合适的模组版本和前置模组
        </p>

        {/* 存为合集 */}
        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void save()}
            maxLength={30}
            placeholder={`${versionId} 的模组`}
            aria-label="合集名称"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-emerald-400/50"
          />
          <button
            onClick={() => void save()}
            disabled={!!busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            把这个版本的模组存为合集
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">只保存已启用、从 Modrinth 下载的模组</p>

        {message && (
          <div className="mt-3 flex items-start gap-2 text-xs text-emerald-300" role="status">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{message}</span>
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

        {/* 合集列表 */}
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {!list && (
            <div className="flex justify-center py-6 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {list?.length === 0 && (
            <div className="rounded-xl bg-white/5 px-4 py-6 text-center text-xs text-white/50">还没有合集</div>
          )}
          {list?.map((c) => (
            <div key={c.id} className="rounded-xl bg-white/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpanded(expanded === c.id ? '' : c.id)}
                  aria-expanded={expanded === c.id}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${
                      expanded === c.id ? '' : '-rotate-90'
                    }`}
                  />
                  {renaming?.id === c.id ? null : <span className="truncate text-sm font-medium">{c.name}</span>}
                </button>
                {renaming?.id === c.id && (
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void rename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => setRenaming(null)}
                    title="按回车保存，按 Esc 取消"
                    maxLength={30}
                    aria-label="新的合集名称"
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/20 px-2 py-0.5 text-sm outline-none"
                  />
                )}
                <button
                  onClick={() => void apply(c)}
                  disabled={!!busy}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
                >
                  {busy === `apply:${c.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                  {busy === `apply:${c.id}` ? '正在安装…' : '装到这个版本'}
                </button>
                <button
                  onClick={() => setRenaming({ id: c.id, name: c.name })}
                  disabled={!!busy}
                  title="重命名"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void remove(c)}
                  disabled={!!busy}
                  title="删除合集（不影响已经装好的模组）"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-0.5 pl-5 text-xs text-white/40">
                {c.mods.length} 个模组 · 来自 {c.minecraftVersion} {LOADER_NAMES[c.loader] ?? c.loader} ·{' '}
                {new Date(c.createdAt).toLocaleDateString('zh-CN')}
              </div>
              {expanded === c.id && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                  {c.mods.map((m) => (
                    <span key={m.projectId} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                      {m.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ModCollectionsDialog
