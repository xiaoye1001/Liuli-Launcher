import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  CircleX,
  Cpu,
  Gamepad2,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  PackageCheck,
  Rocket,
  ShieldCheck,
  Terminal,
  X,
  type LucideIcon
} from 'lucide-react'
import { useAppearance } from '../utils/appearance'
import type { GameStatus } from '../../../shared/types'

/**
 * 游戏启动动画：点「启动游戏」后覆盖整个窗口，从检查账号到游戏窗口出现，分 5 个阶段显示进度。
 *
 * 进度来源（双保险）：
 * 1. 真实进度：主进程推送的游戏状态（启动中 / 进程已创建 / 运行中 / 失败）和启动日志里启动器自己写的
 *    提示（Java、账号、检查文件、内存、进程 PID……），识别到哪一步就点亮到哪一步；
 *    另外每 2 秒主动查询一次状态，推送丢了也能跟上
 * 2. 平滑推进：一段时间没有新的真实进度时，自动往前推进到「构建启动指令」为止，动画不会停在原地；
 *    之后的「进程已创建」「窗口已出现」只认真实状态。启动时间太长时自动收起成底部的小状态条，不挡住界面
 *
 * 外部调用：openGameLaunchOverlay(版本名) / closeGameLaunchOverlay()，或 useGameLaunchOverlay()。
 * 从其他地方（服务器页、桌面快捷方式）启动时，收到「启动中」状态也会自动打开。
 * 颜色全部来自主题色 CSS 变量（--accent-*），切换主题色后自动跟随。
 */

// ---------- 外部控制 ----------

type OverlayCommand = { type: 'open'; versionId: string } | { type: 'close' }
const commandListeners = new Set<(command: OverlayCommand) => void>()

/** 打开启动动画（点击「启动游戏」时立即调用，不用等主进程） */
export function openGameLaunchOverlay(versionId: string): void {
  for (const listener of commandListeners) listener({ type: 'open', versionId })
}

/** 关闭启动动画（例如启动请求被拒绝时） */
export function closeGameLaunchOverlay(): void {
  for (const listener of commandListeners) listener({ type: 'close' })
}

/** 在组件里使用的控制方法 */
export function useGameLaunchOverlay(): { open: (versionId: string) => void; close: () => void } {
  return useMemo(() => ({ open: openGameLaunchOverlay, close: closeGameLaunchOverlay }), [])
}

// ---------- 阶段与文案 ----------

interface StageInfo {
  title: string
  icon: LucideIcon
  /** 进行中时默认显示的说明 */
  hint: string
}

const STAGES: StageInfo[] = [
  { title: '验证账号与通行证', icon: ShieldCheck, hint: '校验正版令牌 / 离线档案…' },
  { title: '扫描并匹配 Java 虚拟机', icon: Cpu, hint: '寻找合适的 Java，计算内存分配…' },
  { title: '校验游戏核心与依赖库', icon: PackageCheck, hint: '检查 .jar、资源文件与模组完整性…' },
  { title: '构建启动指令并拉起进程', icon: Rocket, hint: '正在唤醒 JVM 子进程…' },
  { title: '游戏窗口已就绪，祝你游戏愉快！', icon: Gamepad2, hint: '等待游戏窗口出现…' }
]

const TIPS = [
  '苦力怕原本是猪的模型做错了——高和宽写反了，于是成了绿色的「苦力怕」。',
  '在下界睡觉会爆炸！想在下界重生，请使用重生锚。',
  '按 F3 + H 可以显示物品的详细信息和耐久度。',
  '末影人怕水：下雨天或站在水边时，它们会到处传送。',
  '钻石最常出现在 Y=-58 附近（1.18 及以上版本）。',
  '戴上南瓜头再看末影人，它就不会被你激怒。',
  '用剪刀剪树叶可以直接得到树叶方块，挖蜘蛛网也更快。',
  '按 F3 + B 可以显示生物和实体的碰撞箱。',
  '骷髅射杀苦力怕时，苦力怕会掉落音乐唱片。',
  '在潜行时放置方块不会触发箱子、熔炉等方块的界面。',
  '铁傀儡会送给村民孩子虞美人，那是它表达友好的方式。',
  '在地图上用旗帜可以做标记：拿着地图右键旗帜即可。',
  '猫会吓跑苦力怕和幻翼——养只猫保护你的基地吧。',
  '用告示牌可以挡住水和岩浆的流动，做隧道时非常好用。',
  '游戏里一天是现实中的 20 分钟，其中白天约 10 分钟。'
]

