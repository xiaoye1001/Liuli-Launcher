import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * 页面标题栏：所有页面统一的高度和排版（大标题 + 一行说明，右边放操作按钮）。
 * 高度固定，标题和下面内容的位置在每个页面都一样；页面容器用 gap-4 与内容隔开。
 * 子页面（模组、存档、版本设置等）在标题左边加返回按钮和图标，标题位置与主页面对齐
 */
function PageHeader({
  title,
  subtitle,
  titleHint,
  after,
  actions,
  icon,
  onBack,
  backTitle = '返回'
}: {
  title: ReactNode
  /** 标题下面的一行说明 */
  subtitle?: ReactNode
  /** 鼠标悬停在标题上时显示的完整文字（标题太长被截断时） */
  titleHint?: string
  /** 紧跟在标题后面的内容（例如设置页的分页按钮） */
  after?: ReactNode
  /** 右边的操作按钮 */
  actions?: ReactNode
  /** 标题左边的图标（子页面用） */
  icon?: ReactNode
  /** 点击返回按钮（子页面用） */
  onBack?: () => void
  /** 返回按钮的提示文字 */
  backTitle?: string
}): JSX.Element {
  return (
    <div className="flex h-[60px] shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {(onBack || icon) && (
          <div className="flex shrink-0 items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                title={backTitle}
                aria-label={backTitle}
                className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {icon && (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl">
                {icon}
              </div>
            )}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold leading-9 tracking-tight" title={titleHint}>
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 flex h-5 min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-xs text-white/50">
              {subtitle}
            </div>
          )}
        </div>
        {after}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  )
}

export default PageHeader
