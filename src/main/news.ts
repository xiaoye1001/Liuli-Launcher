import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { NewsItem, NewsList } from '../shared/types'

/** 官方启动器使用的新闻数据 */
const NEWS_URL = 'https://launchercontent.mojang.com/v2/news.json'
const CONTENT_BASE = 'https://launchercontent.mojang.com/'
const CACHE_FILE = join(app.getPath('userData'), 'cache', 'news.json')
/** 一小时内不重复请求 */
const CACHE_TTL = 60 * 60 * 1000
const MAX_ITEMS = 12

interface RawEntry {
  id?: unknown
  title?: unknown
  tag?: unknown
  category?: unknown
  date?: unknown
  text?: unknown
  readMoreLink?: unknown
  newsType?: unknown
  playPageImage?: { url?: unknown }
  newsPageImage?: { url?: unknown }
  image?: { url?: unknown }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 只接受 https 地址；图片可能是相对路径 */
function httpsUrl(value: unknown, base?: string): string {
  const text = str(value)
  if (!text) return ''
  try {
    const url = new URL(text, base)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

/** 解析新闻数据：只保留 Java 版相关的新闻，按日期从新到旧 */
export function parseNews(raw: unknown): NewsItem[] {
  const entries = (raw as { entries?: unknown })?.entries
  if (!Array.isArray(entries)) return []
  const items: NewsItem[] = []
  for (const entry of entries as RawEntry[]) {
    if (!entry || typeof entry !== 'object') continue
    const types = Array.isArray(entry.newsType) ? entry.newsType.map(String) : []
    if (types.length > 0 && !types.some((t) => /java/i.test(t))) continue
    const title = str(entry.title)
    if (!title) continue
    const image = entry.playPageImage?.url ?? entry.newsPageImage?.url ?? entry.image?.url
    items.push({
      id: str(entry.id) || title,
      title,
      tag: str(entry.tag) || str(entry.category),
      date: str(entry.date),
      text: str(entry.text).replace(/<[^>]*>/g, ''),
      image: httpsUrl(image, CONTENT_BASE),
      link: httpsUrl(entry.readMoreLink)
    })
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ITEMS)
}

async function readCache(): Promise<{ fetchedAt: number; items: NewsItem[] } | null> {
  try {
    const data = JSON.parse(await readFile(CACHE_FILE, 'utf-8'))
    return typeof data?.fetchedAt === 'number' && Array.isArray(data.items) ? data : null
  } catch {
    return null
  }
}

/** 获取新闻：一小时内用缓存；网络失败时返回上次的缓存 */
export async function getNews(force = false): Promise<NewsList> {
  const cache = await readCache()
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return { items: cache.items, fetchedAt: cache.fetchedAt, offline: false }
  }
  try {
    const response = await fetch(NEWS_URL, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const items = parseNews(await response.json())
    const fetchedAt = Date.now()
    await mkdir(dirname(CACHE_FILE), { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify({ fetchedAt, items }), 'utf-8').catch(() => undefined)
    return { items, fetchedAt, offline: false }
  } catch (e) {
    if (cache) return { items: cache.items, fetchedAt: cache.fetchedAt, offline: true }
    throw new Error(`无法获取 Minecraft 新闻：${e instanceof Error ? e.message : String(e)}`)
  }
}
