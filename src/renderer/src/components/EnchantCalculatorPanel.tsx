import { useMemo, useState } from 'react'
import { Anvil, ArrowRight, BookOpen, Info, Sparkles } from 'lucide-react'
import {
  bestAnvilPlan,
  compatible,
  enchantInfo,
  enchantsFor,
  ITEMS,
  levelText,
  type AnvilStep,
  type BookChoice,
  type ItemKey
} from '../utils/anvil'

const SELECT =
  'rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm outline-none focus:border-emerald-400/50 disabled:opacity-40'

function bookText(books: BookChoice[]): string {
  return books.map((b) => `${enchantInfo(b.id)?.name ?? b.id} ${levelText(b.level)}`).join(' + ')
}

function StepRow({ step, index, itemName }: { step: AnvilStep; index: number; itemName: string }): JSX.Element {
  const left = step.target.item
    ? `${itemName}${step.target.books.length > 0 ? `（已有 ${bookText(step.target.books)}）` : ''}`
    : `附魔书：${bookText(step.target.books)}`
  return (
    <li data-testid="anvil-step" className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-200">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={step.target.item ? 'font-semibold' : ''}>{left}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5 text-violet-300" />
            {bookText(step.sacrifice.books)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-white/50">左边格子放前者，右边格子放后者</div>
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-emerald-200">{step.cost} 级</span>
    </li>
  )
}

/** 附魔 / 铁砧计算器：算出把附魔书合到物品上最省经验的顺序 */
function EnchantCalculatorPanel(): JSX.Element {
  const [item, setItem] = useState<ItemKey>('sword')
  const [uses, setUses] = useState(0)
  /** 选中的附魔 → 等级 */
  const [chosen, setChosen] = useState<Record<string, number>>({})

  const available = enchantsFor(item)
  const itemName = ITEMS.find((i) => i.key === item)?.name ?? ''
  const books = useMemo<BookChoice[]>(() => Object.entries(chosen).map(([id, level]) => ({ id, level })), [chosen])
  const plan = useMemo(() => (books.length > 0 ? bestAnvilPlan(books, uses) : null), [books, uses])

  const pickItem = (key: ItemKey): void => {
    setItem(key)
    // 换物品后只保留新物品也能用的附魔
    const allowed = new Set(enchantsFor(key).map((e) => e.id))
    setChosen((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => allowed.has(id))))
  }

  const toggle = (id: string, max: number): void => {
    setChosen((prev) => {
      const next = { ...prev }
      if (id in next) delete next[id]
      else next[id] = max
      return next
    })
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <Anvil className="h-4 w-4 text-sky-300" />
          要附魔的物品
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="物品">
          {ITEMS.map((i) => (
            <button
              key={i.key}
              role="radio"
              aria-checked={item === i.key}
              onClick={() => pickItem(i.key)}
              title={i.note}
              className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                item === i.key
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/10'
              }`}
            >
              {i.name}
              {i.note && <span className="ml-1 text-[10px] text-white/40">{i.note}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          物品已经在铁砧上用过
          <select
            value={uses}
            onChange={(e) => setUses(Number(e.target.value))}
            aria-label="物品已经在铁砧上用过的次数"
            className={SELECT}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          次<span className="text-xs text-white/40">（全新的物品选 0）</span>
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-4 w-4 text-violet-300" />
          想要的附魔
          <span className="text-xs font-normal text-white/50">每个附魔准备一本对应等级的附魔书</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
          {available.map((e) => {
            const on = e.id in chosen
            const clash = !on ? Object.keys(chosen).find((other) => !compatible(e.id, other)) : undefined
            return (
              <div
                key={e.id}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                  on ? 'bg-emerald-500/15' : 'bg-black/20'
                } ${clash ? 'opacity-50' : ''}`}
                title={clash ? `和「${enchantInfo(clash)?.name}」冲突` : undefined}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!!clash}
                    onChange={() => toggle(e.id, e.maxLevel)}
                    aria-label={e.name}
                    className="accent-emerald-500"
                  />
                  <span className="truncate">{e.name}</span>
                </label>
                {e.maxLevel > 1 && (
                  <select
                    value={chosen[e.id] ?? e.maxLevel}
                    disabled={!on}
                    onChange={(ev) => setChosen((prev) => ({ ...prev, [e.id]: Number(ev.target.value) }))}
                    aria-label={`${e.name} 等级`}
                    className={SELECT}
                  >
                    {Array.from({ length: e.maxLevel }, (_, i) => i + 1).map((level) => (
                      <option key={level} value={level}>
                        {levelText(level)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-amber-300" />
          最省经验的顺序
        </div>
        {books.length === 0 ? (
          <div className="text-sm text-white/50">先在上面勾选想要的附魔</div>
        ) : !plan ? (
          <div className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200" data-testid="anvil-impossible">
            无论怎么合，都会有一步达到 40 级（游戏里显示「过于昂贵！」）。试试少选几个附魔，或者换一件没上过铁砧的物品
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="anvil-summary">
              <span>
                一共 <b className="text-lg tabular-nums text-emerald-200">{plan.total}</b> 级经验
              </span>
              <span className="text-white/60">最贵的一步 {plan.maxStep} 级</span>
              <span className="text-white/60">
                {plan.steps.length} 步，合完后物品的累积惩罚为 {plan.penalty}
              </span>
            </div>
            <ol className="space-y-1.5">
              {plan.steps.map((step, i) => (
                <StepRow key={i} step={step} index={i} itemName={itemName} />
              ))}
            </ol>
          </>
        )}
        <div className="flex items-start gap-1.5 text-xs text-white/40">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {
              '按 Java 版 1.21 及以后的铁砧规则计算：每上一次铁砧，以后再上铁砧都要多花经验（累积惩罚），所以先把附魔书两两合并往往更省。每一步都低于 40 级，不会出现「过于昂贵！」'
            }
          </span>
        </div>
      </section>
    </div>
  )
}

export default EnchantCalculatorPanel
