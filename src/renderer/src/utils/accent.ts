/**
 * 自定义主题色：从一个颜色推算出界面用到的整套色阶（与 index.css 里预设主题色的变量相同）。
 * 主色太亮或太暗时会适当调整，保证按钮上的白字看得清
 */

type Rgb = [number, number, number]

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

const css = (rgb: Rgb): string => rgb.join(' ')

/** 相对亮度（WCAG），用于判断白字是否看得清 */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 主色的各个色阶，返回要设置到 <html> 上的 CSS 变量 */
export function accentVariables(hex: string): Record<string, string> | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [h0, s0, l0] = rgbToHsl(rgb)
  // 黑白灰没有色相，按偏冷的石墨灰处理（否则会被当成红色）
  const gray = s0 < 0.1
  const h = gray ? 215 : h0
  const s = gray ? 0.18 : s0
  const shade = (lightness: number, sat = s): Rgb => hslToRgb(h, Math.min(1, sat), lightness)
  // 主色上要放白字：调暗到和白色的对比度至少 3:1（黄色、青色这类亮色需要调得更暗）
  let l = Math.min(0.58, Math.max(0.3, l0))
  while (l > 0.25 && luminance(shade(l)) > 0.3) l -= 0.02
  // 渐变副色：色相偏移 30°
  const h2 = h + 30
  return {
    '--accent-200': css(shade(0.86)),
    '--accent-300': css(shade(0.76)),
    '--accent-400': css(shade(Math.min(0.66, l + 0.1))),
    '--accent-500': css(shade(l)),
    '--accent-600': css(shade(Math.max(0.28, l - 0.1))),
    '--accent2-400': css(hslToRgb(h2, s, Math.min(0.66, l + 0.1))),
    '--accent2-500': css(hslToRgb(h2, s, l)),
    '--accent-bg': css(shade(0.2, s * 0.8)),
    '--accent-bg-light': css(shade(0.92))
  }
}

export const ACCENT_VARIABLE_NAMES = [
  '--accent-200',
  '--accent-300',
  '--accent-400',
  '--accent-500',
  '--accent-600',
  '--accent2-400',
  '--accent2-500',
  '--accent-bg',
  '--accent-bg-light'
]