/** 启动时间超过这么久还没进入游戏，自动收起成小状态条（毫秒） */
const AUTO_MINIMIZE_AFTER = 120_000
/** 游戏窗口出现后，停留这么久再消失（毫秒） */
const DONE_HOLD = 2200
/** 平滑推进最多推进到第几步（之后只认真实进度） */
const SIM_CAP = 3
/** 多久没有真实进度时，平滑推进往前走一步（毫秒） */
const SIM_STEP = 1300

type Phase = 'launching' | 'done' | 'failed' | 'cancelled'

/** 主题色（CSS 变量里是「r g b」三个数字） */
function accent(level: 200 | 300 | 400 | 500 | 600, alpha = 1): string {
  return `rgb(var(--accent-${level}) / ${alpha})`
}

/** 从启动日志里认出的进度 */
interface LogMilestone {
  /** 至少已经完成了几个阶段 */
  completed?: number
  /** 某个阶段的说明文字 */
  detail?: { stage: number; text: string }
  memory?: number
  failed?: string
  cancelled?: boolean
  done?: boolean
}

/** 识别启动器自己写的日志（[启动器] 开头）；其他日志不影响进度 */
export function parseLaunchLog(raw: string): LogMilestone | null {
  if (!raw.startsWith('[启动器] ')) return null
  const line = raw.slice('[启动器] '.length)
  let m: RegExpExecArray | null
  if ((m = /^(微软账号|离线账号|外置账号[^ ]*) (\S+)/.exec(line))) {
    return { completed: 1, detail: { stage: 0, text: `${m[1]}：${m[2]}` } }
  }
  if (/^本机没有合适的 Java/.test(line)) return { detail: { stage: 1, text: '本机没有合适的 Java，正在自动下载…' } }
  if ((m = /^Java (\S+)：/.exec(line))) return { completed: 2, detail: { stage: 1, text: `已匹配 Java ${m[1]}` } }
  if (/^正在检查游戏文件/.test(line)) return { completed: 2, detail: { stage: 2, text: '正在检查游戏文件…' } }
  if ((m = /^发现 (\d+) 个缺失或损坏的文件/.exec(line))) {
    return { completed: 2, detail: { stage: 2, text: `正在补全 ${m[1]} 个缺失的文件…` } }
  }
  if (/^(游戏文件完整|游戏文件已补全)/.test(line)) return { completed: 3, detail: { stage: 2, text: '游戏文件完整' } }
  if (/^检查游戏文件时出错/.test(line)) return { completed: 3, detail: { stage: 2, text: '已跳过文件检查' } }
  if ((m = /(?:自动分配内存|最大内存) (\d+) MB/.exec(line))) return { completed: 3, memory: Number(m[1]) }
  if (/^正在执行启动前命令/.test(line)) return { completed: 3, detail: { stage: 3, text: '正在执行启动前命令…' } }
  if ((m = /^游戏进程已创建（PID (\d+)）/.exec(line))) {
    return { completed: 4, detail: { stage: 3, text: `JVM 进程已创建（PID ${m[1]}）` } }
  }
  if (/^游戏窗口已出现/.test(line)) return { done: true }
  if (/^已取消启动/.test(line)) return { cancelled: true }
  if ((m = /^启动失败：(.*)$/.exec(line))) return { failed: m[1] }
  return null
}

// ---------- 小部件 ----------

