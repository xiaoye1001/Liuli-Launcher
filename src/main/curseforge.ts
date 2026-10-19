import { app } from 'electron'
import { download } from '@xmcl/file-transfer'
import { downloadWithFallback } from './services/downloadWithFallback'
import { mkdir, readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getSettings } from './config'
import { assertGameStopped, modsContextOf, type ModsContext } from './mods'
import { downloadDispatcher } from './network'
import type {
  ModrinthInstallResult,
  ModrinthProjectHit,
  ModrinthProjectVersion,
  ResourceSearchFilters,
  ResourceTarget,
  ResourceType,
  FastDownloadSource
} from '../shared/types'

/**
 * CurseForge 资源：通过 MCIM 镜像访问 CurseForge 接口（官方接口需要 API Key，镜像不需要）。
 * 项目 ID 写成 cf:<modId>，版本 ID 写成 cf:<modId>:<fileId>，与 Modrinth 的 ID 区分
 */
const API = 'https://mod.mcimirror.top/curseforge/v1'
const MIRROR_FILES = 'https://mod.mcimirror.top'
const USER_AGENT = `LiuliLauncher/${__APP_VERSION__}`
const GAME_ID = 432

/** CurseForge 的资源分类 */
const CLASS_IDS: Record<ResourceType, number> = {
  mod: 6,
  modpack: 4471,
  resourcepack: 12,
  shader: 6552,
  datapack: 6945
}

/** CurseForge 的模组加载器编号 */
const LOADER_TYPES: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const LOADER_NAMES: Record<number, string> = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' }

/** 排序方式对应的 CurseForge 排序字段 */
const SORT_FIELDS: Record<string, number> = { relevance: 1, follows: 2, updated: 3, downloads: 6, newest: 11 }

interface CurseMod {
  id: number
  name: string
  summary: string
  slug?: string
  authors?: { name: string }[]
  logo?: { thumbnailUrl?: string; url?: string } | null
  downloadCount: number
  latestFilesIndexes?: { gameVersion: string; modLoader?: number | null }[]
  links?: { websiteUrl?: string }
}

interface CurseFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  gameVersions: string[]
  hashes?: { value: string; algo: number }[]
  dependencies?: { modId: number; relationType: number }[]
}

export function isCurseForgeId(id: string): boolean {
  return id.startsWith('cf:')
}

async function cfFetch<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    })
  } catch (e) {
    throw new Error(`无法连接 CurseForge 镜像（MCIM）：${e instanceof Error ? e.message : String(e)}`)
  }
  if (response.status === 404) throw new Error('在 CurseForge 上找不到这个资源')
  if (response.status === 429) throw new Error('请求太频繁，请稍后再试')
  if (!response.ok) throw new Error(`CurseForge 镜像返回错误（${response.status}）`)
  return ((await response.json()) as { data: T }).data
}

function numberId(id: string, what: string): number {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`无效的 CurseForge ${what}：${id}`)
  return n
}

/** cf:<modId> → modId */
function parseProjectId(projectId: string): number {
  return numberId(projectId.replace(/^cf:/, ''), '项目 ID')
}

/** cf:<modId>:<fileId> → { modId, fileId } */
function parseVersionId(versionId: string): { modId: number; fileId: number } {
  const [, mod, file] = versionId.split(':')
  return { modId: numberId(mod, '项目 ID'), fileId: numberId(file, '文件 ID') }
}

/** 按 Minecraft 版本号从新到旧排序（1.21.1 > 1.20.4 > 1.20） */
function compareGameVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
  }
  return 0
}

const isGameVersion = (v: string): boolean => /^\d+\.\d+(\.\d+)?$/.test(v)

