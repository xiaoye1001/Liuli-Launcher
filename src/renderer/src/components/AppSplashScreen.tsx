import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * 启动器开屏动画：打开启动器时全屏显示约 2 秒，然后放大、模糊、淡出，露出主界面。
 * - 中央是一个缓慢旋转的立体方块，带呼吸光晕和环绕上升的微光粒子
 * - 下方是流光进度条和滚动的自检文字
 * - 颜色全部来自主题色 CSS 变量（--accent-*），切换主题色后自动跟随
 * - 每次打开软件只播放一次（记录在 sessionStorage，切换页面、刷新界面都不会重复）
 *
 * 只是一层覆盖在主界面上的动画，主界面在它下面照常加载，不会推迟启动。
 */

/** sessionStorage 里记录「这次打开已经播放过」的键 */
const SPLASH_KEY = 'liuli:splash-shown'
/** 进度条从 0 走到 100% 的时间（毫秒），加上退场动画总共约 2 秒多 */
const DURATION = 1900

const MESSAGES = [
  '正在唤醒 mc_launcher 核心引擎...',
  '正在加载本地版本库与个性化主题...',
  '正在初始化多线程下载与联机模块...',
  '准备就绪，欢迎回来！'
]

/** 这次打开启动器时是否需要播放开屏动画（播放过、或系统要求减少动态效果时不播放） */
export function shouldShowSplash(): boolean {
  try {
    if (sessionStorage.getItem(SPLASH_KEY) === '1') return false
  } catch {
    // 读不到 sessionStorage 时照常播放
  }
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  } catch {
    // 不支持时照常播放
  }
  return true
}

/** 记录这次打开已经播放过 */
function markSplashShown(): void {
  try {
    sessionStorage.setItem(SPLASH_KEY, '1')
  } catch {
    // 记不住也没关系：最多下次刷新界面时再播放一次
  }
}

/** 缓入缓出：开头和结尾慢，中间快 */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 主题色（CSS 变量里是「r g b」三个数字） */
function accent(level: 200 | 300 | 400 | 500 | 600, alpha = 1): string {
  return `rgb(var(--accent-${level}) / ${alpha})`
}

/** 方块的 6 个面：位置、朝向和明暗（模拟光照，让立体感更强） */
const FACES: { transform: string; shade: number }[] = [
  { transform: 'rotateY(0deg) translateZ(var(--half))', shade: 1 },
  { transform: 'rotateY(180deg) translateZ(var(--half))', shade: 0.55 },
  { transform: 'rotateY(90deg) translateZ(var(--half))', shade: 0.8 },
  { transform: 'rotateY(-90deg) translateZ(var(--half))', shade: 0.7 },
  { transform: 'rotateX(90deg) translateZ(var(--half))', shade: 1.15 },
  { transform: 'rotateX(-90deg) translateZ(var(--half))', shade: 0.45 }
]

/** 立体发光方块：CSS 3D 绘制，每个面带像素格纹理，整体缓慢旋转 */
function GlowCube({ size = 84 }: { size?: number }): JSX.Element {
  return (
    <div className="relative" style={{ width: size, height: size, perspective: size * 8 }}>
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d', ['--half' as string]: `${size / 2}px` }}
        initial={{ rotateX: -24, rotateY: 35 }}
        animate={{ rotateX: [-24, -30, -24], rotateY: [35, 395] }}
        transition={{
          rotateY: { duration: 6, ease: 'linear', repeat: Infinity },
          rotateX: { duration: 3, ease: 'easeInOut', repeat: Infinity }
        }}
      >
        {FACES.map((face, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[6px]"
            style={{
              transform: face.transform,
              // 底色 + 4×4 像素格纹理 + 内发光描边
              background: `
                linear-gradient(135deg, ${accent(300, 0.55 * face.shade)}, ${accent(600, 0.6 * face.shade)}),
                repeating-linear-gradient(0deg, transparent 0 ${size / 4 - 1}px, rgb(255 255 255 / 0.08) ${size / 4 - 1}px ${size / 4}px),
                repeating-linear-gradient(90deg, transparent 0 ${size / 4 - 1}px, rgb(255 255 255 / 0.08) ${size / 4 - 1}px ${size / 4}px)
              `,
              backgroundBlendMode: 'screen',
              border: `1px solid ${accent(200, 0.7)}`,
              boxShadow: `inset 0 0 ${size / 4}px ${accent(200, 0.35)}, 0 0 ${size / 3}px ${accent(400, 0.35)}`,
              backfaceVisibility: 'hidden'
            }}
          />
        ))}
      </motion.div>
    </div>
  )
}

interface Mote {
  /** 横向位置（相对中心，像素） */
  x: number
  size: number
  delay: number
  duration: number
  /** 左右飘动的幅度 */
  drift: number
}

