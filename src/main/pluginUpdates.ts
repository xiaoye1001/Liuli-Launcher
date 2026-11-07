/**
 * 插件更新检查：manifest 里写了 updates.github（GitHub 仓库 owner/repo）的插件，
 * 看这个仓库最新发布的版本号，比装着的新时提醒；点「更新」时下载发布里的 .zip，
 * 和手动安装一样检查、列出权限（新增的权限标出来），用户同意后才装上。
 *
 * 安全：只访问 api.github.com 和 GitHub 放发布文件的网站（每次跳转都检查），下载最多 30 MB；
 * 下载的插件 id 必须和装着的一样
 */
import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { discardPlugin, listPlugins, preparePlugin } from './plugins'
import { compareVersions } from './updater'
import type { PluginPending, PluginUpdate } from '../shared/types'

const CACHE_FILE = join(app.getPath('userData'), 'plugins', 'updates.json')
const TMP_DIR = join(app.getPath('userData'), 'plugins', '.pending')
/** 自动检查的间隔 */
const CHECK_EVERY = 24 * 60 * 60 * 1000
const MAX_ZIP = 30 * 1024 * 1024
/** 下载发布文件时允许跳转到的网站 */
const DOWNLOAD_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']

interface Cache {
  checkedAt: number
  /** 插件 id → 有新版本时的信息 */
  updates: Record<string, PluginUpdate>
}

let cache: Cache | null = null

async function readCache(): Promise<Cache> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(CACHE_FILE, 'utf-8')) as Partial<Cache>
    cache = {
      checkedAt: Number(raw.checkedAt) || 0,
      updates: raw.updates && typeof raw.updates === 'object' ? (raw.updates as Record<string, PluginUpdate>) : {}
    }
  } catch {
    cache = { checkedAt: 0, updates: {} }
  }
  return cache
}

async function writeCache(next: Cache): Promise<void> {
  cache = next
  await mkdir(join(CACHE_FILE, '..'), { recursive: true })
  await writeFile(CACHE_FILE, JSON.stringify(next), 'utf-8')
}

interface Release {
  tag_name?: unknown
  html_url?: unknown
  body?: unknown
  assets?: { name?: unknown; browser_download_url?: unknown; size?: unknown }[]
}

/** 发布里给这个插件用的 zip：名字里有插件 id 的优先，否则用第一个 zip */
export function pickPluginAsset(release: Release, id: string): { url: string; size: number } | null {
  const zips = (Array.isArray(release.assets) ? release.assets : []).filter(
    (a) =>
      typeof a.name === 'string' &&
      /\.zip$/i.test(a.name) &&
      typeof a.browser_download_url === 'string' &&
      a.browser_download_url.startsWith('https://github.com/')
  )
  const asset = zips.find((a) => String(a.name).toLowerCase().includes(id)) ?? zips[0]
  return asset ? { url: String(asset.browser_download_url), size: Number(asset.size) || 0 } : null
}

async function latestRelease(repo: string): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LiuliLauncher' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })
  if (response.status === 404) throw new Error('这个仓库还没有发布')
  if (!response.ok) throw new Error(`GitHub 回复了 ${response.status}`)
  return (await response.json()) as Release
}

let inflight: Promise<Record<string, PluginUpdate>> | null = null

/** 检查所有插件的更新；不到一天检查过时直接用上次的结果（force 时一定检查）；同时只查一次 */
export function checkPluginUpdates(force = false): Promise<Record<string, PluginUpdate>> {
  if (inflight) return inflight
  inflight = doCheck(force).finally(() => {
    inflight = null
  })
  return inflight
}

async function doCheck(force: boolean): Promise<Record<string, PluginUpdate>> {
  const old = await readCache()
  const plugins = (await listPlugins()).filter((p) => !p.error && p.updates)
  if (!force && Date.now() - old.checkedAt < CHECK_EVERY) {
    // 已经更新到新版本的去掉
    const updates: Record<string, PluginUpdate> = {}
    for (const p of plugins) {
      const u = old.updates[p.id]
      if (u && compareVersions(u.version, p.version) > 0) updates[p.id] = u
    }
    return updates
  }
  const updates: Record<string, PluginUpdate> = {}
  for (const p of plugins) {
    try {
      const release = await latestRelease(p.updates!.github)
      const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : ''
      if (!version || compareVersions(version, p.version) <= 0) continue
      const asset = pickPluginAsset(release, p.id)
      const page = typeof release.html_url === 'string' && release.html_url.startsWith('https://github.com/')
      updates[p.id] = {
        version: version.slice(0, 20),
        notes: typeof release.body === 'string' ? release.body.slice(0, 2000) : '',
        page: page ? String(release.html_url) : `https://github.com/${p.updates!.github}/releases`,
        download: asset?.url ?? null
      }
    } catch {
      // 一个插件检查失败不影响别的（没联网、仓库删了）
    }
  }
  await writeCache({ checkedAt: Date.now(), updates })
  return updates
}

/** 下载：每次跳转都检查网站，最多 30 MB */
async function downloadZip(url: string): Promise<Buffer> {
  let current = url
  for (let i = 0; i < 5; i++) {
    const host = new URL(current)
    if (host.protocol !== 'https:' || !DOWNLOAD_HOSTS.includes(host.hostname)) throw new Error('下载地址不是 GitHub')
    const response = await fetch(current, {
      headers: { 'User-Agent': 'LiuliLauncher', Accept: 'application/octet-stream' },
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000)
    })
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location')
      await response.body?.cancel().catch(() => undefined)
      if (!next) throw new Error('下载地址跳转不对')
      current = new URL(next, current).toString()
      continue
    }
    if (!response.ok) throw new Error(`下载失败（${response.status}）`)
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_ZIP) {
        await reader.cancel().catch(() => undefined)
        throw new Error('插件太大了（超过 30 MB）')
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  throw new Error('下载地址跳转太多次')
}

/** 下载新版本并检查，返回等用户确认的安装（和手动安装一样） */
export async function preparePluginUpdate(id: unknown): Promise<PluginPending> {
  const plugin = (await listPlugins()).find((p) => p.id === id)
  if (!plugin || plugin.error) throw new Error('找不到这个插件')
  const update = (await checkPluginUpdates())[plugin.id]
  if (!update) throw new Error('这个插件没有新版本')
  if (!update.download) throw new Error('新版本的发布里没有插件 zip，请到发布页面手动下载')
  const data = await downloadZip(update.download)
  await mkdir(TMP_DIR, { recursive: true })
  const file = join(TMP_DIR, `update-${randomBytes(8).toString('hex')}.zip`)
  try {
    await writeFile(file, data)
    const pending = await preparePlugin(file)
    if (pending.manifest.id !== plugin.id) {
      await discardPlugin(pending.token)
      throw new Error(`下载的是另一个插件（${pending.manifest.id}），不是「${plugin.name}」`)
    }
    return pending
  } finally {
    await rm(file, { force: true }).catch(() => undefined)
  }
}

/** 启动器打开一会儿后检查一次（一天最多一次） */
export function schedulePluginUpdateCheck(): void {
  setTimeout(() => void checkPluginUpdates().catch(() => undefined), 30_000)
}
