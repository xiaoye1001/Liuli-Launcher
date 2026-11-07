import { useEffect, useState } from 'react'
import { onJump, TOOLBOX_KEY } from '../utils/jump'
import {
  Anvil,
  CopyPlus,
  CircuitBoard,
  FileDiff,
  Paintbrush,
  BookOpen,
  BarChart3,
  Bug,
  Calculator,
  Gamepad2,
  Users,
  Wrench,
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
import EnchantCalculatorPanel from '../components/EnchantCalculatorPanel'
import MultiInstancePanel from '../components/MultiInstancePanel'
import RedstoneToolsPanel from '../components/RedstoneToolsPanel'
import VersionDiffPanel from '../components/VersionDiffPanel'
import MapArtPanel from '../components/MapArtPanel'
import RecipeLookupPanel from '../components/RecipeLookupPanel'
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
  | 'enchant'
  | 'multi'
  | 'redstone'
  | 'diff'
  | 'mapart'
  | 'recipes'

/** 百宝箱的分类（按显示顺序） */
const GROUPS = [
  { key: 'play', title: '游戏工具', desc: '玩的时候查、算、生成', icon: Gamepad2 },
  { key: 'together', title: '开服与多开', desc: '和朋友一起玩', icon: Users },
  { key: 'maintain', title: '维护与排查', desc: '下载、Java、清理、找问题', icon: Wrench },
  { key: 'records', title: '我的记录', desc: '游玩时长和成就', icon: BarChart3 }
] as const

type GroupKey = (typeof GROUPS)[number]['key']

interface Tool {
  key: ToolKey
  group: GroupKey
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
    group: 'maintain',
    title: '高速多线程下载器',
    desc: '直链分块加速下载',
    icon: Zap,
    tint: 'text-amber-300'
  },
  {
    key: 'clean',
    group: 'maintain',
    title: '清理游戏垃圾缓存',
    desc: '日志、崩溃报告、旧缓存',
    icon: Trash2,
    tint: 'text-rose-300'
  },
  {
    key: 'java',
    group: 'maintain',
    title: 'Java 环境深度检测',
    desc: '版本、位数、兼容性',
    icon: Coffee,
    tint: 'text-orange-300'
  },
  { key: 'speed', group: 'maintain', title: '下载源测速', desc: '官方源与镜像对比', icon: Gauge, tint: 'text-sky-300' },
  {
    key: 'report',
    group: 'records',
    title: '我的游玩报告',
    desc: '游玩时长、最常玩的版本',
    icon: BarChart3,
    tint: 'text-emerald-300'
  },
  {
    key: 'achievements',
    group: 'records',
    title: '启动器成就',
    desc: '玩游戏时自动解锁',
    icon: Trophy,
    tint: 'text-amber-300'
  },
  {
    key: 'crashes',
    group: 'maintain',
    title: '崩溃记录',
    desc: '每次崩溃的原因和次数',
    icon: Bug,
    tint: 'text-rose-300'
  },
  {
    key: 'seeds',
    group: 'play',
    title: '种子收藏夹',
    desc: '记下好玩的世界种子',
    icon: Sprout,
    tint: 'text-emerald-300'
  },
  {
    key: 'calc',
    group: 'play',
    title: 'Minecraft 小工具',
    desc: '下界坐标、区块、游戏时间',
    icon: Calculator,
    tint: 'text-sky-300'
  },
  {
    key: 'slime',
    group: 'play',
    title: '史莱姆区块',
    desc: '输入种子，看哪里刷史莱姆',
    icon: Grid2x2Check,
    tint: 'text-emerald-300'
  },
  {
    key: 'server',
    group: 'together',
    title: '一键开服',
    desc: '开个服务器和朋友一起玩',
    icon: Server,
    tint: 'text-rose-300'
  },
  {
    key: 'commands',
    group: 'play',
    title: '命令生成器',
    desc: '给物品、状态效果、召唤',
    icon: TerminalSquare,
    tint: 'text-emerald-300'
  },
  {
    key: 'enchant',
    group: 'play',
    title: '附魔计算器',
    desc: '铁砧上最省经验的顺序',
    icon: Anvil,
    tint: 'text-violet-300'
  },
  { key: 'multi', group: 'together', title: '多开', desc: '同时开几个游戏窗口', icon: CopyPlus, tint: 'text-sky-300' },
  {
    key: 'redstone',
    group: 'play',
    title: '红石计算器',
    desc: '漏斗、熔炉、比较器、刻',
    icon: CircuitBoard,
    tint: 'text-red-300'
  },
  {
    key: 'diff',
    group: 'maintain',
    title: '版本差异对比',
    desc: '两个版本的模组和配置',
    icon: FileDiff,
    tint: 'text-sky-300'
  },
  {
    key: 'mapart',
    group: 'play',
    title: '地图画生成器',
    desc: '图片变成方块清单和投影',
    icon: Paintbrush,
    tint: 'text-violet-300'
  },
  {
    key: 'recipes',
    group: 'play',
    title: '合成与交易查询',
    desc: '怎么做、能做什么、村民交易',
    icon: BookOpen,
    tint: 'text-amber-300'
  }
]

