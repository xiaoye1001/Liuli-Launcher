import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ClipboardCopy, Download, Loader2, Share2, X } from 'lucide-react'
import type { ModSyncPreview, ModSyncResult } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: '要装', className: 'bg-emerald-500/20 text-emerald-200' },
  same: { label: '已装', className: 'bg-white/10 text-white/50' },
  different: { label: '版本不同', className: 'bg-amber-500/20 text-amber-200' }
}

/** 模组同步码：生成发给朋友，或者粘贴朋友的码一键装齐同样的模组 */
function ModSyncDialog({
  versionId,
  onClose,
  onInstalled
}: {
  versionId: string
  onClose: () => void
  onInstalled: () => void
}): JSX.Element {
  const [tab, setTab] = useState<'create' | 'use'>('create')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ code: string; count: number; unknown: string[] } | null>(null)
  const [copied, setCopied] = useState(false)
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<ModSyncPreview | null>(null)
  const [replace, setReplace] = useState(true)
  const [result, setResult] = useState<ModSyncResult | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const create = (): Promise<void> =>
    run('create', async () => setCreated(await window.api.createModSyncCode(versionId)))

  const copy = (): void => {
    if (!created) return
    void navigator.clipboard.writeText(created.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const check = (): Promise<void> =>
    run('preview', async () => {
      setResult(null)
      setPreview(await window.api.previewModSyncCode(versionId, input))
    })

  const apply = (): Promise<void> =>
    run('apply', async () => {
      const r = await window.api.applyModSyncCode(versionId, input, replace)
      setResult(r)
      setPreview(await window.api.previewModSyncCode(versionId, input))
      onInstalled()
    })

  const todo = preview
    ? preview.items.filter((i) => i.status === 'new' || (replace && i.status === 'different')).length
    : 0
  const mismatch =
    preview && (preview.minecraftVersion !== preview.targetMinecraftVersion || preview.loader !== preview.targetLoader)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="模组同步码"
        className="flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Share2 className="h-4 w-4 text-sky-300" />
          <span className="flex-1">模组同步码</span>
          <button
            onClick={() => closeRef.current()}
            title="关闭"
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">
          开模组服或者和朋友一起玩时，把模组做成一串码发给对方，对方粘贴后一键装上完全相同版本的模组
        </p>
        <div className="mt-3 flex rounded-xl bg-black/20 p-1">
          {(
            [
              ['create', '生成同步码'],
              ['use', '使用同步码']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg py-1.5 text-sm ${tab === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto" data-testid="mod-sync">
          {tab === 'create' ? (
            <div className="space-y-3 text-sm">
              {!created ? (
                <button
                  onClick={() => void create()}
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                  {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  生成这个版本的同步码
                </button>
              ) : (
                <>
                  <div className="text-xs text-white/60">
                    包含 {created.count} 个模组（Modrinth 上的版本），复制发给朋友：
                  </div>
                  <textarea
                    readOnly
                    value={created.code}
                    aria-label="同步码"
                    className="h-24 w-full resize-none rounded-lg border border-white/15 bg-black/30 p-2 font-mono text-[11px] text-white/80 outline-none"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copy}
                    className="flex items-center gap-1.5 rounded-lg bg-sky-500/70 px-3 py-1.5 text-sm text-white hover:bg-sky-500"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                    {copied ? '已复制' : '复制同步码'}
                  </button>
                  {created.unknown.length > 0 && (
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      这些模组不是从 Modrinth 下载的，不在同步码里，需要单独发给朋友：
                      <div className="mt-1 font-mono text-white/60">{created.unknown.join('、')}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setPreview(null)
                  setResult(null)
                }}
                placeholder="粘贴朋友发来的同步码（LIULI-MODS-1. 开头）"
                aria-label="粘贴同步码"
                className="h-20 w-full resize-none rounded-lg border border-white/15 bg-black/30 p-2 font-mono text-[11px] outline-none focus:border-emerald-400/50"
              />
              {!preview && (
                <button
                  onClick={() => void check()}
                  disabled={!!busy || !input.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20 disabled:opacity-50"
                >
                  {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />}
                  看看有哪些模组
                </button>
              )}
              {preview && (
                <>
                  {mismatch && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {`同步码来自 ${preview.minecraftVersion} ${preview.loader}，这个版本是 ${preview.targetMinecraftVersion} ${preview.targetLoader}，装上可能用不了`}
                    </div>
                  )}
                  <div className="max-h-56 space-y-1 overflow-y-auto" data-testid="mod-sync-items">
                    {preview.items.map((i) => (
                      <div key={i.versionId} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <span className="shrink-0 text-xs text-white/50">{i.versionNumber}</span>
                        {!i.fits && <span className="shrink-0 text-[11px] text-amber-300">不适合这个版本</span>}
                        <span className={`shrink-0 rounded px-1.5 text-[11px] ${STATUS[i.status].className}`}>
                          {STATUS[i.status].label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {preview.missing > 0 && (
                    <div className="text-xs text-white/50">{preview.missing} 个模组在 Modrinth 上已经找不到了</div>
                  )}
                  {preview.extra.length > 0 && (
                    <div className="text-xs text-white/50">
                      {`你这边多了 ${preview.extra.length} 个模组（同步码里没有，不会动它们）：${preview.extra.slice(0, 8).join('、')}${preview.extra.length > 8 ? '…' : ''}`}
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    版本不同的换成同步码里的版本（旧文件会备份，可以退回）
                  </label>
                  <button
                    onClick={() => void apply()}
                    disabled={!!busy || todo === 0}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 font-medium text-white disabled:opacity-50"
                  >
                    {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {todo > 0 ? `装上 ${todo} 个模组` : '已经全部装好了'}
                  </button>
                </>
              )}
              {result && (
                <div
                  className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
                  data-testid="mod-sync-result"
                >
                  {`装上 ${result.installed.length} 个，替换 ${result.replaced.length} 个${result.skipped ? `，${result.skipped} 个不用动` : ''}`}
                  {result.failed.length > 0 && (
                    <div className="mt-1 text-rose-300">
                      {result.failed.map((f) => `${f.title}：${f.error}`).join('；')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
      </div>
    </div>,
    document.body
  )
}

export default ModSyncDialog
