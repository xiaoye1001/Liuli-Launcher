/**
 * 背景粒子引擎：一个 Canvas 绘制所有粒子
 * - 粒子数量按窗口面积计算，并设上限
 * - 发光点、花瓣等预先绘制成小图（sprite），每帧只做 drawImage，开销很小
 * - 帧率限制在约 40 帧；暂停时完全停止 requestAnimationFrame（0 占用）
 */
import type { ParticleEffect } from '../../../shared/types'

export type ParticleKind = Exclude<ParticleEffect, 'auto' | 'none'>

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  phase: number
  life: number
  maxLife: number
  alpha: number
  /** 粒子种类内部的变体（例如雨滴 / 微尘） */
  variant: number
}

interface KindConfig {
  /** 每多少平方像素一个粒子 */
  areaPerParticle: number
  max: number
  spawn: (p: Particle, w: number, h: number, initial: boolean) => void
  /** 返回 false 表示粒子消失，需要重新生成 */
  update: (p: Particle, dt: number, w: number, h: number, t: number) => boolean
  draw: (ctx: CanvasRenderingContext2D, p: Particle, t: number, sprites: Sprites) => void
}

interface Sprites {
  petal: HTMLCanvasElement
  ender: HTMLCanvasElement
  firefly: HTMLCanvasElement
  ember: HTMLCanvasElement
  dust: HTMLCanvasElement
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min)

/** 发光圆点：中心亮、边缘透明 */
function glowSprite(size: number, inner: string, outer: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.25, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

/** 樱花花瓣：两条贝塞尔曲线围成的心形花瓣，带渐变 */
function petalSprite(): HTMLCanvasElement {
  const w = 28
  const h = 24
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, 'rgba(255, 228, 240, 0.95)')
  grad.addColorStop(1, 'rgba(244, 114, 182, 0.9)')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(w * 0.5, h * 0.95)
  g.bezierCurveTo(w * 0.05, h * 0.7, w * 0.02, h * 0.15, w * 0.32, h * 0.08)
  g.quadraticCurveTo(w * 0.5, h * 0.22, w * 0.5, h * 0.22)
  g.quadraticCurveTo(w * 0.5, h * 0.22, w * 0.68, h * 0.08)
  g.bezierCurveTo(w * 0.98, h * 0.15, w * 0.95, h * 0.7, w * 0.5, h * 0.95)
  g.fill()
  return c
}

function createSprites(): Sprites {
  return {
    petal: petalSprite(),
    ender: glowSprite(32, 'rgba(233, 196, 255, 1)', 'rgba(168, 85, 247, 0)'),
    firefly: glowSprite(32, 'rgba(236, 252, 160, 1)', 'rgba(163, 230, 53, 0)'),
    ember: glowSprite(32, 'rgba(255, 220, 150, 1)', 'rgba(249, 115, 22, 0)'),
    dust: glowSprite(16, 'rgba(226, 232, 240, 0.9)', 'rgba(226, 232, 240, 0)')
  }
}

