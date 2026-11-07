import { useEffect, useRef, useState } from 'react'
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
  Puzzle,
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
import PluginsPanel from '../components/PluginsPanel'
import PluginHost from '../components/PluginHost'
import { hasDroppedPlugin, onDroppedPlugin } from '../utils/plugins'
import type { PluginInfo } from '../../../shared/types'
import { BlockLayout, LayoutBlock } from '../components/BlockLayout'

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
  | 'plugins'
  /** 插件自己的页面 */
  | `plugin:${string}`

/** 百宝箱的分类（按显示顺序） */
const GROUPS = [
  { key: 'play', title: '游戏工具', desc: '玩的时候查、算、生成', icon: Gamepad2 },
  { key: 'together', title: '开服与多开', desc: '和朋友一起玩', icon: Users },
  { key: 'maintain', title: '维护与排查', desc: '下载、Java、清理、找问题', icon: Wrench },
  { key: 'records', title: '我的记录', desc: '游玩时长和成就', icon: BarChart3 },
  { key: 'plugins', title: '插件', desc: '装上别人做的小工具（运行在沙箱里）', icon: Puzzle }
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
  },
  {
    key: 'plugins',
    group: 'plugins',
    title: '插件管理',
    desc: '安装、启用、卸载插件',
    icon: Puzzle,
    tint: 'text-violet-300'
  }
]

const isPluginKey = (key: string): key is `plugin:${string}` => key.startsWith('plugin:')

const LAST_TOOL_KEY = TOOLBOX_KEY
/** 每个分类上次打开的工具（切换分类时回到它） */
const GROUP_TOOLS_KEY = 'liuli-toolbox-group-tools'

/** 上次打开的工具（只是方便，读不到时用下载器） */
function lastTool(): ToolKey {
  try {
    const saved = localStorage.getItem(LAST_TOOL_KEY)
    // 插件页面先记下，插件列表读到后不存在再换成插件管理
    return saved && (TOOLS.some((t) => t.key === saved) || isPluginKey(saved)) ? (saved as ToolKey) : 'download'
  } catch {
    return 'download'
  }
}

function groupOf(key: ToolKey): GroupKey {
  if (isPluginKey(key)) return 'plugins'
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
      else if (g.key === 'plugins' && typeof key === 'string' && isPluginKey(key)) out[g.key] = key
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
  /** 启用的插件：每个是「插件」分类里的一张卡片 */
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  useEffect(() => {
    const load = (): void =>
      void window.api
        .listPlugins()
        .then((list) => setPlugins(list.filter((p) => p.enabled && !p.error)))
        .catch(() => setPlugins([]))
    load()
    return window.api.onPluginsChanged(load)
  }, [])
  const openPlugin = plugins && isPluginKey(current) ? plugins.find((p) => `plugin:${p.id}` === current) : undefined
  // 记住的插件已经卸载或停用：换成插件管理
  useEffect(() => {
    if (plugins && isPluginKey(current) && !openPlugin) setCurrent('plugins')
  }, [plugins, current, openPlugin])
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

  // 拖进窗口的插件：打开插件管理，在那里显示安装确认
  const selectRef = useRef(select)
  selectRef.current = select
  useEffect(() => {
    const open = (): void => {
      if (hasDroppedPlugin()) selectRef.current('plugins')
    }
    open()
    return onDroppedPlugin(open)
  }, [])

  // 快速搜索（Ctrl+K）跳到某个工具：同时切到它的分类
  useEffect(
    () =>
      onJump(
        'more',
        // 只切过去，不改各分类记住的工具（和以前一样）
        (key) => (TOOLS.some((t) => t.key === key) || isPluginKey(key)) && setCurrent(key as ToolKey)
      ),
    []
  )

  const pluginTools: Tool[] = (plugins ?? []).map((p) => ({
    key: `plugin:${p.id}`,
    group: 'plugins',
    title: p.name,
    desc: p.description || `插件 · v${p.version}`,
    icon: Puzzle,
    tint: 'text-violet-300'
  }))
  const tools = [...TOOLS, ...pluginTools].filter((t) => t.group === group)

  return (
    <div className="page-scroll flex h-full flex-col gap-4">
      <PageHeader
        title="更多"
        subtitle="百宝箱：按分类放好的小工具"
        layoutPage="more"
        actions={
          <div className="flex rounded-xl bg-black/20 p-1" role="tablist" aria-label="百宝箱分类">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                role="tab"
                data-tool-group={g.key}
                aria-selected={group === g.key}
                title={g.desc}
                onClick={() => openGroup(g.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors lg:px-4 ${
                  group === g.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <g.icon className="hidden h-4 w-4 lg:block" />
                {g.title}
              </button>
            ))}
          </div>
        }
      />

      <BlockLayout page="more" gap="gap-4">
        <LayoutBlock id="tools" title="工具卡片">
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
        </LayoutBlock>

        <LayoutBlock id="panel" title="打开的工具">
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
          {current === 'plugins' && <PluginsPanel onOpen={(id) => select(`plugin:${id}`)} />}
          {openPlugin && <PluginHost plugin={openPlugin} />}
        </LayoutBlock>
      </BlockLayout>
    </div>
  )
}

export default MorePage
