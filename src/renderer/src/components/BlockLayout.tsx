import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, GripVertical, LayoutDashboard, RotateCcw } from 'lucide-react'
import { useAppearance } from '../utils/appearance'
import type { BlockWidth, PageLayout } from '../../../shared/types'

/**
 * 积木式布局：页面由几个区块组成，用户点「编辑布局」后可以拖动或用箭头排顺序、隐藏区块、
 * 选择整行 / 左列 / 右列。每个页面的布局单独保存在设置的 pageLayouts 里。
 *
 * 没改过布局、而且区块都是整行时，区块直接放在原来的容器里（不多包一层），页面的样子和原来完全一样
 */

// ---------- 正在编辑哪个页面 ----------

let editing: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 每个页面挂着几个「编辑布局」按钮：都没了（离开了页面）就退出编辑 */
const mountedButtons = new Map<string, number>()

export function setLayoutEditing(page: string | null): void {
  editing = page
  listeners.forEach((l) => l())
}

/** 这个布局是否在编辑：编辑「account」时，「account」和「account.main」这样的子布局一起编辑 */
function isEditingPage(page: string): boolean {
  return editing !== null && (page === editing || page.startsWith(`${editing}.`))
}

export function useLayoutEditing(page: string): boolean {
  return useSyncExternalStore(subscribe, () => isEditingPage(page))
}

// ---------- 区块 ----------

interface LayoutBlockProps {
  /** 区块名（保存布局用，只能是字母、数字和 -） */
  id: string
  /** 编辑布局时显示的名字 */
  title: string
  /** 默认宽度 */
  defaultWidth?: BlockWidth
  /** 里面还有一层布局（编辑时里面的区块要能点） */
  nested?: boolean
  children?: ReactNode
}

/** 页面里的一个区块；只能放在 BlockLayout 里面 */
export function LayoutBlock({ children }: LayoutBlockProps): JSX.Element {
  return <>{children}</>
}

interface Block {
  id: string
  title: string
  defaultWidth: BlockWidth
  nested: boolean
  node: ReactNode
}

const WIDTH_NAMES: Record<BlockWidth, string> = { full: '整行', left: '左', right: '右' }

/** 保存一个页面的布局（其它页面的保持不变） */
async function saveLayout(page: string, layout: PageLayout): Promise<void> {
  const settings = await window.api.getSettings()
  await window.api.updateSettings({ pageLayouts: { ...(settings.pageLayouts ?? {}), [page]: layout } })
}

/** 恢复默认：去掉这个页面（以及它的子布局，例如 account.main）保存的布局 */
async function resetLayouts(page: string): Promise<void> {
  const settings = await window.api.getSettings()
  const all = Object.fromEntries(
    Object.entries(settings.pageLayouts ?? {}).filter(([key]) => key !== page && !key.startsWith(`${page}.`))
  )
  await window.api.updateSettings({ pageLayouts: all })
}

function blocksOf(children: ReactNode): Block[] {
  const out: Block[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== LayoutBlock) return
    const props = (child as ReactElement<LayoutBlockProps>).props
    out.push({
      id: props.id,
      title: props.title,
      defaultWidth: props.defaultWidth ?? 'full',
      nested: props.nested === true,
      node: props.children
    })
  })
  return out
}

/**
 * 按保存的布局排好的区块。没记录的区块（以后新加的）放在它默认的前一个区块后面
 */
function arrange(blocks: Block[], saved: PageLayout | undefined): Block[] {
  if (!saved || saved.order.length === 0) return blocks
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const ordered = saved.order.map((id) => byId.get(id)).filter((b): b is Block => !!b)
  blocks.forEach((b, i) => {
    if (ordered.includes(b)) return
    const prev = blocks
      .slice(0, i)
      .reverse()
      .find((p) => ordered.includes(p))
    ordered.splice(prev ? ordered.indexOf(prev) + 1 : 0, 0, b)
  })
  return ordered
}

