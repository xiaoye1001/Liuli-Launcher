import { useState } from 'react'
import { Flame, Gauge, Package, Timer } from 'lucide-react'
import {
  comparatorSignal,
  CONTAINERS,
  formatDuration,
  FUELS,
  FURNACES,
  hopperPerHour,
  hopperSeconds,
  itemsForSignal,
  redstoneTicksToSeconds,
  smelt
} from '../utils/redstone'

const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400/50'

function num(text: string, max = 10_000_000): number {
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

function Card({
  icon: Icon,
  tint,
  title,
  children
}: {
  icon: typeof Flame
  tint: string
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-2 font-semibold">
        <Icon className={`h-4 w-4 ${tint}`} />
        {title}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-white/50">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Result({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-sm">
      <span className="text-xs text-white/50">{label}</span>
      <span className="font-medium tabular-nums" data-testid={`rs-${label}`}>
        {value}
      </span>
    </div>
  )
}

function HopperCalc(): JSX.Element {
  const [items, setItems] = useState('1728')
  const [lanes, setLanes] = useState('1')
  const n = num(items)
  const l = Math.max(1, Math.floor(num(lanes, 1000)))
  return (
    <Card icon={Package} tint="text-sky-300" title="漏斗传输">
      <div className="grid grid-cols-2 gap-2">
        <Field label="物品数量（一箱 1728 个）">
          <input
            value={items}
            onChange={(e) => setItems(e.target.value)}
            inputMode="numeric"
            aria-label="漏斗物品数量"
            className={INPUT}
          />
        </Field>
        <Field label="并排几条漏斗">
          <input
            value={lanes}
            onChange={(e) => setLanes(e.target.value)}
            inputMode="numeric"
            aria-label="漏斗条数"
            className={INPUT}
          />
        </Field>
      </div>
      <Result label="传完需要" value={formatDuration(hopperSeconds(n, l))} />
      <Result label="每小时能传" value={`${hopperPerHour(l).toLocaleString()} 个`} />
      <p className="text-xs text-white/40">漏斗每 8 游戏刻传 1 个物品（每秒 2.5 个），一长串漏斗也不会更快</p>
    </Card>
  )
}

function SmeltCalc(): JSX.Element {
  const [items, setItems] = useState('64')
  const [furnace, setFurnace] = useState('furnace')
  const [fuel, setFuel] = useState('coal')
  const [count, setCount] = useState('1')
  const r = smelt(num(items), furnace, fuel, Math.max(1, Math.floor(num(count, 1000))))
  const fuelName = FUELS.find((f) => f.key === fuel)?.name ?? ''
  return (
    <Card icon={Flame} tint="text-rose-300" title="熔炉">
      <div className="grid grid-cols-2 gap-2">
        <Field label="要烧的物品">
          <input
            value={items}
            onChange={(e) => setItems(e.target.value)}
            inputMode="numeric"
            aria-label="要烧的物品数量"
            className={INPUT}
          />
        </Field>
        <Field label="炉子数量">
          <input
            value={count}
            onChange={(e) => setCount(e.target.value)}
            inputMode="numeric"
            aria-label="炉子数量"
            className={INPUT}
          />
        </Field>
        <Field label="炉子">
          <select value={furnace} onChange={(e) => setFurnace(e.target.value)} aria-label="炉子" className={INPUT}>
            {FURNACES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="燃料">
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} aria-label="燃料" className={INPUT}>
            {FUELS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}（{f.items} 个）
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Result label="烧完需要" value={formatDuration(r.seconds)} />
      <Result label="需要燃料" value={`${r.fuel} 个${fuelName}`} />
      <p className="text-xs text-white/40">
        高炉、烟熏炉快一倍，但燃料也烧得快一倍；括号里是在普通熔炉里一份燃料能烧几个
      </p>
    </Card>
  )
}

function ComparatorCalc(): JSX.Element {
  const [container, setContainer] = useState('chest')
  const [items, setItems] = useState('100')
  const [stack, setStack] = useState('64')
  const [want, setWant] = useState('8')
  const slots = CONTAINERS.find((c) => c.key === container)?.slots ?? 27
  const max = Number(stack)
  const need = itemsForSignal(Math.floor(num(want, 15)), slots, max)
  return (
    <Card icon={Gauge} tint="text-amber-300" title="比较器信号强度">
      <div className="grid grid-cols-2 gap-2">
        <Field label="容器">
          <select value={container} onChange={(e) => setContainer(e.target.value)} aria-label="容器" className={INPUT}>
            {CONTAINERS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="物品最大堆叠">
          <select value={stack} onChange={(e) => setStack(e.target.value)} aria-label="最大堆叠" className={INPUT}>
            <option value="64">64（大部分物品）</option>
            <option value="16">16（末影珍珠、雪球等）</option>
            <option value="1">1（工具、药水等）</option>
          </select>
        </Field>
        <Field label="放了多少个">
          <input
            value={items}
            onChange={(e) => setItems(e.target.value)}
            inputMode="numeric"
            aria-label="容器物品数量"
            className={INPUT}
          />
        </Field>
        <Field label="想要的信号强度（1～15）">
          <input
            value={want}
            onChange={(e) => setWant(e.target.value)}
            inputMode="numeric"
            aria-label="想要的信号强度"
            className={INPUT}
          />
        </Field>
      </div>
      <Result label="信号强度" value={String(comparatorSignal(num(items), slots, max))} />
      <Result label="至少要放" value={Number.isNaN(need) ? '最大 15' : `${need} 个`} />
    </Card>
  )
}

function TickCalc(): JSX.Element {
  const [ticks, setTicks] = useState('4')
  const [unit, setUnit] = useState<'rt' | 'gt'>('rt')
  const [seconds, setSeconds] = useState('1')
  const t = num(ticks)
  const sec = unit === 'rt' ? redstoneTicksToSeconds(t) : t / 20
  const s = num(seconds)
  return (
    <Card icon={Timer} tint="text-emerald-300" title="刻和秒换算">
      <div className="grid grid-cols-2 gap-2">
        <Field label="刻数">
          <input
            value={ticks}
            onChange={(e) => setTicks(e.target.value)}
            inputMode="decimal"
            aria-label="刻数"
            className={INPUT}
          />
        </Field>
        <Field label="单位">
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'rt' | 'gt')}
            aria-label="刻的单位"
            className={INPUT}
          >
            <option value="rt">红石刻（中继器档位）</option>
            <option value="gt">游戏刻</option>
          </select>
        </Field>
      </div>
      <Result label="等于" value={`${+sec.toFixed(3)} 秒`} />
      <Field label="秒数">
        <input
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          inputMode="decimal"
          aria-label="秒数"
          className={INPUT}
        />
      </Field>
      <Result label="换成红石刻" value={`${+(s * 10).toFixed(2)} 红石刻（${+(s * 20).toFixed(2)} 游戏刻）`} />
      <p className="text-xs text-white/40">1 红石刻 = 2 游戏刻 = 0.1 秒；中继器每档 1 红石刻，最多 4 档</p>
    </Card>
  )
}

/** 红石计算器：漏斗、熔炉、比较器、刻 */
function RedstoneToolsPanel(): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HopperCalc />
      <SmeltCalc />
      <ComparatorCalc />
      <TickCalc />
    </div>
  )
}

export default RedstoneToolsPanel