/** 在 CurseForge 搜索某类资源 */
export async function searchCurseForge(
  type: ResourceType,
  query: string,
  offset = 0,
  filters: ResourceSearchFilters = {}
): Promise<{ hits: ModrinthProjectHit[]; total: number }> {
  const sort = filters.sort && SORT_FIELDS[filters.sort] ? filters.sort : query.trim() ? 'relevance' : 'downloads'
  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_IDS[type]),
    sortField: String(SORT_FIELDS[sort]),
    sortOrder: 'desc',
    index: String(offset),
    pageSize: '20'
  })
  if (query.trim()) params.set('searchFilter', query.trim())
  if (filters.gameVersion) params.set('gameVersion', filters.gameVersion)
  if (filters.loader && LOADER_TYPES[filters.loader]) params.set('modLoaderType', String(LOADER_TYPES[filters.loader]))
  const response = await fetch(`${API}/mods/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  }).catch((e) => {
    throw new Error(`无法连接 CurseForge 镜像（MCIM）：${e instanceof Error ? e.message : String(e)}`)
  })
  if (!response.ok) throw new Error(`CurseForge 镜像返回错误（${response.status}）`)
  const result = (await response.json()) as { data: CurseMod[]; pagination?: { totalCount?: number } }
  return {
    hits: result.data.map((mod) => {
      const indexes = mod.latestFilesIndexes ?? []
      const loaders = [...new Set(indexes.map((i) => (i.modLoader ? LOADER_NAMES[i.modLoader] : '')).filter(Boolean))]
      const versions = [...new Set(indexes.map((i) => i.gameVersion).filter(isGameVersion))].sort(compareGameVersions)
      return {
        projectId: `cf:${mod.id}`,
        title: mod.name,
        description: mod.summary,
        author: mod.authors?.[0]?.name ?? '',
        iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || undefined,
        downloads: mod.downloadCount,
        loaders,
        latestGameVersion: versions[0] ?? ''
      }
    }),
    // CurseForge 最多只能翻到第 10000 条
    total: Math.min(result.pagination?.totalCount ?? result.data.length, 10000)
  }
}

const RELEASE_TYPES: Record<number, ModrinthProjectVersion['versionType']> = { 1: 'release', 2: 'beta', 3: 'alpha' }

function toVersion(file: CurseFile): ModrinthProjectVersion {
  return {
    id: `cf:${file.modId}:${file.id}`,
    name: file.displayName,
    versionNumber: file.displayName,
    versionType: RELEASE_TYPES[file.releaseType] ?? 'release',
    gameVersions: file.gameVersions.filter(isGameVersion).sort(compareGameVersions),
    loaders: file.gameVersions.map((v) => v.toLowerCase()).filter((v) => Object.keys(LOADER_TYPES).includes(v)),
    datePublished: file.fileDate,
    fileName: file.fileName,
    fileSize: file.fileLength
  }
}

/** 项目的文件列表（新的在前，最多 200 个） */
async function projectFiles(modId: number, gameVersion?: string, loader?: string): Promise<CurseFile[]> {
  const files: CurseFile[] = []
  for (let index = 0; index < 200; index += 50) {
    const params = new URLSearchParams({ index: String(index), pageSize: '50' })
    if (gameVersion) params.set('gameVersion', gameVersion)
    if (loader && LOADER_TYPES[loader]) params.set('modLoaderType', String(LOADER_TYPES[loader]))
    const page = await cfFetch<CurseFile[]>(`/mods/${modId}/files?${params}`)
    files.push(...page)
    if (page.length < 50) break
  }
  return files.sort((a, b) => b.fileDate.localeCompare(a.fileDate))
}

/** 项目的版本列表（新版本在前）。整合包只保留 .zip 文件 */
export async function getCurseForgeVersions(projectId: string, type: ResourceType): Promise<ModrinthProjectVersion[]> {
  const files = await projectFiles(parseProjectId(projectId))
  return files
    .filter((f) =>
      type === 'modpack' || type === 'resourcepack' || type === 'shader' ? /\.zip$/i.test(f.fileName) : true
    )
    .map(toVersion)
}

/** 文件的下载地址：部分模组不允许第三方分发，接口不返回地址时按 CurseForge CDN 的规则拼出来 */
async function fileUrls(file: CurseFile): Promise<string[]> {
  // 镜像接口给的地址只接受 https，否则按 CDN 规则自己拼
  const official =
    (typeof file.downloadUrl === 'string' && file.downloadUrl.startsWith('https://') ? file.downloadUrl : null) ??
    `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`
  const mirror = official.replace(/^https:\/\/(edge|mediafilez)\.forgecdn\.net/, MIRROR_FILES)
  const { downloadSource } = await getSettings()
  return [...new Set(downloadSource === 'bmclapi' ? [mirror, official] : [official, mirror])]
}

function safeFileName(name: string): string {
  if (!name || name !== basename(name) || name.startsWith('.')) throw new Error(`文件名无效：${name}`)
  return name
}

async function downloadFile(file: CurseFile, dir: string, source: FastDownloadSource = 'mod'): Promise<string> {
  const name = safeFileName(file.fileName)
  const sha1 = file.hashes?.find((h) => h.algo === 1)?.value
  await mkdir(dir, { recursive: true })
  const options = {
    url: await fileUrls(file),
    destination: join(dir, name),
    dispatcher: downloadDispatcher(),
    headers: { 'User-Agent': USER_AGENT },
    validator: sha1 ? { algorithm: 'sha1', hash: sha1 } : undefined
  }
  // 整合包文件直接用原下载方式（不进入高速下载器）；模组、资源包先用高速多线程引擎，失败时自动改用原下载方式
  if (source === 'modpack') await download(options)
  else await downloadWithFallback(options, source)
  return name
}

/** 模组适用于该游戏版本与加载器的最新文件（优先正式版） */
async function pickFile(modId: number, ctx: ModsContext): Promise<CurseFile | undefined> {
  const loader = ctx.loader && LOADER_TYPES[ctx.loader] ? ctx.loader : undefined
  const files = await projectFiles(modId, ctx.minecraftVersion, loader)
  return files.find((f) => f.releaseType === 1) ?? files[0]
}

/** 安装 CurseForge 模组，并自动安装必需的前置模组（最多 20 个） */
async function installMod(versionId: string, modId: number, fileId: number): Promise<ModrinthInstallResult> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  const existing = new Set((await readdir(ctx.dir).catch(() => [] as string[])).map((n) => n.toLowerCase()))
  const result: ModrinthInstallResult = { installed: [], missingDependencies: [] }
  const queue: { modId: number; dependency: boolean }[] = [{ modId, dependency: false }]
  const visited = new Set<number>()
  while (queue.length > 0) {
    const item = queue.shift()!
    if (visited.has(item.modId)) continue
    visited.add(item.modId)
    if (visited.size > 20) break
    const mod = await cfFetch<CurseMod>(`/mods/${item.modId}`)
    const file = item.dependency
      ? await pickFile(item.modId, ctx)
      : await cfFetch<CurseFile>(`/mods/${item.modId}/files/${fileId}`)
    if (!file) {
      result.missingDependencies.push(mod.name)
      continue
    }
    // 前置模组已经有同名文件时不再下载
    if (item.dependency && existing.has(file.fileName.toLowerCase())) continue
    const fileName = await downloadFile(file, ctx.dir)
    existing.add(fileName.toLowerCase())
    result.installed.push({ projectId: `cf:${item.modId}`, title: mod.name, fileName, dependency: item.dependency })
    // relationType 3：必需的前置
    for (const dep of file.dependencies ?? []) {
      if (dep.relationType === 3) queue.push({ modId: dep.modId, dependency: true })
    }
  }
  return result
}

/** 安装 CurseForge 资源的某个文件到指定游戏版本（模组、资源包、光影、数据包） */
export async function installCurseForgeResource(
  target: ResourceTarget,
  type: ResourceType,
  versionId: string
): Promise<ModrinthInstallResult> {
  const { modId, fileId } = parseVersionId(versionId)
  if (type === 'mod') return installMod(target.versionId, modId, fileId)
  if (type === 'modpack') throw new Error('整合包请通过安装整合包页面安装')
  assertGameStopped(target.versionId)
  const gameDir = dirname((await modsContextOf(target.versionId)).dir)
  let dir: string
  if (type === 'datapack') {
    if (!target.world || target.world !== basename(target.world) || target.world === '..') {
      throw new Error('请选择要安装数据包的存档')
    }
    if (!(await stat(join(gameDir, 'saves', target.world)).catch(() => null))) {
      throw new Error(`找不到存档：${target.world}`)
    }
    dir = join(gameDir, 'saves', target.world, 'datapacks')
  } else {
    dir = join(gameDir, type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks')
  }
  const [mod, file] = await Promise.all([
    cfFetch<CurseMod>(`/mods/${modId}`),
    cfFetch<CurseFile>(`/mods/${modId}/files/${fileId}`)
  ])
  const fileName = await downloadFile(file, dir, 'resource')
  return {
    installed: [{ projectId: `cf:${modId}`, title: mod.name, fileName, dependency: false }],
    missingDependencies: []
  }
}

/** 下载 CurseForge 整合包（.zip）到缓存目录，返回文件路径 */
export async function downloadCurseForgeModpack(versionId: string): Promise<string> {
  const { modId, fileId } = parseVersionId(versionId)
  const file = await cfFetch<CurseFile>(`/mods/${modId}/files/${fileId}`)
  if (!/\.zip$/i.test(file.fileName)) throw new Error('这个版本没有整合包文件')
  const dir = join(app.getPath('userData'), 'cache', 'modpacks')
  return join(dir, await downloadFile(file, dir, 'modpack'))
}
