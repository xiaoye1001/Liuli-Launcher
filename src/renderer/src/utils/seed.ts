/**
 * Minecraft 的世界种子：输入数字时就是这个数（64 位整数范围内）；输入文字或超出范围的数字时，
 * 游戏用 Java 的 String.hashCode 把它变成数字。返回十进制字符串，输入为空时返回 null
 */
const MIN = -(2n ** 63n)
const MAX = 2n ** 63n - 1n

export function effectiveSeed(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^[-+]?\d{1,20}$/.test(text)) {
    const n = BigInt(text)
    if (n >= MIN && n <= MAX) return n.toString()
  }
  // Java String.hashCode：按 UTF-16 编码单元计算，结果是 32 位有符号整数
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0
  return String(hash)
}

/** 种子是不是文字（或超出范围的数字），游戏会把它换成别的数字 */
export function isTextSeed(input: string): boolean {
  const text = input.trim()
  if (!text) return false
  if (!/^[-+]?\d{1,20}$/.test(text)) return true
  const n = BigInt(text)
  return n < MIN || n > MAX
}

/** Chunkbase 的种子地图（第三方网站，在系统浏览器里打开） */
export function seedMapUrl(seed: string, x?: number, z?: number): string | null {
  const value = effectiveSeed(seed)
  if (!value) return null
  const params = new URLSearchParams({ seed: value, dimension: 'overworld' })
  if (x !== undefined && z !== undefined) {
    params.set('x', String(Math.round(x)))
    params.set('z', String(Math.round(z)))
  }
  return `https://www.chunkbase.com/apps/seed-map#${params.toString()}`
}
