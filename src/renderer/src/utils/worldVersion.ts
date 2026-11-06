/**
 * 存档版本和游戏版本比较：存档的 level.dat 里记着最后一次用哪个版本打开（例如 1.21.1）。
 * 返回 newer（存档比游戏新：用旧版本打开可能损坏）、upgrade（存档是更早的大版本：打开会升级，之后旧版本打不开）、
 * same（相同或只差小版本），看不懂（快照名等）时返回 unknown
 */
export type WorldVersionRelation = 'newer' | 'upgrade' | 'same' | 'unknown'

function parse(text: string): number[] | null {
  const m = /^(\d+(?:\.\d+)*)(?:[-\s].*)?$/.exec(text.trim())
  return m ? m[1].split('.').map(Number) : null
}

function compare(a: number[], b: number[], length: number): number {
  for (let i = 0; i < length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function worldVersionRelation(worldVersion: string, gameVersion: string): WorldVersionRelation {
  const w = parse(worldVersion)
  const g = parse(gameVersion)
  if (!w || !g) return 'unknown'
  const full = Math.max(w.length, g.length)
  if (compare(w, g, full) > 0) return 'newer'
  // 只差最后一位小版本（例如 1.20.1 和 1.20.4）一般可以互相打开
  if (compare(w, g, 2) < 0) return 'upgrade'
  return 'same'
}
