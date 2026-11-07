import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import MiniPlayer from './MiniPlayer'
import { OPEN_PALETTE_EVENT, PALETTE_SHORTCUT } from '../utils/jump'
import logo from '../assets/logo.png'
import { DEFAULT_SUBTITLE, DEFAULT_TITLE, useAppearance } from '../utils/appearance'
import {
  Download,
  House,
  Layers,
  LayoutGrid,
  Server,
  Settings,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon
} from 'lucide-react'

export type PageKey =
  | 'home'
  | 'account'
  | 'versions'
  | 'servers'
  | 'download'
  | 'multiplayer'
  | 'ai'
  | 'more'
  | 'settings'

interface NavItem {
  key: PageKey
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '主页', icon: House },
  { key: 'account', label: '账号', icon: UserRound },
  { key: 'versions', label: '版本', icon: Layers },
  { key: 'servers', label: '服务器', icon: Server },
  { key: 'download', label: '下载', icon: Download },
  { key: 'multiplayer', label: '联机', icon: Users },
  { key: 'ai', label: 'AI 助手', icon: Sparkles },
  { key: 'more', label: '更多', icon: LayoutGrid },
  { key: 'settings', label: '设置', icon: Settings }
]

interface SidebarProps {
  current: PageKey
  onChange: (key: PageKey) => void
}

/** 按用户排的顺序、去掉隐藏的页面 */
function useNavItems(): NavItem[] {
  const { hiddenPages, navOrder } = useAppearance()
  const ordered = navOrder
    .map((key) => NAV_ITEMS.find((item) => item.key === key))
    .filter((item): item is NavItem => !!item)
  // 设置里没记录的页面（以后新加的）放在最后
  for (const item of NAV_ITEMS) if (!ordered.includes(item)) ordered.push(item)
  return ordered.filter((item) => !hiddenPages.includes(item.key))
}

/** 版本号和快速搜索入口 */
function VersionLine({ portableDir, className }: { portableDir: string | null; className: string }): JSX.Element {
  return (
    <div className={className} title={portableDir ? `数据保存在 ${portableDir}` : undefined}>
      v{__APP_VERSION__}
      {portableDir && ' · 免安装版'}
      {' · '}
      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        title="快速搜索页面、设置、工具和版本"
        className="hover:text-white/70"
      >
        {PALETTE_SHORTCUT} 搜索
      </button>
    </div>
  )
}

function Sidebar({ current, onChange }: SidebarProps): JSX.Element {
  const [portableDir, setPortableDir] = useState<string | null>(null)
  const { launcherTitle, launcherSubtitle, navPosition } = useAppearance()
  const items = useNavItems()
  const title = launcherTitle || DEFAULT_TITLE
  const subtitle = launcherSubtitle || DEFAULT_SUBTITLE

  useEffect(() => {
    window.api.getSystemInfo().then((info) => setPortableDir(info.portableDir))
  }, [])

  const brand = (
    <>
      {/* 启动器图标（看板娘头像），与安装包、任务栏的图标相同 */}
      <img src={logo} alt="" draggable={false} className="h-10 w-10 shrink-0 select-none drop-shadow-md" />
      <div className="min-w-0">
        <div className="truncate text-base font-bold leading-tight" title={title}>
          {title}
        </div>
        <div className="truncate text-xs text-white/50" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </>
  )

  // 导航栏在顶部：一排图标（下面一行小字），右边是音乐和版本号。
  // 上面留出窗口标题栏的拖动区域（32px），下面和页面内容之间用分隔线
  if (navPosition === 'top') {
    return (
      <header
        data-nav-position="top"
        className="relative z-20 flex shrink-0 items-center gap-4 border-b border-white/10 bg-white/5 px-8 pb-2 pt-9 backdrop-blur-xl"
      >
        <div className="flex w-44 min-w-0 shrink-0 items-center gap-3">{brand}</div>
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="页面">
          {items.map((item) => {
            const active = item.key === current
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={`relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors ${
                  active ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-xl border border-white/10 bg-white/15 shadow-inner"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  >
                    {/* 选中项下方的主题色横条 */}
                    <span className="absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-emerald-400" />
                  </motion.div>
                )}
                <Icon className={`relative z-10 h-5 w-5 ${active ? 'text-emerald-300' : ''}`} />
                <span className="relative z-10 truncate text-[11px] font-medium leading-none">{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <MiniPlayer compact />
          <VersionLine portableDir={portableDir} className="hidden text-xs text-white/30 xl:block" />
        </div>
      </header>
    )
  }

  const right = navPosition === 'right'

  // 导航项只有两三个字：侧边栏窄一些，右侧不留大片空白，主内容区也更宽。
  // 与页面对齐：名称这一行和页面标题栏同高同位置（上边距 32px、高 60px），导航从页面内容的上边缘开始，
  // 底部和页面内容的下边缘对齐。放在右边时分隔线和选中竖条在靠近内容的那一边
  return (
    <aside
      data-nav-position={navPosition}
      className={`flex w-44 shrink-0 flex-col border-white/10 bg-white/5 px-3 pb-8 pt-8 backdrop-blur-xl ${right ? 'border-l' : 'border-r'}`}
    >
      <div className="flex h-[60px] shrink-0 items-center gap-3 px-2">{brand}</div>

      {/* 窗口很矮时导航项变紧凑，仍放不下时可以滚动，不会和底部的音乐播放器重叠 */}
      <nav className="no-scrollbar mt-4 flex min-h-0 flex-col gap-1 overflow-y-auto [@media(max-height:680px)]:gap-0.5">
        {items.map((item) => {
          const active = item.key === current
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors [@media(max-height:680px)]:py-2 ${
                active ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/15 shadow-inner"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                >
                  {/* 选中项靠近内容一侧的主题色竖条 */}
                  <span
                    className={`absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-400 ${right ? 'right-0' : 'left-0'}`}
                  />
                </motion.div>
              )}
              <Icon className={`relative z-10 h-5 w-5 ${active ? 'text-emerald-300' : ''}`} />
              <span className="relative z-10 font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto pt-4" />
      <MiniPlayer />
      {/* 版本号：窗口很矮时不显示，给导航留出位置 */}
      <VersionLine portableDir={portableDir} className="px-2 text-xs text-white/30 [@media(max-height:680px)]:hidden" />
    </aside>
  )
}

export default Sidebar
