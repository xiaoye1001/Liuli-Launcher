import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import MiniPlayer from './MiniPlayer'
import { DEFAULT_SUBTITLE, DEFAULT_TITLE, useAppearance } from '../utils/appearance'
import {
  Boxes,
  Download,
  House,
  Layers,
  LayoutGrid,
  Server,
  Settings,
  UserRound,
  Users,
  type LucideIcon
} from 'lucide-react'

export type PageKey = 'home' | 'account' | 'versions' | 'servers' | 'download' | 'multiplayer' | 'more' | 'settings'

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
  { key: 'more', label: '更多', icon: LayoutGrid },
  { key: 'settings', label: '设置', icon: Settings }
]

interface SidebarProps {
  current: PageKey
  onChange: (key: PageKey) => void
}

function Sidebar({ current, onChange }: SidebarProps): JSX.Element {
  const [portableDir, setPortableDir] = useState<string | null>(null)
  const { launcherTitle, launcherSubtitle, hiddenPages } = useAppearance()
  const title = launcherTitle || DEFAULT_TITLE
  const subtitle = launcherSubtitle || DEFAULT_SUBTITLE

  useEffect(() => {
    window.api.getSystemInfo().then((info) => setPortableDir(info.portableDir))
  }, [])

  // 导航项只有两三个字：侧边栏窄一些，右侧不留大片空白，主内容区也更宽
  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-white/10 bg-white/5 px-3 py-4 backdrop-blur-xl">
      <div className="mb-8 flex items-center gap-3 px-2 pt-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
          <Boxes className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight" title={title}>
            {title}
          </div>
          <div className="truncate text-xs text-white/50" title={subtitle}>
            {subtitle}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !hiddenPages.includes(item.key)).map((item) => {
          const active = item.key === current
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition-colors ${
                active ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/15 shadow-inner"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 h-5 w-5" />
              <span className="relative z-10 font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto" />
      <MiniPlayer />
      <div className="px-2 text-xs text-white/30" title={portableDir ? `数据保存在 ${portableDir}` : undefined}>
        v{__APP_VERSION__}
        {portableDir && ' · 免安装版'}
      </div>
    </aside>
  )
}

export default Sidebar
