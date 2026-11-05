import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Map as MapIcon, Pencil, Plus, Search, Sprout, Trash2, X } from 'lucide-react'
import { effectiveSeed, isTextSeed, seedMapUrl } from '../utils/seed'
import type { SeedFavorite } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const INPUT =
  'min-w-0 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-emerald-400/50'

interface Draft {
  seed: string
  name: string
  version: string
  note: string
}

const EMPTY: Draft = { seed: '', name: '', version: '', note: '' }

/** 百宝箱：种子收藏夹 */
function SeedFavoritesPanel(): JSX.Element {
  const [list, setList] = useState<SeedFavorite[] | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<(Draft & { id: string }) | null>(null)
  const [keyword, setKeyword] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api
      .listSeedFavorites()
      .then(setList)
      .catch((e) => {
        setError(cleanError(e))
        setList([])
      })
  }, [])

  const run = async (action: () => Promise<SeedFavorite[]>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      setList(await action())
      return true
    } catch (e) {
      setError(cleanError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    if (await run(() => window.api.addSeedFavorite(draft))) setDraft(EMPTY)
  }

  const copy = async (s: SeedFavorite): Promise<void> => {
    await navigator.clipboard.writeText(s.seed)
    setCopied(s.id)
    setTimeout(() => setCopied((c) => (c === s.id ? '' : c)), 1500)
  }

  const shown = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!list || !k) return list ?? []
    return list.filter((s) => [s.seed, s.name, s.note, s.version].some((v) => v.toLowerCase().includes(k)))
  }, [list, keyword])

  const preview = draft.seed.trim() && isTextSeed(draft.seed) ? effectiveSeed(draft.seed) : null

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Sprout className="h-5 w-5 text-emerald-300" />
        <h2 className="font-semibold">种子收藏夹</h2>
        <span className="text-xs text-white/50">记下好玩的世界种子，开新存档时复制过去</span>
      </div>

      {/* 添加 */}
      <div className="space-y-2 rounded-xl bg-black/20 p-3">
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.7fr]">
          <input
            value={draft.seed}
            onChange={(e) => setDraft({ ...draft, seed: e.target.value })}
            maxLength={64}
            spellCheck={false}
            placeholder="种子，例如 -4172144997902289642"
            aria-label="种子"
            className={`${INPUT} font-mono`}
          />
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            maxLength={40}
            placeholder="名称，例如 出生点旁边有村庄"
            aria-label="名称"
            className={INPUT}
          />
          <input
            value={draft.version}
            onChange={(e) => setDraft({ ...draft, version: e.target.value })}
            maxLength={32}
            placeholder="游戏版本"
            aria-label="游戏版本"
            className={INPUT}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && !busy && draft.seed.trim() && void add()}
            maxLength={200}
            placeholder="备注（可以不填），例如 (120, 300) 有沙漠神殿"
            aria-label="备注"
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={() => void add()}
            disabled={busy || !draft.seed.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            收藏
          </button>
        </div>
        {preview && (
          <p className="text-xs text-white/50">
            这是文字种子，游戏里实际使用的种子是 <span className="font-mono">{preview}</span>
          </p>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

      {list && list.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索种子、名称、备注"
            aria-label="搜索种子"
            className={`${INPUT} w-full pl-9`}
          />
        </div>
      )}

      {list?.length === 0 && (
        <p className="py-4 text-center text-xs text-white/50">
          还没有收藏的种子。可以在上面添加，或者在「版本 → 存档 → 详情」里点「收藏」
        </p>
      )}

      <div className="space-y-2">
        {shown.map((s) => {
          const mapUrl = seedMapUrl(s.seed)
          const text = isTextSeed(s.seed)
          if (editing?.id === s.id) {
            return (
              <div key={s.id} className="space-y-2 rounded-xl bg-black/20 p-3">
                <div className="font-mono text-sm text-white/70">{s.seed}</div>
                <div className="grid gap-2 sm:grid-cols-[1fr_0.6fr]">
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    maxLength={40}
                    placeholder="名称"
                    aria-label="新的名称"
                    className={INPUT}
                  />
                  <input
                    value={editing.version}
                    onChange={(e) => setEditing({ ...editing, version: e.target.value })}
                    maxLength={32}
                    placeholder="游戏版本"
                    aria-label="新的游戏版本"
                    className={INPUT}
                  />
                </div>
                <input
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  maxLength={200}
                  placeholder="备注"
                  aria-label="新的备注"
                  className={`${INPUT} w-full`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(null)}
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                  >
                    <X className="h-3.5 w-3.5" />
                    取消
                  </button>
                  <button
                    onClick={() =>
                      void run(() =>
                        window.api.updateSeedFavorite(s.id, {
                          name: editing.name,
                          note: editing.note,
                          version: editing.version
                        })
                      ).then((ok) => ok && setEditing(null))
                    }
                    disabled={busy}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    保存
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div key={s.id} className="group flex items-start gap-3 rounded-xl bg-black/20 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name || '未命名的种子'}</span>
                  {s.version && (
                    <span className="shrink-0 rounded bg-white/10 px-1.5 text-[11px] text-white/60">{s.version}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="select-text truncate font-mono text-sm text-emerald-300">{s.seed}</span>
                  {text && (
                    <span className="shrink-0 text-xs text-white/40" title="文字种子在游戏里会变成这个数字">
                      → {effectiveSeed(s.seed)}
                    </span>
                  )}
                  <button
                    onClick={() => void copy(s)}
                    title="复制种子"
                    aria-label={`复制种子 ${s.seed}`}
                    className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    {copied === s.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {s.note && <div className="mt-1 break-all text-xs text-white/50">{s.note}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {mapUrl && (
                  <button
                    onClick={() => window.open(mapUrl, '_blank')}
                    title="在 Chunkbase 网站上查看这个种子的地图，游戏版本请在网页上选择"
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    种子地图
                  </button>
                )}
                <button
                  onClick={() => setEditing({ id: s.id, seed: s.seed, name: s.name, note: s.note, version: s.version })}
                  title="编辑名称和备注"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void run(() => window.api.deleteSeedFavorite(s.id))}
                  disabled={busy}
                  title="删除"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default SeedFavoritesPanel
