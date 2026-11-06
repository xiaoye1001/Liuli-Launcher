import { useEffect, useState } from 'react'
import { onJump, TOOLBOX_KEY } from '../utils/jump'
import {
  BarChart3,
  Bug,
  Calculator,
  Coffee,
  Gauge,
  Grid2x2Check,
  Server,
  TerminalSquare,
  Sprout,
  Trash2,
  Trophy,
  Zap,
  type LucideIcon
} from 'lucide-react'
import FastDownloadPanel from '../components/FastDownloadPanel'
import CleanerPanel from '../components/CleanerPanel'
import JavaCheckPanel from '../components/JavaCheckPanel'
import SpeedTestPanel from '../components/SpeedTestPanel'
import PlayReportPanel from '../components/PlayReportPanel'
import AchievementsPanel from '../components/AchievementsPanel'
import CrashHistoryPanel from '../components/CrashHistoryPanel'
import SeedFavoritesPanel from '../components/SeedFavoritesPanel'
import MinecraftToolsPanel from '../components/MinecraftToolsPanel'
import SlimeChunksPanel from '../components/SlimeChunksPanel'
import LocalServerPanel from '../components/LocalServerPanel'
import CommandGeneratorPanel from '../components/CommandGeneratorPanel'
import PageHeader from '../components/PageHeader'

type ToolKey =
  | 'download'
  | 'clean'
  | 'java'
  | 'speed'
  | 'report'
  | 'achievements'
  | 'crashes'
  | 'seeds'
  | 'calc'
  | 'slime'
  | 'server'
  | 'commands'

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
  { key: 'speed', title: '下载源测速', desc: '官方源与镜像对比', icon: Gauge, tint: 'text-sky-300' },
  { key: 'report', title: '我的游玩报告', desc: '游玩时长、最常玩的版本', icon: BarChart3, tint: 'text-emerald-300' },
  { key: 'achievements', title: '启动器成就', desc: '玩游戏时自动解锁', icon: Trophy, tint: 'text-amber-300' },
  { key: 'crashes', title: '崩溃记录', desc: '每次崩溃的原因和次数', icon: Bug, tint: 'text-rose-300' },
  { key: 'seeds', title: '种子收藏夹', desc: '记下好玩的世界种子', icon: Sprout, tint: 'text-emerald-300' },
  { key: 'calc', title: 'Minecraft 小工具', desc: '下界坐标、区块、游戏时间', icon: Calculator, tint: 'text-sky-300' },
  { key: 'slime', title: '史莱姆区块', desc: '输入种子，看哪里刷史莱姆', icon: Grid2x2Check, tint: 'text-emerald-300' },
  { key: 'server', title: '一键开服', desc: '开个服务器和朋友一起玩', icon: Server, tint: 'text-rose-300' },
  {
    key: 'commands',
    title: '命令生成器',
    desc: '给物品、状态效果、召唤',
    icon: TerminalSquare,
    tint: 'text-emerald-300'
  }
]

const LAST_TOOL_KEY = TOOLBOX_KEY

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

  // 快速搜索（Ctrl+K）跳到某个工具
  useEffect(() => onJump('more', (key) => TOOLS.some((t) => t.key === key) && setCurrent(key as ToolKey)), [])

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
      <PageHeader
        title="更多"
        subtitle="百宝箱：高速下载、清理缓存、Java 检测、测速、游玩报告、成就、崩溃记录、种子、小工具、史莱姆区块、一键开服、命令生成器"
      />

      {/* 小工具入口 */}
      <div className="grid shrink-0 grid-cols-3 gap-3" role="tablist" aria-label="百宝箱工具">
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
      {current === 'report' && <PlayReportPanel />}
      {current === 'achievements' && <AchievementsPanel />}
      {current === 'crashes' && <CrashHistoryPanel />}
      {current === 'seeds' && <SeedFavoritesPanel />}
      {current === 'calc' && <MinecraftToolsPanel />}
      {current === 'slime' && <SlimeChunksPanel />}
      {current === 'server' && <LocalServerPanel />}
      {current === 'commands' && <CommandGeneratorPanel />}
    </div>
  )
}

export default MorePage
