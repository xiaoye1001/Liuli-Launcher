import { download, getDefaultAgent } from '@xmcl/file-transfer'
import { app } from 'electron'
import { mkdir } from 'fs/promises'
import { basename, join } from 'path'
import { getSettings } from './config'
import { assertGameStopped, fileSha1, listModFiles, modsContextOf, type ModsContext } from './mods'
import type {
  ModrinthInstallResult,
  ModrinthModpack,
  ModrinthModpackVersion,
  ModrinthSearchResult
} from '../shared/types'

const OFFICIAL_API = 'https://api.modrinth.com/v2'
const OFFICIAL_CDN = 'https://cdn.modrinth.com/'
/** MCIM 镜像（国内常用的 Modrinth / CurseForge 镜像），失败时回退到官方 */
const MIRROR_API = 'https://mod.mcimirror.top/modrinth/v2'
const MIRROR_CDN = 'https://mod.mcimirror.top/'
const USER_AGENT = 'LiuliLauncher/0.1.0 (github.com/xiaoye1001/Liuli-Launcher)'

interface ModrinthFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1?: string }
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  files: ModrinthFile[]
  dependencies: { project_id?: string | null; version_id?: string | null; dependency_type: string }[]
}

/** 请求 Modrinth 接口：选择 BMCLAPI 下载源时先走镜像，失败再请求官方 */
async function modrinthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { downloadSource } = await getSettings()
  const bases = downloadSource === 'bmclapi' ? [MIRROR_API, OFFICIAL_API] : [OFFICIAL_API]
  let lastError: unknown
  for (const base of bases) {
    try {
      const response = await fetch(base + path, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(10000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as T
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`无法连接 Modrinth：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

/** 搜索与下载时使用的加载器：Quilt 也能加载 Fabric 模组，1.20.1 的 NeoForge 也能加载 Forge 模组 */
function loadersOf(ctx: ModsContext): string[] {
  switch (ctx.loader) {
    case 'fabric':
      return ['fabric']
    case 'quilt':
      return ['quilt', 'fabric']
    case 'forge':
      return ['forge']
    case 'neoforge':
      return ctx.minecraftVersion === '1.20.1' ? ['neoforge', 'forge'] : ['neoforge']
    default:
      throw new Error('该版本没有安装模组加载器，无法安装模组')
  }
}

/** 已识别的文件：SHA1 → Modrinth 项目 ID（null 表示 Modrinth 上没有这个文件） */
const hashToProject = new Map<string, string | null>()

/** 通过文件 SHA1 找出 mods 文件夹中已安装的 Modrinth 项目 */
async function installedProjects(dir: string): Promise<Set<string>> {
  const hashes = await Promise.all((await listModFiles(dir)).map((name) => fileSha1(join(dir, name)).catch(() => '')))
  const unknown = hashes.filter((h) => h && !hashToProject.has(h))
  if (unknown.length > 0) {
    try {
      const result = await modrinthFetch<Record<string, ModrinthVersion>>('/version_files', {
        method: 'POST',
        body: JSON.stringify({ hashes: unknown, algorithm: 'sha1' })
      })
      for (const hash of unknown) hashToProject.set(hash, result[hash]?.project_id ?? null)
    } catch {
      // 识别失败不影响搜索，只是不显示「已安装」
    }
  }
  return new Set(hashes.map((h) => hashToProject.get(h)).filter((id): id is string => !!id))
}

/** 在 Modrinth 搜索适用于该版本（Minecraft 版本 + 加载器）的模组 */
export async function searchModrinth(versionId: string, query: string, offset = 0): Promise<ModrinthSearchResult> {
  const ctx = await modsContextOf(versionId)
  const loaders = loadersOf(ctx)
  const facets = [['project_type:mod'], loaders.map((l) => `categories:${l}`), [`versions:${ctx.minecraftVersion}`]]
  const params = new URLSearchParams({
    query: query.trim(),
    facets: JSON.stringify(facets),
    index: query.trim() ? 'relevance' : 'downloads',
    offset: String(offset),
    limit: '20'
  })
  const [result, installed] = await Promise.all([
    modrinthFetch<{
      hits: {
        project_id: string
        slug: string
        title: string
        description: string
        author: string
        icon_url?: string
        downloads: number
      }[]
      total_hits: number
    }>(`/search?${params}`),
    installedProjects(ctx.dir)
  ])
  return {
    hits: result.hits.map((hit) => ({
      projectId: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || undefined,
      downloads: hit.downloads,
      installed: installed.has(hit.project_id)
    })),
    total: result.total_hits,
    minecraftVersion: ctx.minecraftVersion,
    loader: loaders[0]
  }
}

/** 选出项目适用于该版本的最新版本：优先正式版，没有再用测试版 */
async function pickVersion(projectId: string, ctx: ModsContext): Promise<ModrinthVersion | undefined> {
  const params = new URLSearchParams({
    loaders: JSON.stringify(loadersOf(ctx)),
    game_versions: JSON.stringify([ctx.minecraftVersion])
  })
  const versions = await modrinthFetch<ModrinthVersion[]>(`/project/${encodeURIComponent(projectId)}/version?${params}`)
  return versions.find((v) => v.version_type === 'release') ?? versions[0]
}

/** Modrinth 文件的下载地址：选择 BMCLAPI 下载源时，cdn.modrinth.com 的文件先走镜像，失败再用原地址 */
export async function modrinthFileUrls(urls: string[]): Promise<string[]> {
  const { downloadSource } = await getSettings()
  if (downloadSource !== 'bmclapi') return urls
  const mirrored = urls.filter((u) => u.startsWith(OFFICIAL_CDN)).map((u) => u.replace(OFFICIAL_CDN, MIRROR_CDN))
  return [...mirrored, ...urls]
}

export { USER_AGENT as MODRINTH_USER_AGENT }

/** 下载版本的主文件到 mods 文件夹，校验 SHA1 */
async function downloadVersionFile(version: ModrinthVersion, dir: string): Promise<string> {
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file) throw new Error(`${version.name} 没有可下载的文件`)
  const urls = await modrinthFileUrls([file.url])
  await download({
    url: urls,
    destination: join(dir, file.filename),
    dispatcher: getDefaultAgent({ maxRetries: 3 }),
    headers: { 'User-Agent': USER_AGENT },
    validator: file.hashes.sha1 ? { algorithm: 'sha1', hash: file.hashes.sha1 } : undefined
  })
  // 记住刚下载的文件属于哪个项目，下次不用再向 Modrinth 查询
  if (file.hashes.sha1) hashToProject.set(file.hashes.sha1, version.project_id)
  return file.filename
}

/**
 * 从 Modrinth 安装模组：下载适用于该版本的最新版本，并自动安装缺少的必需前置模组
 */
export async function installFromModrinth(versionId: string, projectId: string): Promise<ModrinthInstallResult> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  await mkdir(ctx.dir, { recursive: true })
  const installed = await installedProjects(ctx.dir)
  const result: ModrinthInstallResult = { installed: [], missingDependencies: [] }

  const queue: { projectId: string; dependency: boolean }[] = [{ projectId, dependency: false }]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const item = queue.shift()!
    if (visited.has(item.projectId) || (item.dependency && installed.has(item.projectId))) continue
    visited.add(item.projectId)
    // 前置模组最多安装 20 个，避免依赖关系异常时无限下载
    if (visited.size > 20) break

    const project = await modrinthFetch<{ title: string }>(`/project/${encodeURIComponent(item.projectId)}`)
    const version = await pickVersion(item.projectId, ctx)
    if (!version) {
      if (!item.dependency) {
        throw new Error(`${project.title} 没有适用于 ${ctx.minecraftVersion} ${loadersOf(ctx)[0]} 的版本`)
      }
      result.missingDependencies.push(project.title)
      continue
    }
    const fileName = await downloadVersionFile(version, ctx.dir)
    installed.add(item.projectId)
    result.installed.push({ projectId: item.projectId, title: project.title, fileName, dependency: item.dependency })

    for (const dep of version.dependencies) {
      if (dep.dependency_type !== 'required') continue
      let depProject = dep.project_id
      if (!depProject && dep.version_id) {
        depProject = (await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(dep.version_id)}`)).project_id
      }
      if (depProject) queue.push({ projectId: depProject, dependency: true })
    }
  }
  return result
}