const KINDS: Record<ParticleKind, KindConfig> = {
  // 樱花：缓慢飘落，左右摇摆，翻转（横向缩放模拟 3D）
  sakura: {
    areaPerParticle: 26000,
    max: 60,
    spawn: (p, w, h, initial) => {
      p.x = rand(-0.1 * w, w)
      p.y = initial ? rand(-h, h) : rand(-60, -20)
      p.vx = rand(12, 34)
      p.vy = rand(26, 52)
      p.size = rand(0.55, 1.05)
      p.rotation = rand(0, Math.PI * 2)
      p.spin = rand(-1.2, 1.2)
      p.phase = rand(0, Math.PI * 2)
      p.alpha = rand(0.65, 0.95)
    },
    update: (p, dt, w, h, t) => {
      p.x += (p.vx + Math.sin(t * 0.9 + p.phase) * 22) * dt
      p.y += p.vy * dt
      p.rotation += p.spin * dt
      return p.y < h + 40 && p.x < w + 60
    },
    draw: (ctx, p, t, s) => {
      const flip = Math.cos(t * 1.6 + p.phase)
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.scale(p.size * (0.35 + 0.65 * Math.abs(flip)), p.size)
      ctx.drawImage(s.petal, -s.petal.width / 2, -s.petal.height / 2)
      ctx.restore()
    }
  },
  // 末影星尘：缓缓上浮，闪烁呼吸
  ender: {
    areaPerParticle: 15000,
    max: 90,
    spawn: (p, w, h, initial) => {
      p.x = rand(0, w)
      p.y = initial ? rand(0, h) : h + rand(10, 40)
      p.vx = rand(-6, 6)
      p.vy = -rand(8, 26)
      p.size = rand(6, 16)
      p.phase = rand(0, Math.PI * 2)
      p.alpha = rand(0.35, 0.9)
    },
    update: (p, dt, w, _h, t) => {
      p.x += (p.vx + Math.sin(t * 0.5 + p.phase) * 6) * dt
      p.y += p.vy * dt
      return p.y > -30 && p.x > -30 && p.x < w + 30
    },
    draw: (ctx, p, t, s) => {
      ctx.globalAlpha = p.alpha * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + p.phase)))
      ctx.drawImage(s.ender, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
  },
  // 萤火虫：随机游走，明暗闪烁
  fireflies: {
    areaPerParticle: 32000,
    max: 40,
    spawn: (p, w, h) => {
      p.x = rand(0, w)
      p.y = rand(h * 0.25, h)
      p.vx = rand(-14, 14)
      p.vy = rand(-10, 10)
      p.size = rand(10, 20)
      p.phase = rand(0, Math.PI * 2)
      p.alpha = rand(0.6, 1)
    },
    update: (p, dt, w, h, t) => {
      // 方向缓慢随机变化
      p.vx += Math.sin(t * 0.7 + p.phase) * 8 * dt
      p.vy += Math.cos(t * 0.6 + p.phase * 1.3) * 8 * dt
      p.vx = Math.max(-18, Math.min(18, p.vx))
      p.vy = Math.max(-14, Math.min(14, p.vy))
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.x < -20) p.x = w + 20
      if (p.x > w + 20) p.x = -20
      if (p.y < h * 0.15) p.vy = Math.abs(p.vy)
      if (p.y > h + 20) p.vy = -Math.abs(p.vy)
      return true
    },
    draw: (ctx, p, t, s) => {
      const blink = Math.max(0, Math.sin(t * 1.4 + p.phase))
      ctx.globalAlpha = p.alpha * (0.15 + 0.85 * blink)
      ctx.drawImage(s.firefly, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
  },
  // 细雨微尘：斜落的细雨线 + 缓慢漂浮的微尘
  rain: {
    areaPerParticle: 9000,
    max: 150,
    spawn: (p, w, h, initial) => {
      p.variant = Math.random() < 0.7 ? 0 : 1
      p.x = rand(-0.2 * w, w)
      p.y = initial ? rand(0, h) : rand(-40, -10)
      if (p.variant === 0) {
        p.vx = rand(50, 80)
        p.vy = rand(320, 460)
        p.size = rand(9, 17)
        p.alpha = rand(0.12, 0.3)
      } else {
        p.y = initial ? rand(0, h) : rand(0, h)
        p.vx = rand(-8, 8)
        p.vy = rand(-6, 10)
        p.size = rand(3, 6)
        p.alpha = rand(0.2, 0.5)
        p.life = 0
        p.maxLife = rand(6, 14)
      }
      p.phase = rand(0, Math.PI * 2)
    },
    update: (p, dt, w, h) => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.variant === 0) return p.y < h + 20 && p.x < w + 40
      p.life += dt
      return p.life < p.maxLife
    },
    draw: (ctx, p, _t, s) => {
      if (p.variant === 0) {
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        const len = p.size / Math.hypot(p.vx, p.vy)
        ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len)
        ctx.stroke()
      } else {
        // 微尘：淡入淡出
        const k = p.life / p.maxLife
        ctx.globalAlpha = p.alpha * Math.sin(Math.PI * k)
        ctx.drawImage(s.dust, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
    }
  },
  // 下界余烬：火星从底部升腾，逐渐熄灭
  embers: {
    areaPerParticle: 20000,
    max: 70,
    spawn: (p, w, h, initial) => {
      p.x = rand(0, w)
      p.y = initial ? rand(h * 0.3, h) : h + rand(5, 30)
      p.vx = rand(-10, 10)
      p.vy = -rand(30, 70)
      p.size = rand(5, 12)
      p.phase = rand(0, Math.PI * 2)
      p.alpha = rand(0.6, 1)
      p.life = initial ? rand(0, 4) : 0
      p.maxLife = rand(4, 8)
    },
    update: (p, dt, w, _h, t) => {
      p.life += dt
      p.x += (p.vx + Math.sin(t * 2 + p.phase) * 10) * dt
      p.y += p.vy * dt
      p.vy *= 1 - 0.08 * dt
      return p.life < p.maxLife && p.y > -20 && p.x > -20 && p.x < w + 20
    },
    draw: (ctx, p, t, s) => {
      const k = p.life / p.maxLife
      const flicker = 0.75 + 0.25 * Math.sin(t * 9 + p.phase)
      ctx.globalAlpha = p.alpha * (1 - k) * flicker
      const size = p.size * (1 - k * 0.5)
      ctx.drawImage(s.ember, p.x - size / 2, p.y - size / 2, size, size)
    }
  }
}

