import { useState } from 'react'
import { Coffee, Gauge, Trash2, Zap, type LucideIcon } from 'lucide-react'
import FastDownloadPanel from '../components/FastDownloadPanel'
import CleanerPanel from '../components/CleanerPanel'
import JavaCheckPanel from '../components/JavaCheckPanel'
import SpeedTestPanel from '../components/SpeedTestPanel'
import PageHeader from '../components/PageHeader'

type ToolKey = 'download' | 'clean' | 'java' | 'speed'

interface Tool {
  key: ToolKey
  title: string
  desc: string
  icon: LucideIcon
  /** 图标颜色 */
  tint: string
}

/** 百宝箱里的小工具 */
const TOOLS: Tool[] = [
  {
    key: 'download',
    title: '高速多线程下载器',
    desc: '直链分块加速下载',
    icon: Zap,
    tint: 'text-amber-300'
  },
  {
    key: 'clean',
    title: '清理游戏垃圾缓存',
    desc: '日志、崩溃报告、旧缓存',
    icon: Trash2,
    tint: 'text-rose-300'
  },
  {
    key: 'java',
    title: 'Java 环境深度检测',
    desc: '版本、位数、兼容性',
    icon: Coffee,
    tint: 'text-orange-300'
  },
  { key: 'speed', title: '下载源测速', desc: '官方源与镜像对比', icon: Gauge, tint: 'text-sky-300' }
]

const LAST_TOOL_KEY = 'liuli-toolbox-tool'

/** 上次打开的工具（只是方便，读不到时用下载器） */
function lastTool(): ToolKey {
  try {
    const saved = localStorage.getItem(LAST_TOOL_KEY)
    return TOOLS.some((t) => t.key === saved) ? (saved as ToolKey) : 'download'
  } catch {
    return 'download'
  }
}

/** 更多：百宝箱 */
function MorePage(): JSX.Element {
  const [current, setCurrent] = useState<ToolKey>(lastTool)

  const select = (key: ToolKey): void => {
    setCurrent(key)
    try {
      localStorage.setItem(LAST_TOOL_KEY, key)
    } catch {
      // 浏览器存储不可用时只是不记住
    }
  }

  return (
    <div className="page-scroll flex h-full flex-col gap-4">
      <PageHeader title="更多" subtitle="百宝箱：高速下载、清理缓存、Java 检测和下载源测速" />

      {/* 小工具入口 */}
      <div className="grid shrink-0 grid-cols-4 gap-3" role="tablist" aria-label="百宝箱工具">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          const active = tool.key === current
          return (
            <button
              key={tool.key}
              data-tool={tool.key}
              role="tab"
              aria-selected={active}
              onClick={() => select(tool.key)}
              className={`relative flex items-center gap-3 rounded-2xl border p-3 text-left backdrop-blur-xl transition-colors ${
                active
                  ? 'border-emerald-400/40 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20">
                <Icon className={`h-5 w-5 ${tool.tint}`} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{tool.title}</div>
                <div className="truncate text-xs text-white/50">{tool.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {current === 'download' && <FastDownloadPanel />}
      {current === 'clean' && <CleanerPanel />}
      {current === 'java' && <JavaCheckPanel />}
      {current === 'speed' && <SpeedTestPanel />}
    </div>
  )
}

export default MorePage
