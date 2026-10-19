import { getSettings } from './config'
import type { NeoForgeVersionInfo } from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const NEOFORGE_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`)
  return (await response.json()) as T
}

/**
 * NeoForge 的版本号与 Minecraft 版本的对应关系：
 * - 1.20.1：沿用 Forge 的格式，项目为 net.neoforged:forge，版本形如 1.20.1-47.1.106
 * - 1.20.2 及以后：项目为 net.neoforged:neoforge，版本号去掉开头的「1.」，例如 1.21.1 → 21.1.x，1.21 → 21.0.x
 * - 不以「1.」开头的新版本号（例如 26.1）：版本号以 Minecraft 版本开头
 */
function neoforgePrefix(mc: string): string {
  if (!mc.startsWith('1.')) return `${mc}.`
  const [, minor, patch = '0'] = mc.split('.')
  return `${minor}.${patch}.`
}

/** NeoForge 在 xmcl 中使用的项目名：1.20.1 为 forge，其余为 neoforge */
export function neoforgeProject(version: string): 'forge' | 'neoforge' {
  return /^1\.\d+(\.\d+)?-/.test(version) ? 'forge' : 'neoforge'
}

/** 比较版本号（新版本在前），测试版后缀不参与比较 */
function compareDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** BMCLAPI：返回 [{ rawVersion, version, mcversion }] */
async function listFromBmclapi(mc: string): Promise<string[]> {
  const list = await fetchJson<{ rawVersion?: string; version: string }[]>(
    `${BMCLAPI}/neoforge/list/${encodeURIComponent(mc)}`
  )
  if (!Array.isArray(list)) throw new Error('BMCLAPI 返回的 NeoForge 列表格式不正确')
  return list.map((item) => {
    const raw = item.rawVersion ?? item.version
    if (raw.startsWith('neoforge-')) return raw.slice('neoforge-'.length)
    if (raw.startsWith('forge-')) return raw.slice('forge-'.length)
    return raw
  })
}

/** NeoForge 官方 maven 接口：返回该项目的全部版本，按 Minecraft 版本过滤 */
async function listFromOfficial(mc: string): Promise<string[]> {
  if (mc === '1.20.1') {
    const { versions } = await fetchJson<{ versions: string[] }>(`${NEOFORGE_API}/forge`)
    return versions.filter((v) => v.startsWith('1.20.1-'))
  }
  const { versions } = await fetchJson<{ versions: string[] }>(`${NEOFORGE_API}/neoforge`)
  const prefix = neoforgePrefix(mc)
  return versions.filter((v) => v.startsWith(prefix))
}

/** 获取某个 Minecraft 版本可用的 NeoForge 版本（新版本在前） */
export async function getNeoForgeVersions(mc: string): Promise<NeoForgeVersionInfo[]> {
  const { downloadSource } = await getSettings()
  const sources =
    downloadSource === 'bmclapi' ? [listFromBmclapi, listFromOfficial] : [listFromOfficial, listFromBmclapi]

  const errors: string[] = []
  for (const source of sources) {
    try {
      const versions = [...new Set(await source(mc))]
      return versions.sort(compareDesc).map((version) => ({ version, beta: /beta|alpha|rc/i.test(version) }))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  throw new Error(`获取 NeoForge 版本列表失败（${errors.join('；')}）`)
}
