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
import { createParticleSystem, type ParticleKind } from '../utils/particles'
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

/** Canvas 粒子图层：切换种类时重建，暂停时停止绘制 */
function ParticleLayer({ kind, paused }: { kind: ParticleKind; paused: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const systemRef = useRef<ReturnType<typeof createParticleSystem> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const system = createParticleSystem(canvas, kind)
    systemRef.current = system
    return () => {
      system.destroy()
      systemRef.current = null
    }
  }, [kind])

  useEffect(() => {
    const system = systemRef.current
    if (!system) return
    if (paused) system.stop()
    else system.start()
  }, [paused, kind])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-particles={kind} data-paused={paused} />
  )
}

function DynamicBackground(): JSX.Element {
  const { appearance, particles, paused } = useTheme()
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 isolate overflow-hidden"
      aria-hidden
      data-dynamic-background
    >
      <PresetLayer preset={appearance.themePreset} paused={paused} />
      <AppBackground appearance={appearance} paused={paused} />
      {particles && <ParticleLayer kind={particles} paused={paused} />}
    </div>
  )
}

export default DynamicBackground
