import { Coffee, Gauge, Trash2, Wrench, Zap, type LucideIcon } from 'lucide-react'
import FastDownloadPanel from '../components/FastDownloadPanel'

interface Tool {
  key: string
  title: string
  desc: string
  icon: LucideIcon
  /** 图标颜色 */
  tint: string
  ready: boolean
}

/** 百宝箱里的小工具：目前只有高速下载器可用，其余为预留入口 */
const TOOLS: Tool[] = [
  {
    key: 'download',
    title: '高速多线程下载器',
    desc: '直链分块加速下载',
    icon: Zap,
    tint: 'text-amber-300',
    ready: true
  },
  {
    key: 'clean',
    title: '清理游戏垃圾缓存',
    desc: '日志、崩溃报告、旧缓存',
    icon: Trash2,
    tint: 'text-rose-300',
    ready: false
  },
  {
    key: 'java',
    title: 'Java 环境深度检测',
    desc: '版本、位数、兼容性',
    icon: Coffee,
    tint: 'text-orange-300',
    ready: false
  },
  { key: 'speed', title: '下载源测速', desc: '官方源与镜像对比', icon: Gauge, tint: 'text-sky-300', ready: false }
]

/** 更多：百宝箱 */
function MorePage(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">更多</h1>
        <span className="flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-1.5 text-sm text-white/70">
          <Wrench className="h-4 w-4 text-emerald-300" />
          百宝箱
        </span>
      </div>

      {/* 小工具入口 */}
      <div className="grid shrink-0 grid-cols-4 gap-3" aria-label="百宝箱工具">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <div
              key={tool.key}
              data-tool={tool.key}
              aria-disabled={!tool.ready}
              title={tool.ready ? undefined : '即将推出'}
              className={`relative flex items-center gap-3 rounded-2xl border p-3 backdrop-blur-xl transition-colors ${
                tool.ready
                  ? 'border-emerald-400/40 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                  : 'cursor-not-allowed border-white/10 bg-white/5 opacity-70'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20">
                <Icon className={`h-5 w-5 ${tool.tint}`} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{tool.title}</div>
                <div className="truncate text-xs text-white/50">{tool.ready ? tool.desc : '即将推出'}</div>
              </div>
            </div>
          )
        })}
      </div>

      <FastDownloadPanel />
    </div>
  )
}

export default MorePage
