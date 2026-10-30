/**
 * 页面标题栏右侧按钮的统一样式（与「版本」「服务器」等页面标题栏的按钮一致）
 */

/** 普通按钮：图标 + 文字 */
export const HEADER_BUTTON =
  'flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20 disabled:opacity-50'

/** 主要操作：主题色渐变 */
export const HEADER_PRIMARY =
  'flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium shadow-lg shadow-emerald-500/20 transition-opacity hover:opacity-90 disabled:opacity-50'

/** 只有图标的按钮（打开文件夹、刷新等），和上面两种按钮同高 */
export const HEADER_ICON_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-50'
