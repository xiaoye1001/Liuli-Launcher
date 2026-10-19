/**
 * 百宝箱：清理游戏垃圾缓存。
 *
 * 可以清理的内容（都可以随时删除，不影响存档、模组、设置）：
 * - logs：游戏日志（保留最近一次的 latest.log、debug.log，分享日志要用）
 * - crash：崩溃报告、Java 崩溃日志（hs_err_pid*.log、replay_pid*.log）
 * - partial：下载中断留下的临时文件（*.liuli-part），正在进行的下载不会删
 * - cache：启动器缓存（OptiFine 安装器、新闻、一天前下载的整合包）和自动更新留下的安装包
 * - assets：没有任何已安装版本使用的资源文件（声音、语言等，需要时启动前会重新下载）
 *
 * 界面只传要清理的类别，删除前重新扫描，不接受界面传来的路径。游戏运行或正在安装时不能清理。
 */
import { app } from 'electron'
import { Version } from '@xmcl/core'
import { lstat, readdir, readFile, rm, stat } from 'fs/promises'
import { join } from 'path'
import { getSettings } from './config'
import { getGameStatus } from './launch'
import { getInstallStatus } from './install'
import { getUpdateDownload } from './updater'
import { listFastDownloads } from './services/fastDownloader'
import type { CleanCategory, CleanItem, CleanResult, CleanScan } from '../shared/types'

const CATEGORIES: CleanCategory[] = ['logs', 'crash', 'partial', 'cache', 'assets']
/** 下载临时文件扫描时跳过的大文件夹（存档里文件很多，资源和依赖库不会有这种临时文件） */
const PARTIAL_SKIP = new Set(['saves', 'assets', 'libraries', 'screenshots', 'backups'])
const DAY = 24 * 60 * 60 * 1000

interface FoundFile {
  path: string
  bytes: number
}

/**
 * 要扫描的文件夹本身是不是真正的文件夹。logs、crash-reports 这些文件夹可能是指向别处的符号链接或
 * Windows 目录联接（例如别人分享的游戏目录把 logs 链到了「文档」），这种不扫描，免得删到别处的文件
 */
async function isRealDir(dir: string): Promise<boolean> {
  const info = await lstat(dir).catch(() => null)
  return !!info && info.isDirectory() && !info.isSymbolicLink()
}

