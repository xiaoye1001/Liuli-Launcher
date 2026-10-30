import type { ReactNode } from 'react'

/**
 * 页面标题栏：所有页面统一的高度和排版（大标题 + 一行说明，右边放操作按钮）。
 * 高度固定，标题和下面内容的位置在每个页面都一样；页面容器用 gap-4 与内容隔开
 */
function PageHeader({
  title,
  subtitle,
  after,
  actions
}: {
  title: ReactNode
  /** 标题下面的一行说明 */
  subtitle?: ReactNode
  /** 紧跟在标题后面的内容（例如设置页的分页按钮） */
  after?: ReactNode
  /** 右边的操作按钮 */
  actions?: ReactNode
}): JSX.Element {
  return (
    <div className="flex h-[60px] shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold leading-9 tracking-tight">{title}</h1>
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
