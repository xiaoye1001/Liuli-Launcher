/**
 * 动态背景渲染器：固定在内容最底层，不响应鼠标。图层从下到上：
 * 1. 主题方案的动态背景（极光光斑、晴空光晕与云雾、星云、热浪、噪点……），底色来自 CSS 变量 --bg-app
 * 2. 自定义壁纸（图片或视频，带模糊与遮罩）——设置了壁纸时盖住动态背景
 * 3. Canvas 粒子特效（樱花、末影星尘、萤火虫、细雨微尘、下界余烬）
 * 游戏运行、窗口最小化、关闭动画时全部暂停
 */
import { useEffect, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'
import AppBackground from './AppBackground'
import { createParticleSystem, DENSITY_FACTORS, type ParticleKind, type ParticleOptions } from '../utils/particles'
import type { ThemePreset } from '../../../shared/types'

/** 主题方案的动态图层 */
function PresetLayer({ preset, paused }: { preset: ThemePreset; paused: boolean }): JSX.Element | null {
  const className = `theme-layer ${paused ? 'is-paused' : ''}`
  // 主光斑使用当前主题色，修改主题色时背景发光也跟着变
  const accent = 'rgb(var(--accent-500) / 0.55)'
  switch (preset) {
    case 'aurora':
      return (
        <div className={className} data-preset-layer="aurora">
          <div
            className="theme-blob aurora-a"
            style={{ width: '55vw', height: '55vw', left: '-12%', top: '-25%', background: accent }}
          />
          <div
            className="theme-blob aurora-b"
            style={{ width: '48vw', height: '48vw', right: '-14%', top: '5%', background: 'rgb(14 165 233 / 0.32)' }}
          />
          <div
            className="theme-blob aurora-c"
            style={{ width: '60vw', height: '45vw', left: '18%', bottom: '-38%', background: 'rgb(99 102 241 / 0.28)' }}
          />
        </div>
      )
    case 'sky':
      return (
        <div className={className} data-preset-layer="sky">
          <div className="sky-rays" />
          <div
            className="theme-blob sky-sun"
            style={{
              width: '42vw',
              height: '42vw',
              right: '-12%',
              top: '-22%',
              background:
                'radial-gradient(circle, rgb(255 247 214 / 0.95), rgb(255 237 180 / 0.35) 45%, transparent 70%)',
              filter: 'blur(20px)'
            }}
          />
          <div
            className="sky-cloud"
            style={{ top: '14%', width: '34vw', height: '9vw', animationDuration: '95s', animationDelay: '-20s' }}
          />
          <div
            className="sky-cloud"
            style={{ top: '38%', width: '26vw', height: '7vw', animationDuration: '120s', animationDelay: '-70s' }}
          />
          <div
            className="sky-cloud"
            style={{ top: '62%', width: '40vw', height: '10vw', animationDuration: '140s', animationDelay: '-40s' }}
          />
        </div>
      )
    case 'cherry':
      return (
        <div className={className} data-preset-layer="cherry">
          <div
            className="theme-blob aurora-a"
            style={{ width: '50vw', height: '50vw', left: '-10%', top: '-20%', background: accent }}
          />
          <div
            className="theme-blob aurora-c"
            style={{
              width: '55vw',
              height: '40vw',
              right: '-15%',
              bottom: '-25%',
              background: 'rgb(192 132 252 / 0.3)'
            }}
          />
        </div>
      )
    case 'end':
      return (
        <div className={className} data-preset-layer="end">
          <div className="end-nebula absolute" style={{ inset: '-30%' }}>
            <div
              className="theme-blob"
              style={{ width: '50vw', height: '50vw', left: '20%', top: '15%', background: accent }}
            />
            <div
              className="theme-blob"
              style={{ width: '40vw', height: '40vw', right: '18%', top: '35%', background: 'rgb(99 102 241 / 0.35)' }}
            />
            <div
              className="theme-blob"
              style={{
                width: '35vw',
                height: '35vw',
                left: '35%',
                bottom: '15%',
                background: 'rgb(217 70 239 / 0.25)'
              }}
            />
          </div>
        </div>
      )
    case 'acrylic':
      return (
        <div className={className} data-preset-layer="acrylic">
          <div
            className="theme-blob aurora-b"
            style={{
              width: '45vw',
              height: '45vw',
              left: '-15%',
              top: '-25%',
              background: 'rgb(var(--accent-500) / 0.28)'
            }}
          />
          <div
            className="theme-blob"
            style={{
              width: '40vw',
              height: '30vw',
              right: '-10%',
              bottom: '-20%',
              background: 'rgb(96 165 250 / 0.12)'
            }}
          />
          <div className="acrylic-noise" />
        </div>
      )
    case 'nether':
      return (
        <div className={className} data-preset-layer="nether">
          <div className="nether-heat" />
          <div
            className="theme-blob aurora-c"
            style={{ width: '40vw', height: '30vw', left: '30%', bottom: '-20%', background: accent }}
          />
        </div>
      )
    default:
      return null
  }
}

/** Canvas 粒子图层：切换种类时重建，暂停时停止绘制；数量、速度、鼠标互动可以随时调整 */
function ParticleLayer({
  kind,
  paused,
  options
}: {
  kind: ParticleKind
  paused: boolean
  options: ParticleOptions
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const systemRef = useRef<ReturnType<typeof createParticleSystem> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const system = createParticleSystem(canvas, kind, optionsRef.current)
    systemRef.current = system
    return () => {
      system.destroy()
      systemRef.current = null
    }
  }, [kind])

  useEffect(() => {
    systemRef.current?.setOptions(options)
  }, [options.density, options.speed, options.interact])

  useEffect(() => {
    const system = systemRef.current
    if (!system) return
    if (paused) system.stop()
    else system.start()
  }, [paused, kind])

  // 鼠标互动：把鼠标位置交给粒子引擎（canvas 铺满窗口，坐标与窗口一致）
  useEffect(() => {
    if (!options.interact || paused) {
      systemRef.current?.setPointer(null)
      return
    }
    const move = (e: MouseEvent): void => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) systemRef.current?.setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    const leave = (): void => systemRef.current?.setPointer(null)
    window.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      window.removeEventListener('mousemove', move)
      document.removeEventListener('mouseleave', leave)
      window.removeEventListener('blur', leave)
    }
  }, [options.interact, paused, kind])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-particles={kind} data-paused={paused} />
  )
}