/** 汇聚的星尘：从四周飞向中心并不断加速（画在 canvas 上，颜色跟随主题色） */
function WarpField(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const readColor = (): string =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-300').trim() || '110 231 183'
    let color = readColor()
    let width = 0
    let height = 0
    let maxRadius = 0
    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      maxRadius = Math.hypot(width, height) / 2
    }
    resize()
    interface Star {
      angle: number
      dist: number
      speed: number
      size: number
    }
    const spawn = (anywhere: boolean): Star => ({
      angle: Math.random() * Math.PI * 2,
      dist: anywhere ? maxRadius * (0.2 + Math.random() * 0.8) : maxRadius * (0.9 + Math.random() * 0.2),
      speed: 40 + Math.random() * 80,
      size: 0.6 + Math.random() * 1.6
    })
    const stars: Star[] = Array.from({ length: 150 }, () => spawn(true))
    let last = performance.now()
    let frame = 0
    let colorTimer = 0
    const draw = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      colorTimer += dt
      if (colorTimer > 1) {
        // 每秒读一次主题色，切换主题后跟着变
        colorTimer = 0
        color = readColor()
      }
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        // 越靠近中心飞得越快，像被吸进传送门
        s.speed *= 1 + dt * 1.6
        s.dist -= s.speed * dt
        if (s.dist < 24) {
          stars[i] = spawn(false)
          continue
        }
        const tail = Math.min(60, s.speed * 0.12)
        const cos = Math.cos(s.angle)
        const sin = Math.sin(s.angle)
        const alpha = Math.min(1, (1 - s.dist / maxRadius) * 1.4 + 0.15)
        ctx.strokeStyle = `rgb(${color} / ${alpha.toFixed(3)})`
        ctx.lineWidth = s.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(cx + cos * s.dist, cy + sin * s.dist)
        ctx.lineTo(cx + cos * (s.dist + tail), cy + sin * (s.dist + tail))
        ctx.stroke()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/** 内存数值：还不知道时数字快速乱跳，知道后从 0 快速滚动到实际值 */
function RollingMemory({ value }: { value: number | null }): JSX.Element {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let frame = 0
    let timer = 0
    if (value === null) {
      timer = window.setInterval(() => setShown(1024 + Math.floor(Math.random() * 7168)), 70)
      return () => window.clearInterval(timer)
    }
    const start = performance.now()
    const from = 0
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 900)
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return (
    <span className={`font-mono tabular-nums ${value === null ? 'text-white/40' : ''}`}>
      {shown} MB{value === null ? '' : ` ≈ ${(shown / 1024).toFixed(1)} GB`}
    </span>
  )
}

