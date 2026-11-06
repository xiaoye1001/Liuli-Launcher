/**
 * 模组版本范围判断：Fabric / Quilt 的语义化版本写法（>=1.2、^1.2、1.2.x、*，空格表示同时满足）
 * 和 Forge / NeoForge 的 Maven 写法（[1.0,2.0)、(,1.0]、[1.0,)）。
 * 判断不了（版本号或范围写法不认识）时返回 undefined，调用方据此不报冲突，避免误报。
 */

interface ParsedVersion {
  nums: number[]
  /** 预发布标记（-beta.1 之类）；正式版为空 */
  pre: string
}

/** 解析版本号：去掉 + 后面的构建信息，必须以数字开头 */
export function parseVersion(text: string): ParsedVersion | undefined {
  const clean = text.trim().replace(/^v/i, '').split('+')[0]
  // 整个都要是版本号（例如 24w14a 这样的快照名、mc1.20-1.0 这样的写法看不懂，返回 undefined）
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(clean)
  if (!match) return undefined
  return { nums: match[1].split('.').map(Number), pre: match[2] ?? '' }
}

function comparePre(a: string, b: string): number {
  if (a === b) return 0
  // 没有预发布标记的正式版更大
  if (!a) return 1
  if (!b) return -1
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1
    if (pb[i] === undefined) return 1
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1
    }
  }
  return 0
}

export function compareParsed(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  return comparePre(a.pre, b.pre)
}

/** 一条比较：>=1.2.3、<2、1.2.x、^1.2、~1.2.3、=1.0 */
function matchComparator(token: string, version: ParsedVersion): boolean | undefined {
  if (token === '*' || token === 'x' || token === 'X') return true
  const match = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token)
  if (!match) return undefined
  const op = match[1] ?? ''
  const body = match[2].trim()
  // 1.2.x、1.x 这类通配写法
  if (/(^|\.)[xX*]($|\.)/.test(body)) {
    if (op && op !== '=') return undefined
    const prefix = body.split('.').filter((p) => !/^[xX*]$/.test(p))
    if (!prefix.every((p) => /^\d+$/.test(p))) return undefined
    return prefix.every((p, i) => (version.nums[i] ?? 0) === Number(p))
  }
  const target = parseVersion(body)
  if (!target) return undefined
  const cmp = compareParsed(version, target)
  switch (op) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '^': {
      // 主版本号相同且不低于目标；0.x 时次版本号也要相同
      if (cmp < 0) return false
      if ((target.nums[0] ?? 0) === 0 && target.nums.length > 1) {
        return (version.nums[0] ?? 0) === 0 && (version.nums[1] ?? 0) === (target.nums[1] ?? 0)
      }
      return (version.nums[0] ?? 0) === (target.nums[0] ?? 0)
    }
    case '~':
      // 主版本号、次版本号相同且不低于目标
      return (
        cmp >= 0 && (version.nums[0] ?? 0) === (target.nums[0] ?? 0) && (version.nums[1] ?? 0) === (target.nums[1] ?? 0)
      )
    default:
      return cmp === 0
  }
}

/** Fabric / Quilt 写法：空格分隔的多条要同时满足；|| 分隔的任意一组满足即可 */
function matchSemverRange(range: string, version: ParsedVersion): boolean | undefined {
  let unknown = false
  for (const group of range.split('||')) {
    const tokens = group
      .trim()
      .replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
      .split(/\s+/)
      .filter(Boolean)
    if (tokens.length === 0) return true
    let all: boolean | undefined = true
    for (const token of tokens) {
      const result = matchComparator(token, version)
      if (result === undefined) {
        all = undefined
        break
      }
      if (!result) {
        all = false
        break
      }
    }
    if (all === true) return true
    if (all === undefined) unknown = true
  }
  return unknown ? undefined : false
}

/** Maven 写法：[1.0,2.0)、(,1.0]、[1.0]，多个区间用逗号连接时任意一个满足即可 */
function matchMavenRange(range: string, version: ParsedVersion): boolean | undefined {
  const intervals = range.match(/[[(][^\])]*[\])]/g)
  if (!intervals || intervals.join(',').replace(/\s/g, '') !== range.replace(/\s/g, '')) return undefined
  let unknown = false
  for (const interval of intervals) {
    const open = interval[0]
    const close = interval[interval.length - 1]
    const parts = interval.slice(1, -1).split(',')
    if (parts.length === 1) {
      const exact = parseVersion(parts[0])
      if (!exact) {
        unknown = true
        continue
      }
      if (compareParsed(version, exact) === 0) return true
      continue
    }
    if (parts.length !== 2) return undefined
    const low = parts[0].trim() ? parseVersion(parts[0]) : null
    const high = parts[1].trim() ? parseVersion(parts[1]) : null
    if (low === undefined || high === undefined) {
      unknown = true
      continue
    }
    const aboveLow = !low || (open === '[' ? compareParsed(version, low) >= 0 : compareParsed(version, low) > 0)
    const belowHigh = !high || (close === ']' ? compareParsed(version, high) <= 0 : compareParsed(version, high) < 0)
    if (aboveLow && belowHigh) return true
  }
  return unknown ? undefined : false
}

/**
 * 版本是否在范围内。范围为空或 * 时总是 true；
 * Maven 写法（Forge / NeoForge）里不带括号的单个版本（例如 "1.0"）只是推荐版本，按 Maven 的规则当作任意版本。
 */
export function versionInRange(
  range: string,
  versionText: string,
  format: 'semver' | 'maven' = 'semver'
): boolean | undefined {
  const value = range.trim()
  if (!value || value === '*') return true
  if (format === 'maven' && !/^[[(]/.test(value)) return true
  const version = parseVersion(versionText)
  if (!version) return undefined
  if (format === 'maven') return matchMavenRange(value, version)
  return matchSemverRange(value, version)
}
