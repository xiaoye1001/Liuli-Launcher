import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bug,
  BarChart3,
  Coffee,
  CornerDownLeft,
  Gauge,
  Layers,
  Palette,
  Play,
  Rocket,
  Search,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Trophy,
  Zap,
  type LucideIcon
} from 'lucide-react'
import { NAV_ITEMS, type PageKey } from './Sidebar'
import { IS_MAC, OPEN_PALETTE_EVENT, requestJump } from '../utils/jump'
import type { InstalledVersion } from '../../../shared/types'

interface Command {
  id: string
  title: string
  /** 右侧的分组说明 */
  group: string
  icon: LucideIcon
  /** 额外的搜索关键字 */
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  navigate: (page: PageKey) => void
  openVersionSettings: (versionId: string) => void
}

/**
 * 快速搜索（Ctrl+K / ⌘K）：输入关键字跳到页面、设置分类、百宝箱工具、版本，或者打开游戏日志。
 * ↑↓ 选择，回车执行，Esc 关闭
 */
function CommandPalette({ navigate, openVersionSettings }: CommandPaletteProps): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // macOS 上用 ⌘K（Ctrl+K 是系统的「删除到行尾」），其他系统用 Ctrl+K
      const modifier = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (modifier && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    // 侧边栏底部的「搜索」也可以打开
    const onOpen = (): void => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    void window.api
      .getInstalledVersions()
      .then(setVersions)
      .catch(() => setVersions([]))
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const settings =
      (key: string): (() => void) =>
      () => {
        requestJump({ target: 'settings', key })
        navigate('settings')
      }
    const tool =
      (key: string): (() => void) =>
      () => {
        requestJump({ target: 'more', key })
        navigate('more')
      }
    return [
      ...NAV_ITEMS.map((item) => ({
        id: `page:${item.key}`,
        title: item.label,
        group: '页面',
        icon: item.icon,
        run: () => navigate(item.key)
      })),
      {
        id: 'settings:personal',
        title: '个性化设置',
        group: '设置',
        icon: Palette,
        keywords: '主题 壁纸 背景 颜色 字体 缩放 音乐 动画 标语 侧边栏',
        run: settings('personal')
      },
      {
        id: 'settings:launch',
        title: '启动设置',
        group: '设置',
        icon: Rocket,
        keywords: '游戏目录 java 内存 版本隔离 托盘 提醒 备份 中文 语言 检查文件',
        run: settings('launch')
      },
      {
        id: 'settings:other',
        title: '其它设置',
        group: '设置',
        icon: SlidersHorizontal,
        keywords: '下载源 镜像 代理 网络 更新 关于',
        run: settings('other')
      },
      { id: 'tool:download', title: '高速多线程下载器', group: '百宝箱', icon: Zap, run: tool('download') },
      {
        id: 'tool:clean',
        title: '清理游戏垃圾缓存',
        group: '百宝箱',
        icon: Trash2,
        keywords: '空间 日志 缓存',
        run: tool('clean')
      },
      { id: 'tool:java', title: 'Java 环境深度检测', group: '百宝箱', icon: Coffee, run: tool('java') },
      { id: 'tool:speed', title: '下载源测速', group: '百宝箱', icon: Gauge, run: tool('speed') },
      {
        id: 'tool:report',
        title: '我的游玩报告',
        group: '百宝箱',
        icon: BarChart3,
        keywords: '时长 统计',
        run: tool('report')
      },
      { id: 'tool:achievements', title: '启动器成就', group: '百宝箱', icon: Trophy, run: tool('achievements') },
      {
        id: 'tool:crashes',
        title: '崩溃记录',
        group: '百宝箱',
        icon: Bug,
        keywords: '崩溃 报错 启动失败 历史',
        run: tool('crashes')
      },
      {
        id: 'action:log',
        title: '打开游戏日志',
        group: '操作',
        icon: Terminal,
        keywords: 'log 日志窗口',
        run: () => void window.api.openLogWindow()
      },
      ...versions.flatMap((v) => [
        {
          id: `version:${v.id}`,
          title: `选择版本 ${v.id}`,
          group: '版本',
          icon: Play,
          keywords: `${v.minecraftVersion} ${v.loader ?? ''}`,
          run: () => {
            void window.api.updateSettings({ selectedVersion: v.id }).then(() => navigate('home'))
          }
        },
        {
          id: `version-settings:${v.id}`,
          title: `${v.id} 的版本设置`,
          group: '版本',
          icon: Layers,
          keywords: `${v.minecraftVersion} 内存 java 参数`,
          run: () => openVersionSettings(v.id)
        }
      ])
    ]
  }, [navigate, openVersionSettings, versions])

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return commands.filter((c) => c.group !== '版本').slice(0, 30)
    return commands
      .filter((c) => {
        const text = `${c.title} ${c.group} ${c.keywords ?? ''}`.toLowerCase()
        return words.every((w) => text.includes(w))
      })
      .slice(0, 30)
  }, [commands, query])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const execute = (command: Command | undefined): void => {
    if (!command) return
    setOpen(false)
    command.run()
  }

  return (
    <div
      className="pt-titlebar fixed inset-0 z-[65] flex justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="快速搜索"
        className="popover-background mt-20 flex h-fit max-h-[70vh] w-[560px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-white/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // 输入法正在输入（拼音还没确认）时的回车、方向键交给输入法
              if (e.nativeEvent.isComposing) return
              // 快速搜索处理的按键不再传给后面的页面（例如截图预览的 Esc、左右键）
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.stopPropagation()
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(results[index])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="搜索页面、设置、工具、版本…"
            aria-label="快速搜索"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
          />
          <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-white/40">Esc</kbd>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-white/40">没有找到</div>}
          {results.map((c, i) => {
            const Icon = c.icon
            const active = i === index
            return (
              <button
                key={c.id}
                data-index={i}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setIndex(i)}
                onClick={() => execute(c)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  active ? 'bg-white/10' : ''
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-white/60" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-xs text-white/40">{c.group}</span>
                {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-white/40" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
