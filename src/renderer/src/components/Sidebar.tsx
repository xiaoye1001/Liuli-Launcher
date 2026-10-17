import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, Download, House, Layers, Settings, UserRound, type LucideIcon } from 'lucide-react'

export type PageKey = 'home' | 'account' | 'versions' | 'download' | 'settings'

interface NavItem {
  key: PageKey
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '主页', icon: House },
  { key: 'account', label: '账号', icon: UserRound },
  { key: 'versions', label: '版本', icon: Layers },
  { key: 'download', label: '下载', icon: Download },
  { key: 'settings', label: '设置', icon: Settings }
]

interface SidebarProps {
  current: PageKey
  onChange: (key: PageKey) => void
}

function Sidebar({ current, onChange }: SidebarProps): JSX.Element {
  const [portableDir, setPortableDir] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSystemInfo().then((info) => setPortableDir(info.portableDir))
  }, [])

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-8 flex items-center gap-3 px-2 pt-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
          <Boxes className="h-6 w-6 text-white" />
        </div>
        <div>
          <div className="text-base font-bold leading-tight">琉璃启动器</div>
          <div className="text-xs text-white/50">Liuli Launcher</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.key === current
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
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

      <div className="mt-auto px-2 text-xs text-white/30" title={portableDir ? `数据保存在 ${portableDir}` : undefined}>
        v{__APP_VERSION__}
        {portableDir && ' · 免安装版'}
      </div>
    </aside>
  )
}

export default Sidebar
