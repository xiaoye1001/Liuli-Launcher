import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { GlowCube } from './components/AppSplashScreen'
import { parseLaunchLog } from './components/GameLaunchOverlay'
import { DEFAULT_TITLE, useAppearance } from './utils/appearance'

/**
 * 桌面启动悬浮窗的页面（地址带 #launch-splash，预览时为 #launch-splash-preview）。
 * 启动器不在前台时显示在屏幕中央：发光方块 + 当前进度，游戏窗口出现后淡出。
 * 窗口本身是透明的，只有中间的卡片可见；颜色跟随主题色。
 */

/** 与启动器里的启动动画相同的 5 个阶段（简短的说法） */
const STAGES = ['验证账号', '匹配 Java', '校验游戏文件', '拉起游戏进程', '等待游戏窗口']

function accent(level: 200 | 300 | 400 | 500 | 600, alpha = 1): string {
  return `rgb(var(--accent-${level}) / ${alpha})`
}

interface Progress {
  completed: number
  detail: string
  done: boolean
}

/** 从启动日志算出进度 */
function progressOf(lines: string[], previous: Progress): Progress {
  let { completed, detail, done } = previous
  for (const line of lines) {
    const milestone = parseLaunchLog(line)
    if (!milestone) continue
    if (milestone.completed !== undefined) completed = Math.max(completed, milestone.completed)
    if (milestone.detail) detail = milestone.detail.text
    if (milestone.done) done = true
  }
  return { completed, detail, done }
}

const EMPTY: Progress = { completed: 0, detail: '', done: false }

function LaunchSplashWindow(): JSX.Element {
  const preview = window.location.hash === '#launch-splash-preview'
  const appearance = useAppearance()
  const [versionId, setVersionId] = useState(preview ? '1.21.1' : '')
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (preview) {
      // 预览：按顺序走一遍各个阶段，最后淡出
      const timers = [1, 2, 3, 4].map((step) =>
        window.setTimeout(() => setProgress({ completed: step, detail: '', done: false }), step * 1000)
      )
      timers.push(window.setTimeout(() => setProgress({ completed: 5, detail: '', done: true }), 5200))
      timers.push(window.setTimeout(() => setLeaving(true), 5700))
      return () => timers.forEach((t) => window.clearTimeout(t))
    }
    let alive = true
    window.api
      .getGameStatus()
      .then((status) => alive && setVersionId(status.versionId))
      .catch(() => undefined)
    window.api
      .getGameLogs()
      .then((lines) => alive && setProgress((p) => progressOf(lines, p)))
      .catch(() => undefined)
    const offStatus = window.api.onGameStatus((status) => {
      if (status.versionId) setVersionId(status.versionId)
      // 游戏窗口出现：播放淡出动画（主进程随后关闭窗口）
      if (status.state === 'running') {
        setProgress((p) => ({ ...p, completed: 5, done: true }))
        setLeaving(true)
      }
    })
    const offLog = window.api.onGameLog((event) => {
      setProgress((p) => progressOf(event.lines, event.reset ? EMPTY : p))
    })
    return () => {
      alive = false
      offStatus()
      offLog()
    }
  }, [preview])

  const stageIndex = Math.min(STAGES.length - 1, progress.completed)
  const percent = progress.done ? 100 : Math.min(96, ((progress.completed + 0.5) / STAGES.length) * 100)
  const title = appearance.launcherTitle || DEFAULT_TITLE

  return (
    <div className="flex h-full w-full items-center justify-center p-5 text-white">
      <motion.div
        className="relative flex h-full w-full flex-col items-center overflow-hidden rounded-[28px] border px-6 pb-5 pt-7"
        style={{
          backgroundColor: 'rgb(var(--c-popover) / 0.96)',
          borderColor: accent(400, 0.35),
          boxShadow: `0 0 0 1px ${accent(300, 0.08)}, 0 12px 40px rgb(0 0 0 / 0.35)`
        }}
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={leaving ? { opacity: 0, scale: 1.06, filter: 'blur(6px)' } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: leaving ? 0.6 : 0.45, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* 背景光斑 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 30%, ${accent(500, 0.22)}, transparent 60%)` }}
        />

        {/* 发光方块 + 呼吸光晕 + 旋转光环 */}
        <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
          <motion.div
            className="absolute h-28 w-28 rounded-full"
            style={{
              background: `radial-gradient(circle, ${accent(400, 0.5)}, transparent 70%)`,
              filter: 'blur(14px)'
            }}
            animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
          />
          <motion.div
            className="absolute h-32 w-32 rounded-full border"
            style={{ borderColor: accent(300, 0.25) }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
          >
            <span
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{ background: accent(200), boxShadow: `0 0 10px ${accent(300)}` }}
            />
          </motion.div>
          <GlowCube size={60} />
        </div>

        <div className="relative mt-3 text-center">
          <div className="text-[11px] tracking-[0.35em] text-white/50">{title}</div>
          <div className="mt-1.5 max-w-[260px] truncate text-lg font-bold" title={versionId}>
            {progress.done ? '游戏窗口已就绪' : `正在启动 ${versionId || 'Minecraft'}`}
          </div>
          <motion.div
            key={progress.detail || stageIndex}
            className="mt-1 h-5 max-w-[260px] truncate text-xs"
            style={{ color: accent(300) }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {progress.done ? '祝你游戏愉快！' : progress.detail || `${STAGES[stageIndex]}…`}
          </motion.div>
        </div>

        {/* 流光进度条 */}
        <div className="relative mt-4 w-full">
          <div className="relative h-[3px] overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${accent(600)}, ${accent(300)})`,
                boxShadow: `0 0 10px ${accent(400, 0.9)}`
              }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute inset-y-0 w-12"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.7), transparent)' }}
              animate={{ x: ['-3rem', '18rem'] }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
          {/* 5 个阶段的小圆点 */}
          <div className="mt-3 flex justify-center gap-2">
            {STAGES.map((stage, i) => {
              const finished = progress.done || i < progress.completed
              const current = !progress.done && i === stageIndex
              return (
                <motion.span
                  key={stage}
                  title={stage}
                  className="h-1.5 rounded-full"
                  style={{ background: finished || current ? accent(400) : 'rgb(var(--c-ink) / 0.15)' }}
                  animate={{ width: current ? 18 : 6, opacity: current ? [0.6, 1, 0.6] : 1 }}
                  transition={current ? { opacity: { duration: 1.2, repeat: Infinity }, width: { duration: 0.3 } } : {}}
                />
              )
            })}
          </div>
        </div>

        <div className="relative mt-auto pt-3 text-[11px] text-white/40">
          {preview ? '预览：启动器不在前台时显示' : '游戏窗口出现后自动关闭'}
        </div>
      </motion.div>
    </div>
  )
}

export default LaunchSplashWindow