/** 编辑布局时区块外面的框：上面一条工具栏 */
function EditFrame({
  block,
  index,
  count,
  width,
  hidden,
  onMove,
  onWidth,
  onToggle,
  onDragStart,
  onDropOn,
  widths
}: {
  block: Block
  index: number
  count: number
  width: BlockWidth
  hidden: boolean
  onMove: (delta: -1 | 1) => void
  onWidth: (w: BlockWidth) => void
  onToggle: () => void
  onDragStart: () => void
  onDropOn: (dragged: string) => void
  /** 能不能选宽度 */
  widths: boolean
}): JSX.Element {
  const [over, setOver] = useState(false)
  const icon = 'rounded-md p-1 text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-25'
  return (
    <div
      data-layout-block={block.id}
      draggable
      onDragStart={(e: DragEvent) => {
        // 一层布局里面还有一层时，拖里面的区块不能带动外面的
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', block.id)
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onDropOn(e.dataTransfer.getData('text/plain'))
      }}
      className={`min-w-0 rounded-2xl p-1.5 outline-dashed outline-2 outline-offset-2 transition-colors ${
        over ? 'bg-emerald-500/10 outline-emerald-300' : 'outline-emerald-400/40'
      }`}
    >
      <div className="mb-1.5 flex cursor-grab flex-wrap items-center gap-1.5 rounded-xl bg-emerald-500/15 px-2.5 py-1.5 text-sm active:cursor-grabbing">
        <GripVertical className="h-4 w-4 shrink-0 text-white/50" />
        <span className={`min-w-0 flex-1 truncate font-medium ${hidden ? 'text-white/40 line-through' : ''}`}>
          {block.title}
        </span>
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className={icon}
          title="往前移"
          aria-label={`${block.title}往前移`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          className={icon}
          title="往后移"
          aria-label={`${block.title}往后移`}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        {widths && (
          <div className="flex rounded-lg bg-black/20 p-0.5" role="radiogroup" aria-label={`${block.title}的宽度`}>
            {(['full', 'left', 'right'] as const).map((w) => (
              <button
                key={w}
                role="radio"
                aria-checked={width === w}
                aria-label={`${block.title}${WIDTH_NAMES[w]}`}
                onClick={() => onWidth(w)}
                className={`rounded-md px-2 py-0.5 text-xs ${width === w ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
              >
                {WIDTH_NAMES[w]}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onToggle}
          className={icon}
          title={hidden ? '显示' : '隐藏'}
          aria-label={`${hidden ? '显示' : '隐藏'}${block.title}`}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hidden ? (
        <div className="rounded-xl bg-black/20 px-3 py-2 text-xs text-white/40">已隐藏，点眼睛可以显示回来</div>
      ) : (
        // 编辑时内容只看不点，拖动不会误操作；里面还有一层布局时要能点里面的区块
        <div className={block.nested ? 'min-h-0' : 'pointer-events-none select-none opacity-70'}>{block.node}</div>
      )}
    </div>
  )
}

/**
 * 按用户的布局显示区块。className 是原来的容器样式（例如 flex flex-col gap-6）；
 * 不传时区块直接放进外面的容器里（外面是 flex 布局、区块要用 flex-1 撑满时用这种）
 */
export function BlockLayout({
  page,
  className,
  gap = 'gap-6',
  widths = true,
  children
}: {
  /** 页面名（保存布局用） */
  page: string
  className?: string
  /** 左右两列之间、列里区块之间的间距 */
  gap?: string
  /** 能不能选整行 / 左 / 右（区块横着排、或者要撑满高度的布局不能） */
  widths?: boolean
  children: ReactNode
}): JSX.Element {
  const { pageLayouts } = useAppearance()
  const saved = pageLayouts[page] as PageLayout | undefined
  const isEditing = useLayoutEditing(page)
  /** 正在编辑的页面名（一个页面里有几块布局时，提示条只在最外面那块显示一次） */
  const editingKey = useSyncExternalStore(subscribe, () => editing)
  const [dragged, setDragging] = useState<string | null>(null)
  const blocks = blocksOf(children)
  const ordered = arrange(blocks, saved)
  const hidden = new Set(saved?.hidden ?? [])
  const widthOf = (b: Block): BlockWidth => (widths ? (saved?.width?.[b.id] ?? b.defaultWidth) : 'full')

  // Esc 退出编辑
  useEffect(() => {
    if (!isEditing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLayoutEditing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditing])

  const current = (): PageLayout => ({
    order: ordered.map((b) => b.id),
    hidden: [...hidden].filter((id) => blocks.some((b) => b.id === id)),
    width: Object.fromEntries(ordered.map((b) => [b.id, widthOf(b)]))
  })
  const save = (patch: Partial<PageLayout>): void => void saveLayout(page, { ...current(), ...patch })

  const move = (id: string, delta: -1 | 1): void => {
    const order = ordered.map((b) => b.id)
    const i = order.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    save({ order })
  }
  const dropOn = (target: string, draggedId: string): void => {
    const dragging = ordered.some((b) => b.id === draggedId) ? draggedId : dragged
    if (!dragging || dragging === target) return
    const order = ordered.map((b) => b.id).filter((id) => id !== dragging)
    const from = ordered.findIndex((b) => b.id === dragging)
    const to = ordered.findIndex((b) => b.id === target)
    // 往下拖放在目标后面，往上拖放在目标前面
    order.splice(order.indexOf(target) + (from < to ? 1 : 0), 0, dragging)
    setDragging(null)
    save({ order })
  }

  const visible = isEditing ? ordered : ordered.filter((b) => !hidden.has(b.id))
  const render = (b: Block): ReactNode =>
    isEditing ? (
      <EditFrame
        key={b.id}
        block={b}
        index={ordered.indexOf(b)}
        count={ordered.length}
        width={widthOf(b)}
        hidden={hidden.has(b.id)}
        onMove={(d) => move(b.id, d)}
        onWidth={(w) => save({ width: { ...current().width, [b.id]: w } })}
        onToggle={() => save({ hidden: hidden.has(b.id) ? [...hidden].filter((x) => x !== b.id) : [...hidden, b.id] })}
        onDragStart={() => setDragging(b.id)}
        onDropOn={(id) => dropOn(b.id, id)}
        widths={widths}
      />
    ) : (
      <Fragment key={b.id}>{b.node}</Fragment>
    )

  // 连续的左列 / 右列区块放进一个两列的网格：左的放左列、右的放右列，各自从上往下补空位
  // （grid-flow-dense），同一行的区块一样高；窗口窄时按顺序上下排
  const rows: ({ full: Block } | { left: Block[]; right: Block[]; all: Block[] })[] = []
  for (const b of visible) {
    const w = widthOf(b)
    if (w === 'full') {
      rows.push({ full: b })
      continue
    }
    let last = rows[rows.length - 1]
    if (!last || 'full' in last) {
      last = { left: [], right: [], all: [] }
      rows.push(last)
    }
    last[w].push(b)
    last.all.push(b)
  }

  const content = (
    <>
      {isEditing && editingKey === page && (
        <div
          data-testid="layout-edit-bar"
          className="fixed bottom-5 left-1/2 z-40 flex w-[min(52rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-emerald-400/30 popover-background px-4 py-2.5 text-xs text-white/80 shadow-2xl"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1">
            拖动区块或者用箭头排顺序；选「整行 / 左 / 右」改宽度（窗口窄时左右两列会上下排）；点眼睛隐藏不用的区块
          </span>
          <button
            onClick={() => void resetLayouts(page)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复这个页面的默认布局
          </button>
          <button
            onClick={() => setLayoutEditing(null)}
            className="flex items-center gap-1 rounded-lg bg-emerald-500/80 px-2.5 py-1 font-medium text-white hover:bg-emerald-500"
          >
            <Check className="h-3.5 w-3.5" />
            完成
          </button>
        </div>
      )}
      {rows.map((row) =>
        'full' in row ? (
          render(row.full)
        ) : (
          <div key={`side-${row.all[0].id}`} className={`grid min-w-0 lg:grid-flow-row-dense lg:grid-cols-2 ${gap}`}>
            {row.all.map((b) => (
              <div
                key={b.id}
                className={`flex min-w-0 flex-col [&>*:only-child]:flex-1 ${row.left.includes(b) ? 'lg:col-start-1' : 'lg:col-start-2'}`}
              >
                {render(b)}
              </div>
            ))}
          </div>
        )
      )}
    </>
  )

  return className ? (
    <div className={className} data-layout-page={page}>
      {content}
      {/* 编辑时最下面留出浮动工具条的位置 */}
      {isEditing && editingKey === page && <div className="h-16 shrink-0" aria-hidden />}
    </div>
  ) : (
    content
  )
}

/** 标题栏里的「编辑布局」按钮 */
export function LayoutEditButton({ page }: { page: string }): JSX.Element {
  const isEditing = useLayoutEditing(page)
  // 离开页面时退出编辑。区块进出编辑框时按钮会重新挂上，所以等一下再看还有没有
  useEffect(() => {
    mountedButtons.set(page, (mountedButtons.get(page) ?? 0) + 1)
    return () => {
      mountedButtons.set(page, (mountedButtons.get(page) ?? 1) - 1)
      setTimeout(() => {
        if ((mountedButtons.get(page) ?? 0) <= 0 && editing === page) setLayoutEditing(null)
      }, 0)
    }
  }, [page])
  return (
    <button
      onClick={() => setLayoutEditing(isEditing ? null : page)}
      aria-pressed={isEditing}
      title={isEditing ? '完成编辑' : '自己排这个页面的布局'}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-colors ${
        isEditing
          ? 'border-emerald-400/40 bg-emerald-500/20 text-white'
          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {isEditing ? <Check className="h-3.5 w-3.5" /> : <LayoutDashboard className="h-3.5 w-3.5" />}
      {isEditing ? '完成' : '编辑布局'}
    </button>
  )
}
