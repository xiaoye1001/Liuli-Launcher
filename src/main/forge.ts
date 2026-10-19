import { getSettings } from './config'
import type { ForgeVersionInfo } from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const FORGE_MAVEN = 'https://maven.minecraftforge.net'
const FORGE_PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'

async function fetchChecked(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`)
  return response
}

/** 比较两个 Forge 版本号（如 47.3.10 与 47.3.9），新版本排在前面 */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 从 BMCLAPI 获取（返回 JSON，包含发布时间） */
async function listFromBmclapi(mc: string): Promise<{ version: string; date: string }[]> {
  const list = (await (await fetchChecked(`${BMCLAPI}/forge/minecraft/${encodeURIComponent(mc)}`)).json()) as {
    version: string
    modified?: string
  }[]
  if (!Array.isArray(list)) throw new Error('BMCLAPI 返回的 Forge 列表格式不正确')
  return list.map((item) => ({ version: item.version, date: item.modified ?? '' }))
}

/**
 * 从 Forge 官方 maven 的 maven-metadata.xml 获取。
 * 条目形如 1.20.1-47.3.0，老版本形如 1.7.10-10.13.4.1614-1.7.10。
 */
async function listFromOfficial(mc: string): Promise<{ version: string; date: string }[]> {
  const xml = await (await fetchChecked(`${FORGE_MAVEN}/net/minecraftforge/forge/maven-metadata.xml`)).text()
  const result: { version: string; date: string }[] = []
  for (const match of xml.matchAll(/<version>([^<]+)<\/version>/g)) {
    const full = match[1]
    if (!full.startsWith(`${mc}-`)) continue
    const version = full.slice(mc.length + 1).replace(new RegExp(`-${mc.replace(/\./g, '\\.')}$`), '')
    result.push({ version, date: '' })
  }
  return result
}

/** 官方推荐 / 最新版本标记（获取失败时忽略） */
async function getPromotions(): Promise<Record<string, string>> {
  try {
    const json = (await (await fetchChecked(FORGE_PROMOTIONS)).json()) as { promos?: Record<string, string> }
    return json.promos ?? {}
  } catch {
    return {}
  }
}

/** 获取某个 Minecraft 版本可用的 Forge 版本（新版本在前） */
export async function getForgeVersions(mc: string): Promise<ForgeVersionInfo[]> {
  const { downloadSource } = await getSettings()
  const sources =
    downloadSource === 'bmclapi' ? [listFromBmclapi, listFromOfficial] : [listFromOfficial, listFromBmclapi]

  let list: { version: string; date: string }[] | null = null
  const errors: string[] = []
  for (const source of sources) {
    try {
      list = await source(mc)
      break
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (!list) throw new Error(`获取 Forge 版本列表失败（${errors.join('；')}）`)

  const promos = await getPromotions()
  const unique = [...new Map(list.map((item) => [item.version, item])).values()]
  return unique
    .sort((a, b) => compareVersionDesc(a.version, b.version))
    .map((item) => ({
      version: item.version,
      mcversion: mc,
      recommended: promos[`${mc}-recommended`] === item.version,
      latest: promos[`${mc}-latest`] === item.version,
      date: item.date
    }))
}
