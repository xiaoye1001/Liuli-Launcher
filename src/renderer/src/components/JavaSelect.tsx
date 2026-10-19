import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Loader2, Sparkles, Undo2 } from 'lucide-react'
import type { JavaInfo } from '../../../shared/types'

/**
 * Java 下拉选择框：第一项是「自动选择」（按游戏版本匹配本机的 Java，没有时自动下载），
 * 下面列出本机找到的 Java。版本设置页还可以多一项「跟随全局」。
 * 自己绘制下拉列表（系统自带的下拉框在深色界面里很难看），支持键盘上下选择、回车确认、Esc 关闭。
 */

/** 选项的值：'auto' 自动选择、'global' 跟随全局，其他是 Java 的路径 */
export type JavaChoice = 'auto' | 'global' | string

interface Option {
  value: JavaChoice
  title: string
  subtitle: string
  /** 左边的标记：Java 主版本号，或图标 */
  badge: JSX.Element
  /** 不满足版本要求时显示的提示 */
  warning?: string
}

interface JavaSelectProps {
  value: JavaChoice
  onChange: (value: JavaChoice) => void
  /** 本机找到的 Java；null 表示还在查找 */
  javas: JavaInfo[] | null
  /** 显示「跟随全局」选项，并说明全局当前是什么 */
  globalLabel?: string
  /** 这个版本需要的 Java 主版本（版本设置页使用），低于它的 Java 会标出来 */
  required?: number | null
  disabled?: boolean
}

function MajorBadge({ major, active }: { major: number; active?: boolean }): JSX.Element {
  return (
    <span
      className={`flex h-9 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-base font-bold ${
        active ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10'
      }`}
    >
      {major}
    </span>
  )
}

function IconBadge({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <span className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
      {children}
    </span>
  )
}

function JavaSelect({ value, onChange, javas, globalLabel, required, disabled }: JavaSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const options: Option[] = [
    ...(globalLabel !== undefined
      ? [
          {
            value: 'global',
            title: '跟随全局设置',
            subtitle: `当前全局：${globalLabel}`,
            badge: (
              <IconBadge>
                <Undo2 className="h-4 w-4" />
              </IconBadge>
            )
          }
        ]
      : []),
    {
      value: 'auto',
      title: '自动选择（推荐）',
      subtitle: '按游戏版本匹配本机的 Java，没有合适的会自动下载对应版本',
      badge: (
        <IconBadge>
          <Sparkles className="h-4 w-4" />
        </IconBadge>
      )
    },
    ...(javas ?? []).map((java) => ({
      value: java.path,
      title: `Java ${java.version}`,
      subtitle: java.path,
      badge: <MajorBadge major={java.majorVersion} />,
      warning: required && java.majorVersion < required ? `这个版本需要 Java ${required} 或更高` : undefined
    }))
  ]

  // 当前值不在列表里（例如之前选的 Java 被删除了）：单独显示一项，提示已找不到
  const selected =
    options.find((o) => o.value === value) ??
    ({
      value,
      title: '找不到之前选择的 Java',
      subtitle: value,
      badge: <MajorBadge major={0} />,
      warning: '请重新选择，或改为自动选择'
    } satisfies Option)

  // 点击外面时关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openList = (): void => {
    if (disabled) return
    setHighlight(
      Math.max(
        0,
        options.findIndex((o) => o.value === value)
      )
    )
    setOpen(true)
  }

  const choose = (option: Option): void => {
    setOpen(false)
    if (option.value !== value) onChange(option.value)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const option = options[highlight]
      if (option) choose(option)
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
          open ? 'border-emerald-400/60 bg-black/30' : 'border-white/10 bg-black/20 hover:bg-black/30'
        }`}
      >
        {selected.badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{selected.title}</span>
          <span
            className={`block truncate text-xs ${selected.warning ? 'text-amber-300' : 'text-white/50'} ${
              selected.value.includes('/') || selected.value.includes('\\') ? 'font-mono' : ''
            }`}
            title={selected.warning ?? selected.subtitle}
          >
            {selected.warning ?? selected.subtitle}
          </span>
        </span>
        {javas === null ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/50" />
        ) : (
          <ChevronDown className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-white/10 p-1.5 shadow-2xl"
            style={{ backgroundColor: 'rgb(var(--c-popover))' }}
          >
            {options.map((option, i) => {
              const active = option.value === value
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(option)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${
                    i === highlight ? 'bg-white/10' : ''
                  }`}
                >
                  {option.badge}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{option.title}</span>
                    <span
                      className={`block truncate text-xs ${option.warning ? 'text-amber-300' : 'text-white/50'} ${
                        option.value.includes('/') || option.value.includes('\\') ? 'font-mono' : ''
                      }`}
                      title={option.subtitle}
                    >
                      {option.warning ?? option.subtitle}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                </li>
              )
            })}
            {javas !== null && javas.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-white/50">
                本机没有找到 Java，选择「自动选择」后启动时会自动下载
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export default JavaSelect
