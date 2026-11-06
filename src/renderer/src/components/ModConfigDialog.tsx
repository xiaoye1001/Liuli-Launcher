import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileCode, Loader2, RotateCcw, Save, Search, SlidersHorizontal, X } from 'lucide-react'
import type { ConfigEntry, ConfigFileInfo, ConfigFileView } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const INPUT =
  'min-w-0 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm outline-none focus:border-emerald-400/50'

function EntryControl({
  entry,
  value,
  onChange
}: {
  entry: ConfigEntry
  value: boolean | number | string
  onChange: (value: boolean | number | string) => void
}): JSX.Element {
  if (entry.type === 'boolean') {
    return (
      <button
        role="switch"
        aria-checked={value === true}
        aria-label={entry.key}
        onClick={() => onChange(!(value === true))}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${value === true ? 'bg-emerald-500' : 'bg-white/20'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${value === true ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    )
  }
  if (entry.options) {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        aria-label={entry.key}
        className={`${INPUT} w-40 shrink-0`}
      >
        {entry.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      value={String(value)}
      onChange={(e) => onChange(entry.type === 'number' ? e.target.value : e.target.value)}
      inputMode={entry.type === 'number' ? 'decimal' : undefined}
      aria-label={entry.key}
      className={`${INPUT} shrink-0 ${entry.type === 'number' ? 'w-28 font-mono' : 'w-56'}`}
    />
  )
}

/** 模组配置：把 config 文件夹里的配置文件显示成开关和输入框 */
function ModConfigDialog({ versionId, onClose }: { versionId: string; onClose: () => void }): JSX.Element {
  const [files, setFiles] = useState<ConfigFileInfo[] | null>(null)
  const [keyword, setKeyword] = useState('')
  const [entryKeyword, setEntryKeyword] = useState('')
  const [view, setView] = useState<ConfigFileView | null>(null)
  const [changes, setChanges] = useState<Record<string, boolean | number | string>>({})
  const [textMode, setTextMode] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  const loadFiles = (): void => {
    window.api
      .listConfigFiles(versionId)
      .then(setFiles)
      .catch((e) => {
        setError(cleanError(e))
        setFiles([])
      })
  }
  useEffect(loadFiles, [versionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))
        closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const show = (next: ConfigFileView): void => {
    setView(next)
    setChanges({})
    setText(next.text)
    setTextMode(next.entries === null)
  }

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const open = (name: string): Promise<void> =>
    run('open', async () => {
      setEntryKeyword('')
      show(await window.api.readConfigFile(versionId, name))
    })

  const save = (): Promise<void> =>
    run('save', async () => {
      if (!view) return
      const next = textMode
        ? await window.api.saveConfigText(versionId, view.name, text)
        : await window.api.saveConfigEntries(
            versionId,
            view.name,
            Object.fromEntries(
              Object.entries(changes).map(([id, v]) => {
                const entry = view.entries?.find((e) => e.id === id)
                return [id, entry?.type === 'number' ? Number(v) : v]
              })
            )
          )
      show(next)
      setNotice('已保存，下次启动游戏生效')
      loadFiles()
    })

  const restore = (): Promise<void> =>
    run('restore', async () => {
      if (!view) return
      show(await window.api.restoreConfigFile(versionId, view.name))
      setNotice('已恢复成第一次修改前的样子')
      loadFiles()
    })

  const shownFiles = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (files ?? []).filter((f) => !kw || f.name.toLowerCase().includes(kw))
  }, [files, keyword])

  const groups = useMemo(() => {
    const kw = entryKeyword.trim().toLowerCase()
    const map = new Map<string, ConfigEntry[]>()
    for (const e of view?.entries ?? []) {
      if (kw && !e.key.toLowerCase().includes(kw) && !e.comment.toLowerCase().includes(kw)) continue
      map.set(e.section, [...(map.get(e.section) ?? []), e])
    }
    return [...map.entries()]
  }, [view, entryKeyword])

  const dirty = textMode ? !!view && text !== view.text : Object.keys(changes).length > 0
  const button =
    'flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-40'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="模组配置"
        className="flex h-[85vh] w-[60rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-sky-300" />
          <span className="flex-1">模组配置</span>
          <button
            onClick={() => closeRef.current()}
            title="关闭"
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">
          {'改 config 文件夹里的模组设置；第一次修改前自动备份，改坏了可以「恢复原样」。退出游戏后再改，下次启动生效'}
        </p>
        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div className="flex w-64 shrink-0 flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索配置文件"
                aria-label="搜索配置文件"
                className={`${INPUT} w-full pl-7`}
              />
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" data-testid="config-files">
              {files === null && <Loader2 className="mx-auto mt-4 h-4 w-4 animate-spin text-white/50" />}
              {files?.length === 0 && (
                <div className="px-2 py-4 text-xs text-white/40">这个版本还没有配置文件（启动一次游戏后会生成）</div>
              )}
              {shownFiles.map((f) => (
                <button
                  key={f.name}
                  onClick={() => void open(f.name)}
                  title={f.name}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                    view?.name === f.name ? 'bg-emerald-500/15 text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
                  {f.hasBackup && (
                    <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-200">改过</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-black/15 p-3">
            {!view ? (
              <div className="m-auto text-sm text-white/40">点左边的配置文件</div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm" title={view.name}>
                    {view.name}
                  </span>
                  {view.entries && (
                    <button onClick={() => setTextMode((v) => !v)} className={button}>
                      {textMode ? '用表单编辑' : '直接改文本'}
                    </button>
                  )}
                  <button onClick={() => void restore()} disabled={!view.hasBackup || !!busy} className={button}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    恢复原样
                  </button>
                  <button
                    onClick={() => void save()}
                    disabled={!dirty || !!busy}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {busy === 'save' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    保存
                  </button>
                </div>
                {error && <div className="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200">{error}</div>}
                {notice && (
                  <div className="mt-2 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200">{notice}</div>
                )}
                {textMode ? (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    spellCheck={false}
                    aria-label="配置文件内容"
                    className="mt-2 min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs leading-5 outline-none focus:border-emerald-400/50"
                  />
                ) : (
                  <>
                    <input
                      value={entryKeyword}
                      onChange={(e) => setEntryKeyword(e.target.value)}
                      placeholder="搜索设置项"
                      aria-label="搜索设置项"
                      className={`${INPUT} mt-2 w-full shrink-0`}
                    />
                    <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="config-entries">
                      {view.entries?.length === 0 && (
                        <div className="text-xs text-white/40">这个文件里没有能直接改的设置项，可以直接改文本</div>
                      )}
                      {groups.map(([section, list]) => (
                        <div key={section} className="space-y-1">
                          {section && <div className="font-mono text-xs text-sky-300">[{section}]</div>}
                          {list.map((e) => {
                            const value = changes[e.id] ?? e.value
                            return (
                              <div
                                key={e.id}
                                data-testid="config-entry"
                                className={`flex items-start gap-3 rounded-lg px-2.5 py-1.5 ${e.id in changes ? 'bg-emerald-500/10' : 'bg-black/20'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-mono text-xs">{e.key}</div>
                                  {e.comment && (
                                    <div className="mt-0.5 whitespace-pre-wrap text-[11px] leading-4 text-white/40">
                                      {e.comment}
                                    </div>
                                  )}
                                </div>
                                <EntryControl
                                  entry={e}
                                  value={value}
                                  onChange={(v) =>
                                    setChanges((prev) => {
                                      const next = { ...prev }
                                      if (String(v) === String(e.value)) delete next[e.id]
                                      else next[e.id] = v
                                      return next
                                    })
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ModConfigDialog
