import { flatColor, MAP_COLOR_BLOCKS, type MapColorBlock } from '../../../shared/mapColors'

/** 这个版本能用的地图画方块 */
export function paletteFor(version: 12 | 16 | 17): MapColorBlock[] {
  return MAP_COLOR_BLOCKS.filter((b) => b.since <= version)
}

/** 人眼对红、绿、蓝的敏感程度不同：按 redmean 公式加权的颜色距离 */
function distance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rm = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
}

/**
 * 把图片（RGBA）换成最接近的地图颜色：返回每个像素用调色板里第几个方块（透明的像素用 -1）。
 * dither 为 true 时用 Floyd–Steinberg 抖动，渐变更自然
 */
export function quantize(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: MapColorBlock[],
  dither: boolean
): Int16Array {
  const colors = palette.map((b) => flatColor(b.rgb))
  const work = new Float32Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    work[i * 3] = rgba[i * 4]
    work[i * 3 + 1] = rgba[i * 4 + 1]
    work[i * 3 + 2] = rgba[i * 4 + 2]
  }
  const out = new Int16Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (rgba[i * 4 + 3] < 128) {
        out[i] = -1
        continue
      }
      const r = Math.min(255, Math.max(0, work[i * 3]))
      const g = Math.min(255, Math.max(0, work[i * 3 + 1]))
      const b = Math.min(255, Math.max(0, work[i * 3 + 2]))
      let best = 0
      let bestD = Infinity
      colors.forEach((c, k) => {
        const d = distance(r, g, b, c[0], c[1], c[2])
        if (d < bestD) {
          bestD = d
          best = k
        }
      })
      out[i] = best
      if (!dither) continue
      const [cr, cg, cb] = colors[best]
      const er = r - cr
      const eg = g - cg
      const eb = b - cb
      const spread = (dx: number, dy: number, f: number): void => {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny >= height) return
        const j = (ny * width + nx) * 3
        work[j] += er * f
        work[j + 1] += eg * f
        work[j + 2] += eb * f
      }
      spread(1, 0, 7 / 16)
      spread(-1, 1, 3 / 16)
      spread(0, 1, 5 / 16)
      spread(1, 1, 1 / 16)
    }
  }
  return out
}

/** 每种方块用了多少个 */
export function countBlocks(indices: Int16Array, palette: MapColorBlock[]): { block: MapColorBlock; count: number }[] {
  const counts = new Array<number>(palette.length).fill(0)
  for (const i of indices) if (i >= 0) counts[i]++
  return palette
    .map((block, i) => ({ block, count: counts[i] }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
}