/** 环绕上升的微光粒子 */
function RisingMotes(): JSX.Element {
  const motes = useMemo<Mote[]>(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        // 均匀分布在方块四周，再加一点随机
        const angle = (i / 22) * Math.PI * 2
        return {
          x: Math.cos(angle) * (70 + Math.random() * 50),
          size: 2 + Math.random() * 3,
          delay: Math.random() * 1.6,
          duration: 1.6 + Math.random() * 1.4,
          drift: (Math.random() - 0.5) * 30
        }
      }),
    []
  )
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2">
      {motes.map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: m.x,
            top: 60,
            width: m.size,
            height: m.size,
            background: accent(200),
            boxShadow: `0 0 ${m.size * 3}px ${accent(300, 0.9)}`
          }}
          initial={{ y: 0, x: 0, opacity: 0 }}
          animate={{ y: -170, x: m.drift, opacity: [0, 1, 0] }}
          transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

interface AppSplashScreenProps {
  /** 启动器的显示名称（个性化设置里可以修改） */
  title: string
  /** 进度走完后调用；外层用 AnimatePresence 包住，移除时播放退场动画 */
  onDone: () => void
}

/** 启动器开屏动画 */
function AppSplashScreen({ title, onDone }: AppSplashScreenProps): JSX.Element {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    markSplashShown()
    let frame = 0
    let finished = false
    const start = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION)
      setProgress(easeInOut(t) * 100)
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      } else if (!finished) {
        finished = true
        // 在 100% 停一小会儿，让「准备就绪」被看清再退场
        window.setTimeout(onDone, 220)
      }
    }
    frame = requestAnimationFrame(tick)
    // 窗口在后台时 requestAnimationFrame 不运行：兜底定时结束，不会一直挡住界面
    const fallback = window.setTimeout(() => {
      if (!finished) {
        finished = true
        onDone()
      }
    }, DURATION + 1500)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
    }
  }, [onDone])

  const messageIndex = Math.min(MESSAGES.length - 1, Math.floor(progress / (100 / (MESSAGES.length - 1))))

  return (
    <motion.div
      className="app-background fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden text-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      aria-label="启动器正在加载"
      role="status"
    >
      {/* 背景：主题色的柔和光斑，压暗四周 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${accent(500, 0.22)}, transparent 55%), radial-gradient(circle at 50% 50%, transparent 40%, rgb(var(--c-shade) / 0.35))`
        }}
      />

      {/* 中央：呼吸光晕 + 旋转方块 + 上升粒子 */}
      <div className="relative flex h-56 w-56 items-center justify-center">
        <motion.div
          className="absolute h-40 w-40 rounded-full"
          style={{ background: `radial-gradient(circle, ${accent(400, 0.55)}, transparent 70%)`, filter: 'blur(18px)' }}
          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
        />
        <motion.div
          className="absolute h-44 w-44 rounded-full border"
          style={{ borderColor: accent(300, 0.25) }}
          animate={{ rotate: 360 }}
          transition={{ duration: 10, ease: 'linear', repeat: Infinity }}
        >
          <span
            className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
            style={{ background: accent(200), boxShadow: `0 0 10px ${accent(300)}` }}
          />
        </motion.div>
        <RisingMotes />
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 14 }}
        >
          <GlowCube />
        </motion.div>
      </div>

      {/* 名称 */}
      <motion.div
        className="mt-6 text-center"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
      >
        <div className="text-2xl font-bold tracking-[0.3em]" style={{ textShadow: `0 0 18px ${accent(400, 0.6)}` }}>
          {title}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.5em] text-white/40">Minecraft Launcher</div>
      </motion.div>

      {/* 流光进度条 */}
      <div className="mt-10 w-72">
        <div className="relative h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${accent(600)}, ${accent(300)})`,
              boxShadow: `0 0 10px ${accent(400, 0.9)}`
            }}
          />
          {/* 流光：一段亮光在进度条上来回扫过 */}
          <motion.div
            className="absolute inset-y-0 w-16"
            style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.7), transparent)' }}
            animate={{ x: ['-4rem', '18rem'] }}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>

        {/* 自检文字：切换时向上滚动 */}
        <div className="mt-3 flex h-5 items-center justify-between gap-3 overflow-hidden text-xs">
          <div className="relative h-5 min-w-0 flex-1">
            <motion.div
              key={messageIndex}
              className="absolute inset-0 truncate"
              style={{ color: messageIndex === MESSAGES.length - 1 ? accent(300) : undefined }}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <span className={messageIndex === MESSAGES.length - 1 ? '' : 'text-white/60'}>
                {MESSAGES[messageIndex]}
              </span>
            </motion.div>
          </div>
          <span className="shrink-0 font-mono tabular-nums text-white/50">{Math.round(progress)}%</span>
        </div>
      </div>
    </motion.div>
  )
}

export default AppSplashScreen
