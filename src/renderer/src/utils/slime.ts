/**
 * 史莱姆区块（Java 版）：和游戏里的算法完全一样。
 * 游戏用 java.util.Random，种子由世界种子和区块坐标算出，nextInt(10) == 0 就是史莱姆区块。
 * 中间的乘法按 Java 的 32 位整数溢出处理，Random 的 48 位运算用 BigInt
 */
const MASK48 = (1n << 48n) - 1n
const MULTIPLIER = 0x5deece66dn
const MASK64 = (1n << 64n) - 1n

/** 转成 Java long（64 位有符号） */
function toLong(n: bigint): bigint {
  return BigInt.asIntN(64, n & MASK64)
}

function chunkSeed(worldSeed: bigint, x: number, z: number): bigint {
  const a = Math.imul(Math.imul(x, x), 0x4c1906)
  const b = Math.imul(x, 0x5ac0db)
  const c = BigInt(Math.imul(z, z)) * 0x4307a7n
  const d = Math.imul(z, 0x5f24f)
  return toLong(toLong(worldSeed + BigInt(a) + BigInt(b) + c + BigInt(d)) ^ 0x3ad8025fn)
}

/** java.util.Random(seed).nextInt(10) */
function nextInt10(seed: bigint): number {
  let state = (seed ^ MULTIPLIER) & MASK48
  const next31 = (): number => {
    state = (state * MULTIPLIER + 0xbn) & MASK48
    return Number(state >> 17n)
  }
  let u = next31()
  let r = u % 10
  // Java 的拒绝采样：u - r + 9 溢出成负数时重新取
  while (u - r + 9 > 0x7fffffff) {
    u = next31()
    r = u % 10
  }
  return r
}

export function isSlimeChunk(worldSeed: bigint, chunkX: number, chunkZ: number): boolean {
  return nextInt10(chunkSeed(worldSeed, chunkX | 0, chunkZ | 0)) === 0
}