/** 列出文件夹里的文件（不跟随符号链接），filter 返回 true 的才保留 */
async function filesIn(dir: string, filter: (name: string) => boolean): Promise<FoundFile[]> {
  if (!(await isRealDir(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const result: FoundFile[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !filter(entry.name)) continue
    const path = join(dir, entry.name)
    const info = await stat(path).catch(() => null)
    if (info) result.push({ path, bytes: info.size })
  }
  return result
}

/** 递归列出文件（不跟随符号链接），depth 为最多进入几层 */
async function walk(
  dir: string,
  depth: number,
  filter: (name: string, path: string) => boolean,
  skip: Set<string> = new Set(),
  minAge = 0
): Promise<FoundFile[]> {
  if (!(await isRealDir(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const result: FoundFile[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (depth > 0 && !skip.has(entry.name)) result.push(...(await walk(path, depth - 1, filter, skip, minAge)))
    } else if (entry.isFile() && filter(entry.name, path)) {
      const info = await stat(path).catch(() => null)
      if (info && Date.now() - info.mtimeMs >= minAge) result.push({ path, bytes: info.size })
    }
  }
  return result
}

/** 游戏目录本身和每个版本自己的文件夹（版本隔离时日志、崩溃报告在版本文件夹里） */
async function instanceDirs(gameDir: string): Promise<string[]> {
  const versionsDir = join(gameDir, 'versions')
  const entries = await readdir(versionsDir, { withFileTypes: true }).catch(() => [])
  return [gameDir, ...entries.filter((e) => e.isDirectory()).map((e) => join(versionsDir, e.name))]
}

async function findLogs(gameDir: string): Promise<FoundFile[]> {
  const result: FoundFile[] = []
  for (const dir of await instanceDirs(gameDir)) {
    // 最近一次的日志保留（分享日志、崩溃分析会用到）
    result.push(...(await walk(join(dir, 'logs'), 2, (name) => name !== 'latest.log' && name !== 'debug.log')))
  }
  return result
}

async function findCrash(gameDir: string): Promise<FoundFile[]> {
  const result: FoundFile[] = []
  for (const dir of await instanceDirs(gameDir)) {
    result.push(...(await filesIn(join(dir, 'crash-reports'), () => true)))
    result.push(...(await filesIn(dir, (name) => /^(hs_err|replay)_pid\d+\.log$/.test(name))))
  }
  return result
}

async function findPartial(gameDir: string): Promise<FoundFile[]> {
  // 正在进行或暂停的下载的临时文件不能删
  const active = listFastDownloads()
    .filter((t) => t.status === 'downloading' || t.status === 'paused' || t.status === 'fallback_retrying')
    .map((t) => `${t.destination}.`)
  return walk(
    gameDir,
    5,
    (name, path) => name.endsWith('.liuli-part') && !active.some((prefix) => path.startsWith(prefix)),
    PARTIAL_SKIP
  )
}

async function findCache(): Promise<FoundFile[]> {
  const userData = app.getPath('userData')
  const cacheDir = join(userData, 'cache')
  // 下载好、可能还没安装的整合包：只清理一天前的
  const result = await walk(cacheDir, 3, (_, path) => !path.startsWith(join(cacheDir, 'modpacks')))
  result.push(...(await walk(join(cacheDir, 'modpacks'), 2, () => true, new Set(), DAY)))
  // 自动更新的安装包：正在下载或已下载好等待安装时不删
  if (getUpdateDownload().state === 'idle') result.push(...(await walk(join(userData, 'updates'), 3, () => true)))
  return result
}

/** 没有任何已安装版本使用的资源文件；有版本无法解析时返回 null（无法确定，不清理） */
async function findUnusedAssets(gameDir: string): Promise<FoundFile[] | null> {
  const versionsDir = join(gameDir, 'versions')
  const ids = (await readdir(versionsDir, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
  const used = new Set<string>()
  for (const id of ids) {
    // 没有 json 的文件夹不是版本（例如删除版本后残留的空文件夹）
    if (!(await stat(join(versionsDir, id, `${id}.json`)).catch(() => null))) continue
    try {
      const version = await Version.parse(gameDir, id)
      used.add(version.assetIndex?.id ?? version.assets)
    } catch {
      return null
    }
  }
  // 一个版本都没有时不清理（可能是游戏目录选错了）
  if (used.size === 0) return null
  const indexesDir = join(gameDir, 'assets', 'indexes')
  const keep = new Set<string>()
  for (const index of used) {
    try {
      const json = JSON.parse(await readFile(join(indexesDir, `${index}.json`), 'utf-8')) as {
        objects?: Record<string, { hash?: string }>
      }
      for (const object of Object.values(json.objects ?? {})) {
        if (object && typeof object.hash === 'string') keep.add(object.hash.toLowerCase())
      }
    } catch {
      // 索引文件不存在或损坏：说明资源文件本来就不完整，无法确定哪些没用到
      return null
    }
  }
  const unusedObjects = await walk(
    join(gameDir, 'assets', 'objects'),
    1,
    (name) => /^[0-9a-f]{40}$/.test(name) && !keep.has(name)
  )
  const unusedIndexes = await filesIn(indexesDir, (name) => name.endsWith('.json') && !used.has(name.slice(0, -5)))
  return [...unusedObjects, ...unusedIndexes]
}

async function find(category: CleanCategory, gameDir: string): Promise<FoundFile[] | null> {
  switch (category) {
    case 'logs':
      return findLogs(gameDir)
    case 'crash':
      return findCrash(gameDir)
    case 'partial':
      return findPartial(gameDir)
    case 'cache':
      return findCache()
    case 'assets':
      return findUnusedAssets(gameDir)
  }
}

function assertIdle(): void {
  const game = getGameStatus()
  if (game.state === 'launching' || game.state === 'running') throw new Error('游戏正在运行，请退出游戏后再清理')
  if (getInstallStatus()?.state === 'running') throw new Error('正在下载或安装游戏，请等待完成后再清理')
}

let cleaning = false

/** 扫描当前游戏目录里可以清理的内容 */
export async function scanCleanup(): Promise<CleanScan> {
  const { gameDir } = await getSettings()
  const items: CleanItem[] = []
  let assetsReliable = true
  for (const category of CATEGORIES) {
    const files = await find(category, gameDir)
    if (files === null) {
      assetsReliable = false
      continue
    }
    items.push({ category, count: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0) })
  }
  return { gameDir, items, assetsReliable }
}

/** 清理选中的类别：重新扫描后删除 */
export async function runCleanup(input: unknown): Promise<CleanResult> {
  const categories = (Array.isArray(input) ? input : []).filter((c): c is CleanCategory =>
    CATEGORIES.includes(c as CleanCategory)
  )
  if (categories.length === 0) throw new Error('请选择要清理的内容')
  if (cleaning) throw new Error('正在清理，请稍候')
  assertIdle()
  cleaning = true
  try {
    const { gameDir } = await getSettings()
    const result: CleanResult = { count: 0, bytes: 0, failed: 0 }
    for (const category of categories) {
      for (const file of (await find(category, gameDir)) ?? []) {
        try {
          await rm(file.path, { force: true })
          result.count++
          result.bytes += file.bytes
        } catch {
          result.failed++
        }
      }
    }
    return result
  } finally {
    cleaning = false
  }
}