const LAST_TOOL_KEY = TOOLBOX_KEY
/** 每个分类上次打开的工具（切换分类时回到它） */
const GROUP_TOOLS_KEY = 'liuli-toolbox-group-tools'

/** 上次打开的工具（只是方便，读不到时用下载器） */
function lastTool(): ToolKey {
  try {
    const saved = localStorage.getItem(LAST_TOOL_KEY)
    return TOOLS.some((t) => t.key === saved) ? (saved as ToolKey) : 'download'
  } catch {
    return 'download'
  }
}

function groupOf(key: ToolKey): GroupKey {
  return TOOLS.find((t) => t.key === key)?.group ?? 'play'
}

/** 每个分类记住的工具（不存在或不属于这个分类时不用） */
function readGroupTools(): Partial<Record<GroupKey, ToolKey>> {
  const out: Partial<Record<GroupKey, ToolKey>> = {}
  try {
    const raw = JSON.parse(localStorage.getItem(GROUP_TOOLS_KEY) ?? '{}') as Record<string, unknown>
    for (const g of GROUPS) {
      const key = raw?.[g.key]
      const tool = TOOLS.find((t) => t.key === key && t.group === g.key)
      if (tool) out[g.key] = tool.key
    }
  } catch {
    // 读不到时每个分类打开第一个工具
  }
  return out
}

/** 更多：百宝箱，按分类分成几页 */
function MorePage(): JSX.Element {
  const [current, setCurrent] = useState<ToolKey>(lastTool)
  const [groupTools, setGroupTools] = useState(readGroupTools)
  const group = groupOf(current)
  const groupInfo = GROUPS.find((g) => g.key === group) ?? GROUPS[0]

  const select = (key: ToolKey): void => {
    setCurrent(key)
    const next = { ...groupTools, [groupOf(key)]: key }
    setGroupTools(next)
    try {
      localStorage.setItem(LAST_TOOL_KEY, key)
      localStorage.setItem(GROUP_TOOLS_KEY, JSON.stringify(next))
    } catch {
      // 浏览器存储不可用时只是不记住
    }
  }

  /** 切换分类：回到这个分类上次用的工具，没有时打开第一个 */
  const openGroup = (key: GroupKey): void => {
    if (key === group) return
    select(groupTools[key] ?? TOOLS.find((t) => t.group === key)!.key)
  }

  // 快速搜索（Ctrl+K）跳到某个工具：同时切到它的分类
  useEffect(() => onJump('more', (key) => TOOLS.some((t) => t.key === key) && setCurrent(key as ToolKey)), [])

  const tools = TOOLS.filter((t) => t.group === group)

  return (
    <div className="page-scroll flex h-full flex-col gap-4">
      <PageHeader
        title="更多"
        subtitle="百宝箱：按分类放好的小工具"
        after={
          <div className="flex rounded-xl bg-black/20 p-1" role="tablist" aria-label="百宝箱分类">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                role="tab"
                data-tool-group={g.key}
                aria-selected={group === g.key}
                title={g.desc}
                onClick={() => openGroup(g.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm transition-colors ${
                  group === g.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <g.icon className="h-4 w-4" />
                {g.title}
              </button>
            ))}
          </div>
        }
      />

      {/* 这个分类的工具 */}
      <div className="grid shrink-0 grid-cols-3 gap-3" role="tablist" aria-label={groupInfo.title}>
        {tools.map((tool) => {
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
      {current === 'enchant' && <EnchantCalculatorPanel />}
      {current === 'multi' && <MultiInstancePanel />}
      {current === 'redstone' && <RedstoneToolsPanel />}
      {current === 'diff' && <VersionDiffPanel />}
      {current === 'mapart' && <MapArtPanel />}
      {current === 'recipes' && <RecipeLookupPanel />}
    </div>
  )
}

export default MorePage
