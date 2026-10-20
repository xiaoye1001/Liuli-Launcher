import { useEffect, useState, type CSSProperties } from 'react'
import { useAppearance } from '../utils/appearance'

/**
 * 鼠标点击效果：在点击位置放出一圈波纹和几颗向外飞散的光点，颜色跟随主题色，约半秒后消失。
 * 只是覆盖在最上层的装饰，不拦截鼠标；关闭「界面动画」或「点击特效」时不显示。
 * 动画用 CSS 实现（index.css 里的 click-ring / click-spark），不占用 React 渲染
 */

interface Burst {
  id: number
  x: number
  y: number
}

/** 光点数量与飞散距离 */
const SPARKS = 7
const DISTANCE = 22
/** 同时保留的点击数（连点时不会堆积太多元素） */
const MAX_BURSTS = 8
/** 动画时长（与 index.css 一致），播完后移除元素 */
const LIFETIME = 650

function ClickBurst({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <span className="absolute" style={{ left: x, top: y }}>
      <span className="click-ring" />
      {Array.from({ length: SPARKS }, (_, i) => {
        // 每颗光点的方向均匀分布，再加一点随机，看起来更自然
        const angle = (i / SPARKS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
        const distance = DISTANCE * (0.7 + Math.random() * 0.6)
        const style = {
          '--dx': `${Math.cos(angle) * distance}px`,
          '--dy': `${Math.sin(angle) * distance}px`,
          animationDelay: `${Math.random() * 40}ms`
        } as CSSProperties
        return <span key={i} className="click-spark" style={style} />
      })}
    </span>
  )
}

function ClickEffects(): JSX.Element | null {
  const { animations, clickEffect } = useAppearance()
  const enabled = animations && clickEffect
  const [bursts, setBursts] = useState<Burst[]>([])

  useEffect(() => {
    if (!enabled) {
      setBursts([])
      return
    }
    let next = 0
    const timers = new Set<number>()
    const onDown = (e: PointerEvent): void => {
      // 只响应鼠标左键和触摸
      if (e.button !== 0) return
      const id = ++next
      setBursts((list) => [...list.slice(-(MAX_BURSTS - 1)), { id, x: e.clientX, y: e.clientY }])
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        setBursts((list) => list.filter((b) => b.id !== id))
      }, LIFETIME)
      timers.add(timer)
    }
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [enabled])

  if (!enabled || bursts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
      {bursts.map((b) => (
        <ClickBurst key={b.id} x={b.x} y={b.y} />
      ))}
    </div>
  )
}

export default ClickEffects
