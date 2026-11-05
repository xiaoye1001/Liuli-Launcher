import { useState } from 'react'
import { ArrowLeftRight, Check, Clock, Copy, Flame, Grid3x3 } from 'lucide-react'
import {
  chunkOf,
  clockToTicks,
  formatRealTime,
  netherToOverworld,
  overworldToNether,
  ticksToGameTime
} from '../utils/mcCalc'

const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-white/30 focus:border-emerald-400/50'

/** 输入框里的数字；空的或不是数字时为 null */
function num(text: string): number | null {
  if (!text.trim()) return null
  const n = Number(text)
  return Number.isFinite(n) && Math.abs(n) <= 30_000_000 ? n : null
}

function NumberField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}): JSX.Element {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-white/50">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={label}
        className={`mt-1 ${INPUT}`}
      />
    </label>
  )
}

function CopyButton({ text }: { text: string }): JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      title={`复制：${text}`}
      aria-label={`复制 ${text}`}
      className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Row({
  label,
  value,
  copy,
  mono = true
}: {
  label: string
  value: string
  copy?: string
  /** 数值用等宽字体，带中文的说明不用 */
  mono?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-xs text-white/50">{label}</span>
      <span className={`min-w-0 flex-1 truncate tabular-nums ${mono ? 'font-mono' : ''}`}>{value}</span>
      {copy && <CopyButton text={copy} />}
    </div>
  )
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

/** 下界和主世界的坐标换算 */
function NetherCalc(): JSX.Element {
  const [fromNether, setFromNether] = useState(false)
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [z, setZ] = useState('')
  const nx = num(x)
  const nz = num(z)
  const ny = num(y)
  const result =
    nx !== null && nz !== null ? (fromNether ? netherToOverworld(nx, nz) : overworldToNether(nx, nz)) : null
  const target = fromNether ? '主世界' : '下界'
  const coords = result ? `${result.x} ${ny !== null ? Math.floor(ny) : '~'} ${result.z}` : ''
  return (
    <Card icon={Flame} tint="text-rose-300" title="下界坐标换算">
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-lg bg-black/20 px-2.5 py-1">{fromNether ? '下界' : '主世界'}</span>
        <button
          onClick={() => setFromNether(!fromNether)}
          title="换方向"
          aria-label="换方向"
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <span className="rounded-lg bg-black/20 px-2.5 py-1">{target}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="X" value={x} onChange={setX} placeholder="例如 800" />
        <NumberField label="Y（可以不填）" value={y} onChange={setY} />
        <NumberField label="Z" value={z} onChange={setZ} placeholder="例如 -240" />
      </div>
      {result ? (
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <Row label={`${target}坐标`} value={coords.replace(/ /g, ', ').replace('~', '同一高度')} copy={coords} />
        </div>
      ) : (
        <p className="text-xs text-white/40">输入 X 和 Z，算出传送门在另一边应该建在哪里</p>
      )}
      <p className="text-xs text-white/40">
        下界走 1 格等于主世界 8 格，高度不变。两边的传送门按换算后的坐标建，就能连在一起
      </p>
    </Card>
  )
}

/** 方块坐标所在的区块 */
function ChunkCalc(): JSX.Element {
  const [x, setX] = useState('')
  const [z, setZ] = useState('')
  const nx = num(x)
  const nz = num(z)
  const info = nx !== null && nz !== null ? chunkOf(nx, nz) : null
  return (
    <Card icon={Grid3x3} tint="text-emerald-300" title="区块坐标">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="方块 X" value={x} onChange={setX} placeholder="例如 -1" />
        <NumberField label="方块 Z" value={z} onChange={setZ} placeholder="例如 17" />
      </div>
      {info ? (
        <div className="space-y-1.5 rounded-lg bg-black/20 px-3 py-2">
          <Row label="区块" value={`${info.chunkX}, ${info.chunkZ}`} copy={`${info.chunkX} ${info.chunkZ}`} />
          <Row label="区块里的位置" value={`${info.localX}, ${info.localZ}`} />
          <Row label="区块范围" value={`X ${info.fromX} ~ ${info.toX}，Z ${info.fromZ} ~ ${info.toZ}`} mono={false} />
          <Row label="存档文件" value={`region/${info.regionFile}`} copy={info.regionFile} />
        </div>
      ) : (
        <p className="text-xs text-white/40">
          输入方块坐标，算出它在哪个区块、区块的边界在哪（建刷怪塔、找史莱姆区块时用）
        </p>
      )}
    </Card>
  )
}

const TIME_PRESETS: [string, number][] = [
  ['日出', 23000],
  ['早上', 1000],
  ['中午', 6000],
  ['日落', 12000],
  ['夜晚', 13000],
  ['午夜', 18000]
]

/** 游戏时间换算 */
function TimeCalc(): JSX.Element {
  const [ticks, setTicks] = useState('')
  const [clock, setClock] = useState('')
  const t = num(ticks)
  const time = t !== null && t >= 0 ? ticksToGameTime(t) : null
  const m = /^(\d{1,2})[:：](\d{1,2})$/.exec(clock.trim())
  const clockTicks = m && +m[1] < 24 && +m[2] < 60 ? clockToTicks(+m[1], +m[2]) : null
  return (
    <Card icon={Clock} tint="text-sky-300" title="游戏时间换算">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="刻数（daytime 或 time 的值）" value={ticks} onChange={setTicks} placeholder="例如 13000" />
        <label className="block min-w-0">
          <span className="text-xs text-white/50">游戏里的时刻</span>
          <input
            value={clock}
            onChange={(e) => setClock(e.target.value)}
            placeholder="例如 19:30"
            aria-label="游戏里的时刻"
            className={`mt-1 ${INPUT}`}
          />
        </label>
      </div>
      {(time || clockTicks !== null) && (
        <div className="space-y-1.5 rounded-lg bg-black/20 px-3 py-2">
          {time && (
            <>
              <Row label="游戏时间" value={`第 ${time.day} 天 ${time.clock}（${time.phase}）`} mono={false} />
              <Row label="现实时间" value={`约 ${formatRealTime(time.realSeconds)}`} mono={false} />
            </>
          )}
          {clockTicks !== null && (
            <Row label={`${clock.trim()} 对应`} value={`${clockTicks} 刻`} copy={`/time set ${clockTicks}`} />
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {TIME_PRESETS.map(([label, value]) => (
          <button
            key={label}
            onClick={() => {
              void navigator.clipboard.writeText(`/time set ${value}`)
              setTicks(String(value))
            }}
            title={`复制 /time set ${value}`}
            className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          >
            {label} <span className="font-mono text-white/50">{value}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-white/40">
        游戏里一天 24000 刻，现实 20 分钟；0 刻是早上 6 点。点上面的按钮复制 /time set 命令
      </p>
    </Card>
  )
}

/** 百宝箱：Minecraft 小工具 */
function MinecraftToolsPanel(): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NetherCalc />
      <ChunkCalc />
      <div className="lg:col-span-2">
        <TimeCalc />
      </div>
    </div>
  )
}

export default MinecraftToolsPanel