// ---------- 整合包 ----------

const LOADER_CATEGORIES = ['fabric', 'forge', 'neoforge', 'quilt']

/** 在 Modrinth 搜索整合包（无关键字时按下载量排序） */
export async function searchModpacks(query: string, offset = 0): Promise<{ hits: ModrinthModpack[]; total: number }> {
  const params = new URLSearchParams({
    query: query.trim(),
    facets: JSON.stringify([['project_type:modpack']]),
    index: query.trim() ? 'relevance' : 'downloads',
    offset: String(offset),
    limit: '20'
  })
  const result = await modrinthFetch<{
    hits: {
      project_id: string
      title: string
      description: string
      author: string
      icon_url?: string
      downloads: number
      categories?: string[]
      versions?: string[]
    }[]
    total_hits: number
  }>(`/search?${params}`)
  return {
    hits: result.hits.map((hit) => ({
      projectId: hit.project_id,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || undefined,
      downloads: hit.downloads,
      loaders: (hit.categories ?? []).filter((c) => LOADER_CATEGORIES.includes(c)),
      // versions 按发布顺序排列，最后一个是最新支持的版本
      latestGameVersion: hit.versions?.[hit.versions.length - 1] ?? ''
    })),
    total: result.total_hits
  }
}

/** 整合包的版本列表（新版本在前，只保留带 .mrpack 文件的版本） */
export async function getModpackVersions(projectId: string): Promise<ModrinthModpackVersion[]> {
  const versions = await modrinthFetch<
    (ModrinthVersion & { game_versions: string[]; loaders: string[]; date_published: string })[]
  >(`/project/${encodeURIComponent(projectId)}/version`)
  return versions
    .map((v) => ({ v, file: v.files.find((f) => f.primary) ?? v.files[0] }))
    .filter(({ file }) => file?.filename.endsWith('.mrpack'))
    .map(({ v, file }) => ({
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      versionType: v.version_type,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      datePublished: v.date_published,
      fileSize: file.size
    }))
}

/** 下载整合包的某个版本（.mrpack）到缓存目录，返回文件路径 */
export async function downloadModpackFile(versionId: string): Promise<string> {
  const version = await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`)
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file?.filename.endsWith('.mrpack')) throw new Error('这个版本没有整合包文件')
  const dir = join(app.getPath('userData'), 'cache', 'modpacks')
  await mkdir(dir, { recursive: true })
  const destination = join(dir, basename(file.filename))
  await download({
    url: await modrinthFileUrls([file.url]),
    destination,
    dispatcher: getDefaultAgent({ maxRetries: 3 }),
    headers: { 'User-Agent': USER_AGENT },
    validator: file.hashes.sha1 ? { algorithm: 'sha1', hash: file.hashes.sha1 } : undefined
  })
  return destination
}