function newParticle(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 1,
    rotation: 0,
    spin: 0,
    phase: 0,
    life: 0,
    maxLife: 1,
    alpha: 1,
    variant: 0
  }
}

export interface ParticleOptions {
  /** 数量倍数：稀疏 0.5、正常 1、密集 1.8 */
  density: number
  /** 速度倍数：0.5 ~ 2 */
  speed: number
  /** 鼠标互动：粒子躲开鼠标 */
  interact: boolean
}

export const DENSITY_FACTORS = { low: 0.5, normal: 1, high: 1.8 } as const

export interface ParticleSystem {
  start: () => void
  stop: () => void
  destroy: () => void
  /** 修改数量、速度、互动，不需要重建 */
  setOptions: (options: ParticleOptions) => void
  /** 鼠标位置（相对 canvas），null 表示鼠标不在窗口内 */
  setPointer: (point: { x: number; y: number } | null) => void
}

/** 鼠标互动的影响半径（像素）与推开的力度 */
const REPEL_RADIUS = 130
const REPEL_FORCE = 260

/** 帧间隔（毫秒），约 40 帧 */
const FRAME_INTERVAL = 1000 / 40

/** 在 canvas 上运行一种粒子特效，随 canvas 尺寸变化自动调整 */
export function createParticleSystem(
  canvas: HTMLCanvasElement,
  kind: ParticleKind,
  initial: ParticleOptions = { density: 1, speed: 1, interact: false }
): ParticleSystem {
  let options = initial
  let pointer: { x: number; y: number } | null = null
  const ctx = canvas.getContext('2d')!
  const config = KINDS[kind]
  const sprites = createSprites()
  const particles: Particle[] = []
  let width = 0
  let height = 0
  let frame = 0
  let last = 0
  let time = Math.random() * 100
  let running = false

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect()
    // 高分屏最多按 1.5 倍绘制，兼顾清晰度与性能
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const target = Math.min(
      Math.round(config.max * options.density),
      Math.round(((width * height) / config.areaPerParticle) * options.density)
    )
    while (particles.length < target) {
      const p = newParticle()
      config.spawn(p, width, height, true)
      particles.push(p)
    }
    particles.length = target
  }

  const render = (): void => {
    ctx.clearRect(0, 0, width, height)
    if (kind === 'rain') {
      // 浅色主题下雨线用深一些的颜色，否则看不见
      ctx.strokeStyle = document.documentElement.classList.contains('light') ? 'rgb(71, 85, 105)' : 'rgb(203, 213, 225)'
      ctx.lineWidth = 1
      ctx.lineCap = 'round'
    }
    for (const p of particles) config.draw(ctx, p, time, sprites)
    ctx.globalAlpha = 1
  }

  const loop = (now: number): void => {
    if (!running) return
    frame = requestAnimationFrame(loop)
    if (now - last < FRAME_INTERVAL) return
    // 最多按 0.1 秒计算，避免切回窗口时粒子瞬移
    const realDt = Math.min(0.1, (now - last) / 1000)
    const dt = realDt * options.speed
    last = now
    time += dt
    const r2 = REPEL_RADIUS * REPEL_RADIUS
    for (const p of particles) {
      if (!config.update(p, dt, width, height, time)) {
        config.spawn(p, width, height, false)
        continue
      }
      // 鼠标互动：靠近鼠标的粒子被轻轻推开（越近推得越远）
      if (options.interact && pointer) {
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 < r2 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const push = (1 - d / REPEL_RADIUS) * REPEL_FORCE * realDt
          p.x += (dx / d) * push
          p.y += (dy / d) * push
        }
      }
    }
    render()
  }

  const observer = new ResizeObserver(() => {
    resize()
    render()
  })
  observer.observe(canvas)
  resize()

  return {
    start: () => {
      if (running) return
      running = true
      last = performance.now()
      frame = requestAnimationFrame(loop)
    },
    stop: () => {
      running = false
      cancelAnimationFrame(frame)
    },
    destroy: () => {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      ctx.clearRect(0, 0, width, height)
    },
    setOptions: (next) => {
      const densityChanged = next.density !== options.density
      options = next
      if (densityChanged) {
        resize()
        render()
      }
    },
    setPointer: (point) => {
      pointer = point
    }
  }
}