/** 完成时的打勾：圆圈弹出 + 勾线描出来 */
function CheckBurst({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
    >
      <circle cx="12" cy="12" r="11" fill={accent(500)} />
      <motion.path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

/** 一个阶段的一行 */
function StageRow({
  index,
  state,
  detail,
  memory
}: {
  index: number
  state: 'pending' | 'active' | 'done'
  detail: string
  memory: number | null
}): JSX.Element {
  const stage = STAGES[index]
  const Icon = stage.icon
  return (
    <motion.div
      className="relative flex items-start gap-3 py-2"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: state === 'pending' ? 0.4 : 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      {/* 图标：进行中带旋转光环，完成后换成打勾 */}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        {state === 'active' && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{ borderTopColor: accent(300), borderRightColor: accent(400, 0.4) }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
          />
        )}
        {state === 'active' && (
          <motion.span
            className="absolute inset-1 rounded-full"
            style={{ background: accent(400, 0.25) }}
            animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
        {state === 'done' ? (
          <CheckBurst size={22} />
        ) : (
          <Icon className="relative h-4 w-4" style={{ color: state === 'active' ? accent(200) : undefined }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${state === 'active' ? 'font-semibold' : ''}`}>{stage.title}</div>
        <AnimatePresence mode="wait">
          {state !== 'pending' && (
            <motion.div
              key={detail + state}
              className="truncate text-xs text-white/55"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {index === 1 ? (
                <>
                  {detail} · JVM 内存 <RollingMemory value={memory} />
                </>
              ) : (
                detail
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ---------- 主组件 ----------

/** 游戏启动动画（放在 App 里，全局只需一个） */
function GameLaunchOverlay(): JSX.Element {
  const { animations } = useAppearance()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [versionId, setVersionId] = useState('')
  const [phase, setPhase] = useState<Phase>('launching')
  /** 真实进度：已完成的阶段数 */
  const [realCompleted, setRealCompleted] = useState(0)
  /** 平滑推进：已完成的阶段数 */
  const [simCompleted, setSimCompleted] = useState(0)
  const [details, setDetails] = useState<string[]>(STAGES.map((s) => s.hint))
  const [memory, setMemory] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length))
  /** 当前阶段开始的时间：进度条在一个阶段里也缓慢前进 */
  const [stageStartedAt, setStageStartedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())

  const openRef = useRef(false)
  const phaseRef = useRef<Phase>('launching')
  const openedAt = useRef(0)
  const lastRealProgress = useRef(0)
  const sawLaunching = useRef(false)
  const cancellingRef = useRef(false)
  const logBoxRef = useRef<HTMLDivElement>(null)
  openRef.current = open
  phaseRef.current = phase

  const completed =
    phase === 'done' ? STAGES.length : Math.min(STAGES.length - 1, Math.max(realCompleted, simCompleted))

  /** 开始一次新的启动动画 */
  const start = useCallback((id: string, keepLogs = false) => {
    setOpen(true)
    setMinimized(false)
    setVersionId(id)
    setPhase('launching')
    setRealCompleted(0)
    setSimCompleted(0)
    setDetails(STAGES.map((s) => s.hint))
    setMemory(null)
    setError('')
    if (!keepLogs) setLogs([])
    setShowLogs(false)
    setCancelling(false)
    cancellingRef.current = false
    setTipIndex(Math.floor(Math.random() * TIPS.length))
    setStageStartedAt(Date.now())
    openedAt.current = Date.now()
    lastRealProgress.current = Date.now()
    sawLaunching.current = false
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setMinimized(false)
  }, [])

  /** 真实进度往前推进（只进不退） */
  const advanceReal = useCallback((count: number) => {
    lastRealProgress.current = Date.now()
    setRealCompleted((prev) => (count > prev ? count : prev))
  }, [])

  const setDetail = useCallback((stage: number, text: string) => {
    setDetails((prev) => prev.map((d, i) => (i === stage ? text : d)))
  }, [])

  /** 根据游戏状态更新（推送和定时查询都走这里） */
  const applyStatus = useCallback(
    (status: GameStatus) => {
      if (status.state === 'launching') {
        // 别处发起的启动（服务器页、桌面快捷方式）：自动打开（先打开再记下状态，打开时会重置记录）
        if (!openRef.current) {
          start(status.versionId, true)
          openRef.current = true
        }
        sawLaunching.current = true
        // 有 startedAt 说明游戏进程已经创建
        if (status.startedAt) advanceReal(4)
        return
      }
      if (!openRef.current || phaseRef.current !== 'launching') return
      if (status.state === 'running') {
        setPhase('done')
        return
      }
      // 失败、退出只认这次启动之后的状态（打开动画时主进程可能还是上一次的「崩溃」「已退出」）
      if (!sawLaunching.current) return
      if (status.state === 'crashed') {
        setError(status.error || '游戏启动失败')
        setPhase('failed')
      } else if (status.state === 'exited') {
        // 玩家取消的显示「已取消」；窗口出现之前游戏自己正常退出的，直接关闭
        if (cancellingRef.current) setPhase('cancelled')
        else close()
      }
    },
    [start, advanceReal, close]
  )

  // 外部的打开 / 关闭命令
  useEffect(() => {
    const listener = (command: OverlayCommand): void => {
      if (command.type === 'open') start(command.versionId)
      else close()
    }
    commandListeners.add(listener)
    return () => {
      commandListeners.delete(listener)
    }
  }, [start, close])

  // 游戏状态推送
  useEffect(() => window.api.onGameStatus(applyStatus), [applyStatus])

  // 启动日志：显示在日志小窗里，同时从中识别进度
  useEffect(
    () =>
      window.api.onGameLog((event) => {
        if (event.reset) setLogs([])
        // 动画关着时不保存日志（整局游戏每秒都会推送很多次）：再打开时会从主进程补上完整日志
        if (event.lines.length === 0 || !openRef.current) return
        setLogs((prev) => [...prev, ...event.lines].slice(-300))
        for (const line of event.lines) {
          const milestone = parseLaunchLog(line)
          if (!milestone) continue
          if (milestone.detail) setDetail(milestone.detail.stage, milestone.detail.text)
          if (milestone.memory) setMemory(milestone.memory)
          if (milestone.completed) advanceReal(milestone.completed)
          if (milestone.done && phaseRef.current === 'launching') setPhase('done')
          if (milestone.cancelled && phaseRef.current === 'launching') setPhase('cancelled')
          if (milestone.failed && phaseRef.current === 'launching') {
            setError(milestone.failed)
            setPhase('failed')
          }
        }
      }),
    [advanceReal, setDetail]
  )

  // 打开时：补上已经写出的日志，并查一次当前状态；关闭时清空，下次打开重新补
  useEffect(() => {
    if (!open) {
      setLogs([])
      return
    }
    void window.api
      .getGameLogs()
      .then((lines) => setLogs((prev) => (prev.length > 0 ? prev : lines.slice(-300))))
      .catch(() => undefined)
  }, [open])

  // 双保险：每 2 秒主动查询一次状态（推送丢失时也能跟上）；长时间没有启动迹象时关闭
  useEffect(() => {
    if (!open || phase !== 'launching') return
    const timer = window.setInterval(() => {
      void window.api
        .getGameStatus()
        .then((status) => {
          applyStatus(status)
          // 点了启动但主进程一直没有开始（例如启动请求被拒绝）：8 秒后自动关闭
          if (
            !sawLaunching.current &&
            status.state !== 'launching' &&
            Date.now() - openedAt.current > 8000 &&
            phaseRef.current === 'launching'
          ) {
            close()
          }
        })
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [open, phase, applyStatus, close])

  // 平滑推进：一段时间没有真实进度时，自动往前走一步（最多到「构建启动指令」）
  useEffect(() => {
    if (!open || phase !== 'launching') return
    const timer = window.setInterval(() => {
      if (Date.now() - lastRealProgress.current < SIM_STEP) return
      setSimCompleted((prev) => (prev < SIM_CAP ? prev + 1 : prev))
    }, SIM_STEP)
    return () => window.clearInterval(timer)
  }, [open, phase])

  // 阶段变化时记下开始时间；每 200ms 刷新一次，让进度条在阶段内也缓慢前进
  useEffect(() => setStageStartedAt(Date.now()), [completed])
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [open])

  // 启动太久：自动收起成小状态条，不挡住界面
  useEffect(() => {
    if (!open || phase !== 'launching' || minimized) return
    const left = AUTO_MINIMIZE_AFTER - (Date.now() - openedAt.current)
    const timer = window.setTimeout(() => setMinimized(true), Math.max(0, left))
    return () => window.clearTimeout(timer)
  }, [open, phase, minimized])

  // 完成 / 取消后自动消失；失败时留着，让玩家看清原因
  useEffect(() => {
    if (!open) return
    if (phase === 'done') {
      const timer = window.setTimeout(close, DONE_HOLD)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'cancelled') {
      const timer = window.setTimeout(close, 1400)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [open, phase, close])

  // 小知识每 4.5 秒换一条
  useEffect(() => {
    if (!open || minimized) return
    const timer = window.setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4500)
    return () => window.clearInterval(timer)
  }, [open, minimized])

  // 日志小窗自动滚到最新
  useEffect(() => {
    if (showLogs && logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }, [logs, showLogs])

  // Esc：启动中收起，结束后关闭
  useEffect(() => {
    if (!open || minimized) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (phaseRef.current === 'launching') setMinimized(true)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, minimized, close])

  const cancel = async (): Promise<void> => {
    setCancelling(true)
    cancellingRef.current = true
    try {
      const accepted = await window.api.cancelLaunch()
      // 已经不在启动中（例如刚好进入游戏）：由状态推送决定结果
      if (!accepted) {
        setCancelling(false)
        cancellingRef.current = false
      }
    } catch {
      // 主进程不支持取消：直接关闭动画
      close()
    }
  }

  // 总进度：已完成的阶段 + 当前阶段内缓慢逼近（不会走满，等真实进度）
  const inStage = phase === 'launching' ? 0.85 * (1 - Math.exp(-(now - stageStartedAt) / 4000)) : 0
  const percent = phase === 'done' ? 100 : Math.min(99, ((completed + inStage) / STAGES.length) * 100)
  const stageState = (i: number): 'pending' | 'active' | 'done' => {
    if (i < completed) return 'done'
    if (i === completed && phase === 'launching') return 'active'
    return phase === 'done' ? 'done' : 'pending'
  }
  const currentTitle =
    phase === 'done'
      ? '游戏窗口已就绪'
      : phase === 'failed'
        ? '启动失败'
        : phase === 'cancelled'
          ? '已取消启动'
          : STAGES[completed].title

  return (
    <AnimatePresence>
      {open && minimized && (
        // 收起后的小状态条（外层负责水平居中，内层做上下滑入动画，两者的 transform 不会互相覆盖）
        <motion.div key="mini" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center">
          <motion.button
            onClick={() => setMinimized(false)}
            className="pointer-events-auto flex w-80 items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-black/60 px-4 py-2.5 text-left shadow-2xl backdrop-blur-xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            title="展开启动动画"
          >
            {phase === 'launching' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: accent(300) }} />
            ) : phase === 'failed' ? (
              <CircleX className="h-4 w-4 shrink-0 text-rose-300" />
            ) : (
              <CheckBurst size={16} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                {versionId} · {currentTitle}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${accent(500)}, ${accent(300)})` }}
                  animate={{ width: `${percent}%` }}
                  transition={{ ease: 'easeOut', duration: 0.4 }}
                />
              </div>
            </div>
            <Maximize2 className="h-4 w-4 shrink-0 text-white/50" />
          </motion.button>
        </motion.div>
      )}

      {open && !minimized && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: phase === 'done' ? 1.04 : 1, filter: 'blur(8px)' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          role="dialog"
          aria-label={`正在启动 ${versionId}`}
        >
          {/* 背景：加深模糊和压暗，镜头「拉近」 */}
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-xl"
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          {/* 主题色呼吸暗角 */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, transparent 35%, ${accent(500, 0.28)} 75%, ${accent(600, 0.45)} 100%)`
            }}
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
          />
          {/* 汇聚的星尘（关闭界面动画时不画） */}
          {animations && phase === 'launching' && <WarpField />}

          {/* 中央面板 */}
          <motion.div
            className="relative w-[min(30rem,calc(100%-2rem))] rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-2xl"
            style={{ boxShadow: `0 0 60px ${accent(500, 0.25)}, 0 25px 50px rgb(0 0 0 / 0.4)` }}
            initial={{ y: 30, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.05 }}
          >
            {/* 标题：版本名 */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.3em]" style={{ color: accent(300) }}>
                  {phase === 'launching'
                    ? 'Launching'
                    : phase === 'done'
                      ? 'Ready'
                      : phase === 'failed'
                        ? 'Failed'
                        : 'Cancelled'}
                </div>
                <div className="mt-1 truncate text-2xl font-bold" title={versionId}>
                  {versionId || 'Minecraft'}
                </div>
              </div>
              {phase === 'launching' ? (
                <button
                  onClick={() => setMinimized(true)}
                  title="收起到底部（游戏继续启动）"
                  className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={close}
                  title="关闭"
                  className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* 5 个阶段 */}
            <div className="mt-4">
              {STAGES.map((_, i) => (
                <StageRow
                  key={i}
                  index={i}
                  state={stageState(i)}
                  detail={i === STAGES.length - 1 && phase === 'done' ? '已进入游戏' : details[i]}
                  memory={memory}
                />
              ))}
            </div>

            {/* 总进度条 */}
            <div className="mt-3">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background:
                      phase === 'failed' ? 'rgb(244 63 94)' : `linear-gradient(90deg, ${accent(600)}, ${accent(300)})`,
                    boxShadow: `0 0 12px ${accent(400, 0.8)}`
                  }}
                  animate={{ width: `${phase === 'failed' ? 100 : percent}%` }}
                  transition={{ ease: 'easeOut', duration: 0.5 }}
                />
                {phase === 'launching' && (
                  <motion.div
                    className="absolute inset-y-0 w-20"
                    style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.6), transparent)' }}
                    animate={{ x: ['-5rem', '32rem'] }}
                    transition={{ duration: 1.3, ease: 'easeInOut', repeat: Infinity }}
                  />
                )}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-white/45">
                <span className="truncate">{currentTitle}</span>
                <span className="font-mono tabular-nums">{Math.round(percent)}%</span>
              </div>
            </div>

            {/* 完成 / 失败 / 取消 */}
            <AnimatePresence>
              {phase === 'done' && (
                <motion.div
                  className="mt-4 flex items-center justify-center gap-2 text-sm font-medium"
                  style={{ color: accent(300) }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <CheckBurst size={22} />
                  游戏窗口已就绪，祝你游戏愉快！
                </motion.div>
              )}
              {phase === 'failed' && (
                <motion.div
                  className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CircleX className="h-4 w-4 shrink-0" />
                    启动失败
                  </div>
                  <div className="mt-1 line-clamp-4 whitespace-pre-wrap break-all text-xs opacity-90">{error}</div>
                </motion.div>
              )}
              {phase === 'cancelled' && (
                <motion.div
                  className="mt-4 text-center text-sm text-white/60"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  已取消启动
                </motion.div>
              )}
            </AnimatePresence>

            {/* Minecraft 小知识 */}
            {phase === 'launching' && (
              <div className="mt-4 flex h-10 items-start gap-2 overflow-hidden rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent(300) }} />
                <div className="relative min-w-0 flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tipIndex}
                      className="line-clamp-2"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                    >
                      {TIPS[tipIndex]}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* 实时启动日志 */}
            <div className="mt-3">
              <button
                onClick={() => setShowLogs((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white"
              >
                <Terminal className="h-3.5 w-3.5" />
                {showLogs ? '收起启动日志' : '查看实时启动日志'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLogs ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {showLogs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div
                      ref={logBoxRef}
                      className="mt-2 h-40 overflow-y-auto rounded-xl bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-white/70"
                    >
                      {logs.length === 0 ? (
                        <div className="text-white/40">等待日志输出…</div>
                      ) : (
                        logs.map((line, i) => (
                          <div
                            key={i}
                            className="whitespace-pre-wrap break-all"
                            style={line.startsWith('[启动器]') ? { color: accent(200) } : undefined}
                          >
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 底部按钮 */}
            <div className="mt-4 flex items-center justify-end gap-2">
              {phase === 'launching' ? (
                <button
                  onClick={() => void cancel()}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  {cancelling ? '正在取消…' : '取消启动'}
                </button>
              ) : (
                <button
                  onClick={close}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
                >
                  关闭
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default GameLaunchOverlay
