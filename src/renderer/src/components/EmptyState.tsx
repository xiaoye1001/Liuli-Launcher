import type { ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

/**
 * 列表为空、搜索没有结果时的提示：在列表区域里上下左右居中（列表区域很矮时至少占 10rem）
 */
export function EmptyState({
  icon: Icon,
  children,
  action
}: {
  icon?: LucideIcon
  children: ReactNode
  /** 提示下面的按钮（例如「去下载」） */
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/45">
      {Icon && <Icon className="h-10 w-10 text-white/20" />}
      <div className="max-w-md leading-6">{children}</div>
      {action}
    </div>
  )
}

/** 正在读取列表：转圈在列表区域里居中 */
export function LoadingState(): JSX.Element {
  return (
    <div
      className="flex h-full min-h-[10rem] items-center justify-center text-white/50"
      role="status"
      aria-label="正在读取"
    >
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}