/** 视差深度（像素）：越靠前的图层移动越多，形成立体感 */
const DEPTH = { preset: 14, wallpaper: 10, particles: 24 }

/**
 * 鼠标视差：鼠标移动时各图层轻微反向移动，带缓动。
 * 直接修改 style.transform，不触发 React 重新渲染；静止后停止计算
 */
function useParallax(enabled: boolean, layers: { ref: React.RefObject<HTMLDivElement>; depth: number }[]): void {
  const layersRef = useRef(layers)
  layersRef.current = layers
  useEffect(() => {
    const apply = (x: number, y: number): void => {
      for (const { ref, depth } of layersRef.current) {
        if (!ref.current) continue
        ref.current.style.transform =
          x === 0 && y === 0 && !enabled
            ? ''
            : `translate3d(${(-x * depth).toFixed(2)}px, ${(-y * depth).toFixed(2)}px, 0) scale(1.05)`
      }
    }
    if (!enabled) {
      apply(0, 0)
      return
    }
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let frame = 0
    const step = (): void => {
      current.x += (target.x - current.x) * 0.08
      current.y += (target.y - current.y) * 0.08
      apply(current.x, current.y)
      if (Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001) {
        frame = requestAnimationFrame(step)
      } else {
        frame = 0
      }
    }
    const kick = (): void => {
      if (!frame) frame = requestAnimationFrame(step)
    }
    const move = (e: MouseEvent): void => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
      kick()
    }
    const reset = (): void => {
      target.x = 0
      target.y = 0
      kick()
    }
    apply(0, 0)
    window.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', reset)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', move)
      document.removeEventListener('mouseleave', reset)
    }
  }, [enabled])
}

function DynamicBackground(): JSX.Element {
  const { appearance, particles, paused } = useTheme()
  const presetRef = useRef<HTMLDivElement>(null)
  const wallpaperRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<HTMLDivElement>(null)
  useParallax(appearance.parallax && !paused, [
    { ref: presetRef, depth: DEPTH.preset },
    { ref: wallpaperRef, depth: DEPTH.wallpaper },
    { ref: particlesRef, depth: DEPTH.particles }
  ])
  const options: ParticleOptions = {
    density: DENSITY_FACTORS[appearance.particleDensity] ?? 1,
    speed: Math.min(2, Math.max(0.5, (appearance.particleSpeed || 100) / 100)),
    interact: appearance.particleInteract
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 isolate overflow-hidden"
      aria-hidden
      data-dynamic-background
    >
      <div ref={presetRef} className="absolute inset-0 will-change-transform" data-parallax-layer="preset">
        <PresetLayer preset={appearance.themePreset} paused={paused} />
      </div>
      <div ref={wallpaperRef} className="absolute inset-0 will-change-transform" data-parallax-layer="wallpaper">
        <AppBackground appearance={appearance} paused={paused} />
      </div>
      {particles && (
        <div ref={particlesRef} className="absolute inset-0 will-change-transform" data-parallax-layer="particles">
          <ParticleLayer kind={particles} paused={paused} options={options} />
        </div>
      )}
    </div>
  )
}

export default DynamicBackground
