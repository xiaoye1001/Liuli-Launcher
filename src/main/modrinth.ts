import { download } from '@xmcl/file-transfer'
import { downloadWithFallback } from './services/downloadWithFallback'
import { app, shell } from 'electron'
import { mkdir, readdir, rename, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getSettings } from './config'
import { assertGameStopped, fileSha1, listModFiles, modsContextOf, type ModsContext } from './mods'
import { downloadDispatcher, discardBody } from './network'
import { hasChinese, matchChineseName, zhNameBySlug } from '../shared/modNames'
import type {
  ModrinthInstallResult,
  ModUpdate,
  ModrinthProjectHit,
  ModrinthProjectVersion,
  ModrinthSearchResult,
  ResourceSearchFilters,
  ResourceTarget,
  ResourceType
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
  hashes: { sha1?: string; sha512?: string }
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  date_published?: string
  loaders?: string[]
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
      if (!response.ok) {
        await discardBody(response)
        throw new Error(`HTTP ${response.status}`)
      }
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

/** Modrinth 项目标识 → 项目 ID（中文名搜索用，项目 ID 不会变，记住后不用重复查） */
const slugToId = new Map<string, string>()

/**
 * 中文名搜索：关键字是中文时，先在中文名表里找到对应的模组，返回只搜索这些模组的条件（按匹配程度排好的项目 ID）。
 * 中文名表里没有时返回 null，照常搜索
 */
async function chineseSearch(query: string): Promise<{ facet: string[]; order: string[] } | null> {
  if (!hasChinese(query)) return null
  const slugs = matchChineseName(query)
    .map((entry) => entry.modrinth)
    .filter(Boolean)
  if (slugs.length === 0) return null
  const missing = slugs.filter((slug) => !slugToId.has(slug))
  if (missing.length > 0) {
    try {
      // /projects 的 ids 参数也接受项目标识
      const projects = await modrinthFetch<{ id: string; slug: string }[]>(
        `/projects?${new URLSearchParams({ ids: JSON.stringify(missing) })}`
      )
      // 只记住找到的；没找到的（例如镜像还没同步）下次再查
      for (const p of Array.isArray(projects) ? projects : []) {
        if (typeof p?.id === 'string' && missing.includes(p.slug)) slugToId.set(p.slug, p.id)
      }
    } catch {
      // 查不到中文名对应的项目时照常按关键字搜索，不让整个搜索失败
    }
  }
  const order = slugs.map((slug) => slugToId.get(slug)).filter((id): id is string => !!id)
  return order.length > 0 ? { facet: order.map((id) => `project_id:${id}`), order } : null
}

/** 中文名搜索的结果按中文名的匹配程度排序（最符合的在前） */
function byChineseOrder<T>(hits: T[], order: string[] | undefined, idOf: (hit: T) => string): T[] {
  if (!order) return hits
  return [...hits].sort((a, b) => order.indexOf(idOf(a)) - order.indexOf(idOf(b)))
}

/** 在 Modrinth 搜索适用于该版本（Minecraft 版本 + 加载器）的模组 */
export async function searchModrinth(versionId: string, query: string, offset = 0): Promise<ModrinthSearchResult> {
  const ctx = await modsContextOf(versionId)
  const loaders = loadersOf(ctx)
  const facets = [['project_type:mod'], loaders.map((l) => `categories:${l}`), [`versions:${ctx.minecraftVersion}`]]
  // 中文关键字：改为只搜索中文名对应的模组
  const chinese = await chineseSearch(query)
  if (chinese) facets.push(chinese.facet)
  const params = new URLSearchParams({
    query: chinese ? '' : query.trim(),
    facets: JSON.stringify(facets),
    index: query.trim() && !chinese ? 'relevance' : 'downloads',
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
    hits: byChineseOrder(result.hits, chinese?.order, (hit) => hit.project_id).map((hit) => ({
      projectId: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || undefined,
      downloads: hit.downloads,
      installed: installed.has(hit.project_id),
      zhName: zhNameBySlug('modrinth', hit.slug)
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

/** Modrinth 整合包规定的下载地址来源（导入、导出整合包时都只接受这些网站的 https 地址） */
export function isAllowedModpackUrl(url: string): boolean {
  return /^https:\/\/(cdn\.modrinth\.com|github\.com|raw\.githubusercontent\.com|gitlab\.com)\//.test(url)
}

/** Modrinth 文件的下载地址：选择 BMCLAPI 下载源时，cdn.modrinth.com 的文件先走镜像，失败再用原地址 */
export async function modrinthFileUrls(input: string[]): Promise<string[]> {
  // 接口或整合包给的下载地址只接受 https
  const urls = input.filter((u) => typeof u === 'string' && u.startsWith('https://'))
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
  if (!file.filename || file.filename !== basename(file.filename) || file.filename.startsWith('.')) {
    throw new Error(`文件名无效：${file.filename}`)
  }
  const urls = await modrinthFileUrls([file.url])
  await downloadWithFallback(
    {
      url: urls,
      destination: join(dir, file.filename),
      dispatcher: downloadDispatcher(),
      headers: { 'User-Agent': USER_AGENT },
      validator: file.hashes.sha1 ? { algorithm: 'sha1', hash: file.hashes.sha1 } : undefined
    },
    'mod'
  )
  // 记住刚下载的文件属于哪个项目，下次不用再向 Modrinth 查询
  if (file.hashes.sha1) hashToProject.set(file.hashes.sha1, version.project_id)
  return file.filename
}

/**
 * 从 Modrinth 安装模组：下载适用于该版本的最新版本，并自动安装缺少的必需前置模组
 */
export async function installFromModrinth(
  versionId: string,
  projectId: string,
  /** 指定要安装的 Modrinth 版本；不指定时自动选择适用于该游戏版本的最新版本 */
  modrinthVersionId?: string
): Promise<ModrinthInstallResult> {
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
    const version =
      !item.dependency && modrinthVersionId
        ? await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(modrinthVersionId)}`)
        : await pickVersion(item.projectId, ctx)
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

// ---------- 社区资源（模组、整合包、数据包、资源包、光影） ----------

/** 各类资源在 Modrinth 上的加载器分类 */
const LOADER_CATEGORIES = ['fabric', 'forge', 'neoforge', 'quilt', 'iris', 'optifine', 'canvas']

/** 资源类型对应的搜索条件。数据包在 Modrinth 上也可能是带 datapack 加载器的模组项目 */
function typeFacet(type: ResourceType): string[] {
  return type === 'datapack' ? ['project_type:datapack', 'categories:datapack'] : [`project_type:${type}`]
}

/** 在 Modrinth 搜索某类资源（无关键字时按下载量排序） */
export async function searchProjects(
  type: ResourceType,
  query: string,
  offset = 0,
  filters: ResourceSearchFilters = {}
): Promise<{ hits: ModrinthProjectHit[]; total: number }> {
  const facets = [typeFacet(type)]
  if (filters.gameVersion) facets.push([`versions:${filters.gameVersion}`])
  if (filters.loader) facets.push([`categories:${filters.loader}`])
  if (filters.category) facets.push([`categories:${filters.category}`])
  // 中文关键字搜索模组：改为只搜索中文名对应的模组
  const chinese = type === 'mod' ? await chineseSearch(query) : null
  if (chinese) facets.push(chinese.facet)
  const sorts = ['relevance', 'downloads', 'follows', 'newest', 'updated']
  const index =
    filters.sort && sorts.includes(filters.sort) ? filters.sort : query.trim() && !chinese ? 'relevance' : 'downloads'
  const params = new URLSearchParams({
    query: chinese ? '' : query.trim(),
    facets: JSON.stringify(facets),
    index,
    offset: String(offset),
    limit: '20'
  })
  const result = await modrinthFetch<{
    hits: {
      project_id: string
      slug?: string
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
  // 没有指定排序（或按相关度）时，中文名搜索的结果按匹配程度排序
  const hits =
    filters.sort && filters.sort !== 'relevance'
      ? result.hits
      : byChineseOrder(result.hits, chinese?.order, (hit) => hit.project_id)
  return {
    hits: hits.map((hit) => ({
      projectId: hit.project_id,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url || undefined,
      downloads: hit.downloads,
      loaders: (hit.categories ?? []).filter((c) => LOADER_CATEGORIES.includes(c)),
      // versions 按发布顺序排列，最后一个是最新支持的版本
      latestGameVersion: hit.versions?.[hit.versions.length - 1] ?? '',
      zhName: type === 'mod' ? zhNameBySlug('modrinth', hit.slug) : undefined
    })),
    total: result.total_hits
  }
}

/** 项目的版本列表（新版本在前）。整合包只保留带 .mrpack 文件的版本，数据包优先使用 .zip 文件 */
export async function getProjectVersions(projectId: string, type: ResourceType): Promise<ModrinthProjectVersion[]> {
  const versions = await modrinthFetch<
    (ModrinthVersion & { game_versions: string[]; loaders: string[]; date_published: string })[]
  >(`/project/${encodeURIComponent(projectId)}/version`)
  return versions
    .map((v) => ({ v, file: mainFile(v, type) }))
    .filter(({ file }) => (type === 'modpack' ? file?.filename.endsWith('.mrpack') : !!file))
    .map(({ v, file }) => ({
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      versionType: v.version_type,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      datePublished: v.date_published,
      fileName: file!.filename,
      fileSize: file!.size
    }))
}

/** 下载整合包的某个版本（.mrpack）到缓存目录，返回文件路径和整合包的项目 ID */
export async function downloadModpackFile(versionId: string): Promise<{ path: string; projectId: string }> {
  const version = await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`)
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file?.filename.endsWith('.mrpack')) throw new Error('这个版本没有整合包文件')
  const dir = join(app.getPath('userData'), 'cache', 'modpacks')
  await mkdir(dir, { recursive: true })
  const destination = join(dir, basename(file.filename))
  // 整合包文件直接用原下载方式（不进入高速下载器），下载后由下载页直接开始安装
  await download({
    url: await modrinthFileUrls([file.url]),
    destination,
    dispatcher: downloadDispatcher(),
    headers: { 'User-Agent': USER_AGENT },
    validator: file.hashes.sha1 ? { algorithm: 'sha1', hash: file.hashes.sha1 } : undefined
  })
  return { path: destination, projectId: version.project_id }
}

/** 版本中要下载的文件：数据包优先 .zip（同一版本可能同时带有模组 jar），其余用主文件 */
function mainFile(version: ModrinthVersion, type: ResourceType): ModrinthFile | undefined {
  if (type === 'datapack') {
    const zip = version.files.find((f) => f.filename.toLowerCase().endsWith('.zip'))
    if (zip) return zip
  }
  return version.files.find((f) => f.primary) ?? version.files[0]
}

/** 资源类型对应的游戏目录下的文件夹 */
const RESOURCE_FOLDERS: Record<Exclude<ResourceType, 'mod' | 'modpack' | 'datapack'>, string> = {
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
}

/** 存档文件夹名只允许是普通名字，防止 ../ 之类的路径 */
function assertSafeName(name: string): void {
  if (!name || name !== basename(name) || name === '.' || name === '..') throw new Error(`无效的存档名：${name}`)
}

/** 某个版本的存档列表（数据包需要安装到存档里） */
export async function listWorlds(versionId: string): Promise<string[]> {
  const gameDir = dirname((await modsContextOf(versionId)).dir)
  const saves = join(gameDir, 'saves')
  const names = await readdir(saves, { withFileTypes: true }).catch(() => [])
  const worlds: string[] = []
  for (const entry of names) {
    if (entry.isDirectory() && (await stat(join(saves, entry.name, 'level.dat')).catch(() => null)))
      worlds.push(entry.name)
  }
  return worlds.sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

/**
 * 安装社区资源的某个版本到指定游戏版本：
 * 模组放进 mods（并自动安装前置），资源包放进 resourcepacks，光影放进 shaderpacks，数据包放进所选存档的 datapacks
 */
export async function installResource(
  target: ResourceTarget,
  type: ResourceType,
  modrinthVersionId: string
): Promise<ModrinthInstallResult> {
  const version = await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(modrinthVersionId)}`)
  if (type === 'mod') return installFromModrinth(target.versionId, version.project_id, modrinthVersionId)
  if (type === 'modpack') throw new Error('整合包请通过安装整合包页面安装')

  assertGameStopped(target.versionId)
  const gameDir = dirname((await modsContextOf(target.versionId)).dir)
  let dir: string
  if (type === 'datapack') {
    if (!target.world) throw new Error('请选择要安装数据包的存档')
    assertSafeName(target.world)
    if (!(await stat(join(gameDir, 'saves', target.world)).catch(() => null)))
      throw new Error(`找不到存档：${target.world}`)
    dir = join(gameDir, 'saves', target.world, 'datapacks')
  } else {
    dir = join(gameDir, RESOURCE_FOLDERS[type])
  }
  await mkdir(dir, { recursive: true })

  const file = mainFile(version, type)
  if (!file) throw new Error(`${version.name} 没有可下载的文件`)
  await downloadWithFallback(
    {
      url: await modrinthFileUrls([file.url]),
      destination: join(dir, basename(file.filename)),
      dispatcher: downloadDispatcher(),
      headers: { 'User-Agent': USER_AGENT },
      validator: file.hashes.sha1 ? { algorithm: 'sha1', hash: file.hashes.sha1 } : undefined
    },
    'resource'
  )
  const project = await modrinthFetch<{ title: string }>(`/project/${encodeURIComponent(version.project_id)}`)
  return {
    installed: [{ projectId: version.project_id, title: project.title, fileName: file.filename, dependency: false }],
    missingDependencies: []
  }
}

// ---------- 模组更新 ----------

/**
 * 检查 mods 文件夹里的模组有没有新版本：按文件 SHA1 在 Modrinth 上识别，
 * 查询适用于当前 Minecraft 版本与加载器的最新版本。正式版的模组不会推荐升级到测试版
 */
export async function checkModUpdates(versionId: string): Promise<ModUpdate[]> {
  const ctx = await modsContextOf(versionId)
  const loaders = loadersOf(ctx)
  const files = await listModFiles(ctx.dir)
  const hashOf = new Map<string, string>()
  for (const name of files) {
    const hash = await fileSha1(join(ctx.dir, name)).catch(() => '')
    if (hash) hashOf.set(name, hash)
  }
  return findModrinthUpdates(hashOf, ctx.minecraftVersion, () => loaders)
}

/**
 * 按 SHA1 在 Modrinth 上查找文件的新版本（hashOf：文件名 → SHA1）。
 * loadersFor 根据当前版本声明的加载器，返回查询新版本时使用的加载器（相同加载器的文件一起查询）。
 * 正式版不会推荐升级到测试版；新版本的发布时间不能早于当前版本
 */
export async function findModrinthUpdates(
  hashOf: Map<string, string>,
  minecraftVersion: string,
  loadersFor: (current: string[]) => string[]
): Promise<ModUpdate[]> {
  const hashes = [...new Set(hashOf.values())]
  if (hashes.length === 0) return []
  const current = await modrinthFetch<Record<string, ModrinthVersion>>('/version_files', {
    method: 'POST',
    body: JSON.stringify({ hashes, algorithm: 'sha1' })
  })
  // 按查询用的加载器分组
  const groups = new Map<string, { loaders: string[]; hashes: string[] }>()
  for (const hash of hashes) {
    const now = current[hash]
    if (!now) continue
    const loaders = loadersFor(now.loaders ?? [])
    const key = JSON.stringify(loaders)
    const group = groups.get(key) ?? { loaders, hashes: [] }
    group.hashes.push(hash)
    groups.set(key, group)
  }
  if (groups.size === 0) return []
  const latest: Record<string, ModrinthVersion> = {}
  const loadersOfHash = new Map<string, string[]>()
  for (const group of groups.values()) {
    Object.assign(
      latest,
      await modrinthFetch<Record<string, ModrinthVersion>>('/version_files/update', {
        method: 'POST',
        body: JSON.stringify({
          hashes: group.hashes,
          algorithm: 'sha1',
          loaders: group.loaders,
          game_versions: [minecraftVersion]
        })
      })
    )
    for (const hash of group.hashes) loadersOfHash.set(hash, group.loaders)
  }

  const updates: ModUpdate[] = []
  for (const [fileName, hash] of hashOf) {
    const now = current[hash]
    let next: ModrinthVersion | undefined = latest[hash]
    if (!now || !next || next.id === now.id) continue
    // 当前是正式版、最新是测试版时，改为找最新的正式版
    if (next.version_type !== 'release' && now.version_type === 'release') {
      next = await pickRelease(now.project_id, loadersOfHash.get(hash) ?? [], minecraftVersion)
      if (!next || next.id === now.id) continue
    }
    // 发布时间比当前版本早的不算更新（例如当前版本不在筛选范围内时）
    if (now.date_published && next.date_published && next.date_published < now.date_published) continue
    const file = next.files.find((f) => f.primary) ?? next.files[0]
    if (!file || file.hashes.sha1 === hash) continue
    updates.push({
      fileName,
      projectId: now.project_id,
      title: '',
      currentVersion: now.version_number,
      newVersion: next.version_number,
      newVersionId: next.id,
      newFileName: file.filename,
      prerelease: next.version_type !== 'release'
    })
  }

  // 批量获取项目名称
  if (updates.length > 0) {
    try {
      const ids = [...new Set(updates.map((u) => u.projectId))]
      const projects = await modrinthFetch<{ id: string; title: string }[]>(
        `/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`
      )
      for (const u of updates) u.title = projects.find((p) => p.id === u.projectId)?.title ?? ''
    } catch {
      // 名称获取失败时界面显示文件名
    }
  }
  return updates
}

/** 下载 Modrinth 上的某个版本到文件夹，返回文件名 */
export async function downloadModrinthVersion(modrinthVersionId: string, dir: string): Promise<string> {
  const version = await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(modrinthVersionId)}`)
  return downloadVersionFile(version, dir)
}

/** 项目适用于该版本的最新正式版 */
async function pickRelease(
  projectId: string,
  loaders: string[],
  minecraftVersion: string
): Promise<ModrinthVersion | undefined> {
  const params = new URLSearchParams({
    loaders: JSON.stringify(loaders),
    game_versions: JSON.stringify([minecraftVersion])
  })
  const versions = await modrinthFetch<ModrinthVersion[]>(`/project/${encodeURIComponent(projectId)}/version?${params}`)
  return versions.find((v) => v.version_type === 'release')
}

/** 更新一个模组：下载新版本，旧文件移到回收站；原来禁用的模组更新后仍然禁用。返回新的文件名 */
export async function updateMod(versionId: string, fileName: string, modrinthVersionId: string): Promise<string> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  if (fileName !== basename(fileName) || !(await listModFiles(ctx.dir)).includes(fileName)) {
    throw new Error(`找不到模组文件：${fileName}`)
  }
  const version = await modrinthFetch<ModrinthVersion>(`/version/${encodeURIComponent(modrinthVersionId)}`)
  const disabled = fileName.endsWith('.disabled')
  const newName = await downloadVersionFile(version, ctx.dir)
  const finalName = disabled ? `${newName}.disabled` : newName
  if (disabled) {
    // 原来禁用的模组：旧文件移到回收站（新旧文件名相同时也要移走），新文件改回禁用的名字
    await shell.trashItem(join(ctx.dir, fileName))
    await rename(join(ctx.dir, newName), join(ctx.dir, finalName))
  } else if (fileName !== newName) {
    // 新旧文件名不同（版本号写在文件名里时）：旧文件移到回收站
    await shell.trashItem(join(ctx.dir, fileName))
  }
  return finalName
}

/** 按 SHA1 查询 Modrinth 上对应的文件（导出整合包时用于写下载地址），返回 SHA1 → 文件信息 */
export async function lookupModrinthFiles(
  hashes: string[]
): Promise<Map<string, { url: string; size: number; sha512?: string }>> {
  const result = new Map<string, { url: string; size: number; sha512?: string }>()
  for (let i = 0; i < hashes.length; i += 500) {
    const batch = hashes.slice(i, i + 500)
    const versions = await modrinthFetch<
      Record<string, ModrinthVersion & { files: (ModrinthFile & { hashes: { sha512?: string } })[] }>
    >('/version_files', { method: 'POST', body: JSON.stringify({ hashes: batch, algorithm: 'sha1' }) })
    for (const hash of batch) {
      const file = versions[hash]?.files.find((f) => f.hashes.sha1 === hash)
      if (file) result.set(hash, { url: file.url, size: file.size, sha512: file.hashes.sha512 })
    }
  }
  return result
}
