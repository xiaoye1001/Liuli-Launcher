import { getVersionList } from '@xmcl/installer'
import type { DownloadSource, VersionEntry, VersionManifest } from '../shared/types'

const MANIFEST_URLS: Record<DownloadSource, string> = {
  mojang: 'https://launchermeta.mojang.com/mc/game/version_manifest.json',
  bmclapi: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json'
}

/** 带超时与状态码检查的 fetch */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response
}

let cache: VersionManifest | null = null

async function fetchFrom(source: DownloadSource): Promise<VersionManifest> {
  const list = await getVersionList({ remote: MANIFEST_URLS[source], fetch: fetchWithTimeout })
  return {
    latest: list.latest,
    versions: list.versions.map(
      (v): VersionEntry => ({
        id: v.id,
        type: v.type as VersionEntry['type'],
        releaseTime: v.releaseTime
      })
    ),
    source
  }
}

/**
 * 获取 Minecraft 版本清单。
 * 优先使用设置中的下载源，失败时自动尝试另一个源；结果在本次运行期间缓存。
 */
export async function getVersionManifest(preferred: DownloadSource, force = false): Promise<VersionManifest> {
  if (cache && !force) return cache

  const order: DownloadSource[] = preferred === 'bmclapi' ? ['bmclapi', 'mojang'] : ['mojang', 'bmclapi']
  const errors: string[] = []
  for (const source of order) {
    try {
      cache = await fetchFrom(source)
      return cache
    } catch (e) {
      errors.push(`${source}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`获取版本列表失败（${errors.join('；')}）`)
}
