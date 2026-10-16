import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, Check, Copy, Search, Terminal, Trash2 } from 'lucide-react'
import type { GameState, GameStatus } from '../../shared/types'

const MAX_LINES = 5000

const STATE_BADGES: Record<GameState, { label: string; className: string }> = {
  idle: { label: '未运行', className: 'bg-white/10 text-white/60' },
  launching: { label: '启动中', className: 'bg-sky-500/20 text-sky-300' },
  running: { label: '运行中', className: 'bg-emerald-500/20 text-emerald-300' },
  exited: { label: '已退出', className: 'bg-white/10 text-white/60' },
  crashed: { label: '已崩溃', className: 'bg-red-500/20 text-red-300' }
}

/** 根据日志内容决定颜色 */
function lineClass(line: string): string {
  if (line.startsWith('[启动器]')) return 'text-emerald-300'
  if (/\b(ERROR|FATAL|SEVERE)\b|Exception|^\s+at /.test(line)) return 'text-red-300'
  if (/\bWARN(ING)?\b/.test(line)) return 'text-amber-300'
  if (/\bDEBUG\b/.test(line)) return 'text-white/40'
  return 'text-white/80'
}

function LogWindow(): JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<GameStatus>({ state: 'idle', versionId: '' })
  const [keyword, setKeyword] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = '游戏日志 - MC Launcher'
    window.api.getGameLogs().then(setLines)
    window.api.getGameStatus().then(setStatus)
    const offLog = window.api.onGameLog((event) => {
      setLines((prev) => {
        const next = event.reset ? event.lines : [...prev, ...event.lines]
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
      })
      if (event.reset) setAutoScroll(true)
    })
    const offStatus = window.api.onGameStatus(setStatus)
    return () => {
      offLog()
      offStatus()
    }
  }, [])

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return kw ? lines.filter((line) => line.toLowerCase().includes(kw)) : lines
  }, [lines, keyword])

  // 新日志到达时自动滚动到底部
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [visible, autoScroll])

  // 用户向上滚动时暂停自动滚动，滚回底部时恢复
  const onScroll = (): void => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom !== autoScroll) setAutoScroll(atBottom)
  }

  const scrollToBottom = (): void => {
    setAutoScroll(true)
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }

  const copyAll = async (): Promise<void> => {
    await navigator.clipboard.writeText(visible.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const badge = STATE_BADGES[status.state]

  return (
    <div className="flex h-full flex-col log-background text-white">
      <header className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
        <Terminal className="h-5 w-5 text-emerald-300" />
        <div className="font-semibold">游戏日志</div>
        {status.versionId && <span className="font-mono text-sm text-white/60">{status.versionId}</span>}
        <span className={`rounded-md px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
        <span className="text-xs text-white/40">{lines.length} 行</span>

        <div className="ml-auto flex w-64 items-center gap-2 rounded-lg bg-black/30 px-3 py-1.5">
          <Search className="h-4 w-4 text-white/40" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="筛选日志..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
          />
        </div>
        <button
          onClick={copyAll}
          title="复制当前显示的日志"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
        <button
          onClick={() => setLines([])}
          title="清空窗口中的日志"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-red-500/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清屏
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="h-full select-text overflow-y-auto px-4 py-3 font-mono text-xs leading-5"
        >
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-white/30">
              {lines.length === 0 ? '暂无日志，启动游戏后这里会实时显示输出' : '没有匹配的日志'}
            </div>
          ) : (
            visible.map((line, index) => (
              <div key={index} className={`whitespace-pre-wrap break-all ${lineClass(line)}`}>
                {line}
              </div>
            ))
          )}
        </div>

        <AnimatePresence>
          {!autoScroll && (
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={scrollToBottom}
              className="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-medium shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
            >
              <ArrowDownToLine className="h-4 w-4" />
              回到底部
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default LogWindow
