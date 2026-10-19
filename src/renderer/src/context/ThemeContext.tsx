/**
 * 主题上下文：汇总外观设置（主题方案、粒子特效、背景、动画开关）与运行状态，
 * 计算出实际要显示的粒子特效，以及背景动画是否需要暂停：
 * - 游戏运行中、窗口最小化 / 隐藏、关闭了界面动画、系统要求减少动态效果时暂停，做到 0 占用
 *
 * 设置本身保存在主进程的配置文件里（由 appearance.ts 读取并在变化时推送），
 * 这里不重复保存，只负责把它们组合成背景组件需要的状态。CSS 变量（主题色、面板质感、底色）
 * 由 appearance.ts 在设置变化时写到 <html> 上。
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppearance, type Appearance } from '../utils/appearance'
import { presetInfo, type ThemePresetInfo } from '../themes/presets'
import type { ParticleKind } from '../utils/particles'

export interface ThemeState {
  appearance: Appearance
  preset: ThemePresetInfo
  /** 实际显示的粒子特效（null 表示不显示） */
  particles: ParticleKind | null
  /** 背景动画是否暂停 */
  paused: boolean
  /** 暂停的原因（用于设置页提示） */
  pauseReason: 'game' | 'hidden' | 'animations' | 'reduced-motion' | null
}

const ThemeContext = createContext<ThemeState | null>(null)

/** 游戏是否在运行（启动中也算） */
function useGameRunning(): boolean {
  const [running, setRunning] = useState(false)
  useEffect(() => {
    let alive = true
    const apply = (state: string): void => setRunning(state === 'launching' || state === 'running')
    void window.api.getGameStatus().then((s) => {
      if (alive) apply(s.state)
    })
    const off = window.api.onGameStatus((s) => apply(s.state))
    return () => {
      alive = false
      off()
    }
  }, [])
  return running
}

/** 窗口是否可见（最小化或隐藏到托盘时为 false） */
function useWindowVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = (): void => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

/** 系统设置了「减少动态效果」 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const appearance = useAppearance()
  const gameRunning = useGameRunning()
  const visible = useWindowVisible()
  const reducedMotion = useReducedMotion()

  const value = useMemo<ThemeState>(() => {
    const preset = presetInfo(appearance.themePreset)
    const choice = appearance.particleEffect === 'auto' ? preset.particles : appearance.particleEffect
    const particles = choice === 'none' ? null : choice
    const pauseReason: ThemeState['pauseReason'] = gameRunning
      ? 'game'
      : !visible
        ? 'hidden'
        : !appearance.animations
          ? 'animations'
          : reducedMotion
            ? 'reduced-motion'
            : null
    return { appearance, preset, particles, paused: pauseReason !== null, pauseReason }
  }, [appearance, gameRunning, visible, reducedMotion])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必须在 <ThemeProvider> 内使用')
  return value
}
