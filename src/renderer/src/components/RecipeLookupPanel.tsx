import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Loader2, Search, Store } from 'lucide-react'
import type { GameRecipe, InstalledVersion, RecipeBook, RecipeIngredient, RecipeKind } from '../../../shared/types'
import { PROFESSIONS, TRADE_LEVELS, tradesFor, professionOfWorkstation, type TradeItem } from '../utils/villagerTrades'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SELECT =
  'rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/50'

const KIND_NAMES: Record<RecipeKind, string> = {
  crafting: '工作台',
  smelting: '熔炉',
  blasting: '高炉',
  smoking: '烟熏炉',
  campfire: '营火',
  stonecutting: '切石机',
  smithing: '锻造台'
}

/** 常被查的东西，没搜索时给个起点 */
const POPULAR = [
  'crafting_table',
  'furnace',
  'anvil',
  'enchanting_table',
  'beacon',
  'piston',
  'hopper',
  'ender_eye',
  'netherite_ingot',
  'golden_apple',
  'rail',
  'observer'
]

function MorePill({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="ml-1 rounded bg-white/10 px-1 text-[10px] text-white/50">{children}</span>
}

/** 合成和交易查询：配方来自版本自己的游戏文件，交易是整理好的原版常见交易 */
function RecipeLookupPanel(): JSX.Element {
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [versionId, setVersionId] = useState('')
  const [book, setBook] = useState<RecipeBook | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'recipes' | 'trades'>('recipes')
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    void Promise.all([window.api.getInstalledVersions(), window.api.getSettings()]).then(([list, s]) => {
      setVersions(list)
      setVersionId(list.some((v) => v.id === s.selectedVersion) ? s.selectedVersion : (list[0]?.id ?? ''))
    })
  }, [])

  useEffect(() => {
    if (!versionId) return
    let alive = true
    setLoading(true)
    setError('')
    window.api
      .getRecipeBook(versionId)
      .then((b) => alive && setBook(b))
      .catch((e) => {
        if (!alive) return
        setBook(null)
        setError(cleanError(e))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [versionId])

  const selected = history[history.length - 1] ?? ''
  const nameOf = (id: string): string => book?.names[id] ?? id.replace(/^minecraft:/, '').replace(/_/g, ' ')

  /** 所有出现过的物品 */
  const items = useMemo(() => {
    const set = new Set<string>()
    for (const r of book?.recipes ?? []) {
      set.add(r.result.item)
      for (const ing of r.ingredients) for (const i of ing.items) set.add(i)
    }
    return [...set]
  }, [book])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const scored: { id: string; score: number }[] = []
    for (const id of items) {
      const name = (book?.names[id] ?? '').toLowerCase()
      const score = name === q || id === q ? 0 : name.startsWith(q) || id.startsWith(q) ? 1 : 2
      if (score < 2 || name.includes(q) || id.includes(q)) scored.push({ id, score })
    }
    return scored
      .sort((a, b) => a.score - b.score || nameOf(a.id).length - nameOf(b.id).length)
      .slice(0, 60)
      .map((s) => s.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items, book])

  const open = (id: string): void => {
    setTab('recipes')
    setHistory((h) => (h[h.length - 1] === id ? h : [...h.slice(-30), id]))
  }

  const makes = useMemo(() => (book?.recipes ?? []).filter((r) => r.result.item === selected), [book, selected])
  const usedIn = useMemo(() => {
    const out = new Map<string, number>()
    for (const r of book?.recipes ?? []) {
      if (r.result.item === selected) continue
      if (r.ingredients.some((ing) => ing.items.includes(selected)))
        out.set(r.result.item, (out.get(r.result.item) ?? 0) + 1)
    }
    return [...out.keys()]
  }, [book, selected])
  const trades = useMemo(() => (selected ? tradesFor(selected) : []), [selected])
  const workstationOf = selected ? professionOfWorkstation(selected) : undefined

  const chip = (id: string, extra?: React.ReactNode): JSX.Element => (
    <button
      key={id}
      onClick={() => open(id)}
      data-testid="recipe-item"
      className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
      title={id}
    >
      {nameOf(id)}
      {extra}
    </button>
  )

  /** 一个材料格：能用好几种时显示第一种和「等 N 种」 */
  const cell = (ing: RecipeIngredient | undefined, key: number | string): JSX.Element => {
    if (!ing) return <div key={key} className="h-12 w-[4.5rem] rounded-md bg-black/20" />
    const first = ing.items.includes(selected) ? selected : ing.items[0]
    return (
      <button
        key={key}
        onClick={() => open(first)}
        title={ing.items.map(nameOf).join('、')}
        data-testid="recipe-cell"
        className={`flex h-12 w-[4.5rem] flex-col items-center justify-center rounded-md px-1 text-center text-[11px] leading-tight hover:bg-white/20 ${first === selected ? 'bg-emerald-500/25' : 'bg-white/10'}`}
      >
        <span className="line-clamp-2">{nameOf(first)}</span>
        {ing.items.length > 1 && <span className="text-[10px] text-white/40">等 {ing.items.length} 种</span>}
      </button>
    )
  }

  const recipeCard = (r: GameRecipe): JSX.Element => {
    const result = (
      <button
        onClick={() => open(r.result.item)}
        className="flex h-12 min-w-[4.5rem] flex-col items-center justify-center rounded-md bg-amber-500/20 px-2 text-[11px] hover:bg-amber-500/30"
      >
        <span>{nameOf(r.result.item)}</span>
        {r.result.count > 1 && <span className="text-white/60">× {r.result.count}</span>}
      </button>
    )
    return (
      <div key={r.id} data-testid="recipe-card" className="space-y-2 rounded-xl bg-black/20 p-3">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">{KIND_NAMES[r.kind]}</span>
          {r.kind === 'crafting' && !r.shape && <span>随便摆</span>}
          {r.time !== undefined && <span>{`${r.time / 20} 秒`}</span>}
          {r.experience !== undefined && r.experience > 0 && <span>{`经验 ${r.experience}`}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {r.shape ? (
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${r.shape.width}, 4.5rem)` }}
              data-testid="recipe-grid"
            >
              {r.shape.cells.map((c, i) => cell(c < 0 ? undefined : r.ingredients[c], i))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {r.ingredients.map((ing, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-white/30">+</span>}
                  {cell(ing, i)}
                </span>
              ))}
            </div>
          )}
          <ArrowRight className="h-4 w-4 text-white/40" />
          {result}
        </div>
      </div>
    )
  }

  const tradeItem = (t: TradeItem): JSX.Element =>
    t.id === 'emerald' ? (
      <span className="text-emerald-300">{t.count > 0 ? `${t.count} 绿宝石` : '若干绿宝石'}</span>
    ) : (
      <button onClick={() => open(t.id)} className="underline decoration-white/20 hover:decoration-white">
        {t.count > 1 ? `${t.count} ${t.name}` : t.name}
      </button>
    )

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-amber-300" />
            合成与交易查询
          </div>
          <div className="ml-auto flex rounded-lg bg-black/20 p-0.5 text-xs">
            {(
              [
                ['recipes', '合成配方'],
                ['trades', '村民交易']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1 ${tab === key ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'recipes' && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={versionId}
                onChange={(e) => {
                  setVersionId(e.target.value)
                  setHistory([])
                }}
                aria-label="查哪个版本"
                className={SELECT}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                ))}
              </select>
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜物品，例如 活塞、铁砧、hopper"
                  aria-label="搜索物品"
                  className="w-full rounded-lg border border-white/15 bg-black/20 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-emerald-400/50"
                />
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
            </div>
            {book && (
              <p className="text-xs text-white/50">
                {`读取了 ${book.minecraftVersion || book.versionId} 自带的 ${book.recipes.length} 个配方`}
                {versions.find((v) => v.id === versionId)?.loader && '（只有原版配方，模组加的配方不在这里）'}
                {!book.chinese && '。没有找到中文语言文件，先显示英文名（下载过游戏资源后会显示中文）'}
              </p>
            )}
            {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
            {book && query.trim() && (
              <div className="flex flex-wrap gap-1.5" data-testid="recipe-matches">
                {matches.length === 0 ? (
                  <span className="text-xs text-white/50">没有找到</span>
                ) : (
                  matches.map((id) => chip(id))
                )}
              </div>
            )}
            {book && !query.trim() && !selected && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-white/50">常查的：</span>
                {POPULAR.filter((id) => items.includes(id)).map((id) => chip(id))}
              </div>
            )}
          </>
        )}
        {tab === 'trades' && (
          <p className="text-xs text-white/50">
            {
              '交易写在游戏代码里，不在游戏文件中，这里是整理好的原版 Java 版（1.14 以后）常见交易。每个村民每个等级只会随机出现其中几项，价格会随需求和折扣（治愈僵尸村民、村庄英雄）变化，以游戏里为准'
            }
          </p>
        )}
      </section>

      {tab === 'recipes' && book && selected && (
        <section
          className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl"
          data-testid="recipe-detail"
        >
          <div className="flex items-center gap-2">
            {history.length > 1 && (
              <button
                onClick={() => setHistory((h) => h.slice(0, -1))}
                className="rounded-lg bg-white/10 p-1 hover:bg-white/20"
                aria-label="返回上一个"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span className="text-lg font-semibold">{nameOf(selected)}</span>
            <span className="font-mono text-xs text-white/40">{selected}</span>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-white/80">{`怎么做（${makes.length}）`}</div>
            {makes.length === 0 ? (
              <div className="text-xs text-white/50">没有合成配方（要去挖、打怪、交易或者找宝箱）</div>
            ) : (
              <div className="space-y-2">{makes.map(recipeCard)}</div>
            )}
          </div>
          {usedIn.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-white/80">{`能用来做（${usedIn.length}）`}</div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" data-testid="recipe-used-in">
                {usedIn.map((id) => chip(id))}
              </div>
            </div>
          )}
          {(trades.length > 0 || workstationOf) && (
            <div className="space-y-1.5" data-testid="recipe-trades">
              <div className="flex items-center gap-1.5 text-sm font-medium text-white/80">
                <Store className="h-4 w-4" />
                村民交易
              </div>
              {workstationOf && (
                <div className="text-xs text-white/70">{`这是${workstationOf.name}的工作站：放在没有职业的村民旁边，他就会变成${workstationOf.name}`}</div>
              )}
              {trades.map(({ profession, trade, sells }, i) => (
                <div key={i} className="text-xs text-white/70">
                  {`${profession.name}（${TRADE_LEVELS[trade.level]}）${sells ? '卖' : '收'}：`}
                  {trade.give.map((g, j) => (
                    <span key={j}>
                      {j > 0 && ' + '}
                      {tradeItem(g)}
                    </span>
                  ))}
                  {' → '}
                  {tradeItem(trade.get)}
                  {trade.note && <span className="text-white/40">{`（${trade.note}）`}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'trades' && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="trade-list">
          {PROFESSIONS.map((p) => (
            <section
              key={p.key}
              className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-white/50">
                  工作站：
                  <button onClick={() => open(p.workstation.id)} className="underline decoration-white/20">
                    {p.workstation.name}
                  </button>
                </span>
              </div>
              <div className="space-y-1">
                {p.trades.map((t, i) => (
                  <div key={i} className="flex gap-2 text-xs text-white/70">
                    <span className="w-8 shrink-0 text-white/40">{TRADE_LEVELS[t.level]}</span>
                    <span className="min-w-0">
                      {t.give.map((g, j) => (
                        <span key={j}>
                          {j > 0 && ' + '}
                          {tradeItem(g)}
                        </span>
                      ))}
                      {' → '}
                      {tradeItem(t.get)}
                      {t.note && <MorePill>{t.note.split('，')[0]}</MorePill>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecipeLookupPanel
