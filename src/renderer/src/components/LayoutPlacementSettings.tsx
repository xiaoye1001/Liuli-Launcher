import { ArrowDown, ArrowUp, PanelLeft, PanelRight, PanelTop, RotateCcw, type LucideIcon } from 'lucide-react'
import { NAV_ITEMS } from './Sidebar'
import { HOME_MODULES, NAV_PAGES, normalizeOrder } from '../../../shared/types'
import type { AppSettings } from '../../../shared/types'

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

const HOME_MODULE_NAMES: Record<string, string> = {
  recent: '最近游玩',
  news: 'Minecraft 新闻',
  plugins: '插件小组件',
  hero: '欢迎卡片'
}

/** 一组单选按钮（和其它设置里的分段按钮一样） */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <div className="flex rounded-lg bg-black/20 p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors ${
              value === o.value ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {o.icon && <o.icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 可以上下移动的列表 */
function OrderList({
  label,
  items,
  onMove
}: {
  label: string
  items: { key: string; label: string; icon?: LucideIcon; note?: string }[]
  onMove: (index: number, delta: -1 | 1) => void
}): JSX.Element {
  const button =
    'rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent'
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2.5">
      <div className="mb-1.5 px-1 text-xs text-white/60">{label}</div>
      <ol className="space-y-1" aria-label={label}>
        {items.map((item, i) => (
          <li
            key={item.key}
            data-order-item={item.key}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1"
          >
            <span className="w-4 text-center text-xs tabular-nums text-white/30">{i + 1}</span>
            {item.icon && <item.icon className="h-4 w-4 shrink-0 text-white/60" />}
            <span className="min-w-0 flex-1 truncate text-sm">
              {item.label}
              {item.note && <span className="ml-1 text-xs text-white/40">{item.note}</span>}
            </span>
            <button
              onClick={() => onMove(i, -1)}
              disabled={i === 0}
              className={button}
              title="往前移"
              aria-label={`${item.label}往前移`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMove(i, 1)}
              disabled={i === items.length - 1}
              className={button}
              title="往后移"
              aria-label={`${item.label}往后移`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function moved(list: string[], index: number, delta: -1 | 1): string[] {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** 设置 → 个性化 → 布局：导航栏、主页启动区、主页模块放在哪里 */
function LayoutPlacementSettings({ settings, update }: Props): JSX.Element {
  const navPosition = settings.navPosition ?? 'left'
  const launchSide = settings.homeLaunchSide ?? 'right'
  const align = settings.homeAlign ?? 'bottom'
  const navOrder = normalizeOrder(settings.navOrder, NAV_PAGES)
  const homeOrder = normalizeOrder(settings.homeModuleOrder, HOME_MODULES)
  const hidden = Array.isArray(settings.hiddenPages) ? settings.hiddenPages : []

  const isDefault =
    navPosition === 'left' &&
    launchSide === 'right' &&
    align === 'bottom' &&
    navOrder.join() === NAV_PAGES.join() &&
    homeOrder.join() === HOME_MODULES.join()

  return (
    <div className="mt-6" data-testid="layout-placement">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">布局：放在哪里</div>
        {!isDefault && (
          <button
            onClick={() =>
              void update({
                navPosition: 'left',
                homeLaunchSide: 'right',
                homeAlign: 'bottom',
                navOrder: [...NAV_PAGES],
                homeModuleOrder: [...HOME_MODULES]
              })
            }
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认布局
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <Segmented
          label="导航栏"
          value={navPosition}
          onChange={(v) => void update({ navPosition: v })}
          options={[
            { value: 'left', label: '左边', icon: PanelLeft },
            { value: 'right', label: '右边', icon: PanelRight },
            { value: 'top', label: '顶部', icon: PanelTop }
          ]}
        />
        <Segmented
          label="主页的启动区（账号、版本、启动游戏）"
          value={launchSide}
          onChange={(v) => void update({ homeLaunchSide: v })}
          options={[
            { value: 'left', label: '左边', icon: PanelLeft },
            { value: 'right', label: '右边', icon: PanelRight }
          ]}
        />
        <Segmented
          label="主页内容"
          value={align}
          onChange={(v) => void update({ homeAlign: v })}
          options={[
            { value: 'bottom', label: '靠下（上面露出背景）' },
            { value: 'top', label: '靠上' }
          ]}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <OrderList
          label="主页模块（从上到下）"
          items={homeOrder.map((key) => ({ key, label: HOME_MODULE_NAMES[key] ?? key }))}
          onMove={(i, d) => void update({ homeModuleOrder: moved(homeOrder, i, d) })}
        />
        <OrderList
          label="导航栏页面的顺序"
          items={navOrder.map((key) => {
            const item = NAV_ITEMS.find((n) => n.key === key)
            return {
              key,
              label: item?.label ?? key,
              icon: item?.icon,
              note: hidden.includes(key) ? '（已隐藏）' : undefined
            }
          })}
          onMove={(i, d) => void update({ navOrder: moved(navOrder, i, d) })}
        />
      </div>
      <div className="mt-1.5 text-xs text-white/40">
        窗口比较窄时，主页的欢迎卡片和启动区会合成一张卡片，按「欢迎卡片」的位置摆放。
        其他页面（设置、账号、版本设置、下载、服务器、联机、AI 助手、更多……）点标题栏右边的「编辑布局」自己排
      </div>
    </div>
  )
}

export default LayoutPlacementSettings
