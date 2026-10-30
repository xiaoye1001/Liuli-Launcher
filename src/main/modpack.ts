import { createHash, randomUUID } from 'crypto'
import { BrowserWindow, dialog } from 'electron'
import { AbortableTask } from '@xmcl/task'
import { open, openEntryReadStream, readAllEntries, readEntry } from '@xmcl/unzip'
import { createReadStream, createWriteStream } from 'fs'
import { copyFile, lstat, mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { assertIdle, startCustomInstall, type InstallExtraStep } from './install'
import {
  downloadModpackFile,
  getProjectVersions,
  isAllowedModpackUrl,
  modrinthFileUrls,
  MODRINTH_USER_AGENT
} from './modrinth'
import { downloadCurseForgeModpack, getCurseForgeVersions, isCurseForgeId } from './curseforge'
import { getSettings } from './config'
import { abortedPause, AbortedError, WatchedDownloadTask } from './fileDownload'
import { assertGameStopped, fileSha1 } from './mods'
import { assertSafeId } from './versionManage'
import {
  installedModpackOf,
  isModpackVersionId,
  readModpackRecord,
  writeModpackRecord,
  type ModpackRecord
} from './modpackRecord'
import type {
  InstallRequest,
  ModpackInfo,
  ModpackSource,
  ModpackUpdateCheck,
  ModpackUpdatePlan,
  ModrinthProjectVersion
} from '../shared/types'

/**
 * 整合包导入，支持四种常见格式：
 * - Modrinth（.mrpack）：modrinth.index.json 中带有每个文件的下载地址与 SHA1
 * - CurseForge（.zip）：manifest.json 中只有项目与文件 ID，安装时通过 MCIM 镜像查询下载地址
 *   （CurseForge 官方接口需要 API Key）
 * - MultiMC / Prism Launcher（.zip）：mmc-pack.json 记录组件版本，模组等文件直接在压缩包的 .minecraft 文件夹里
 * - MCBBS（.zip）：mcbbs.packmeta 记录游戏与加载器版本，文件在 overrides 文件夹里
 */

/** 解析后的整合包 */
interface ParsedModpack {
  info: ModpackInfo
  /** 直接下载的文件（Modrinth） */
  downloads: { path: string; urls: string[]; sha1: string; size?: number }[]
  /** 需要查询下载地址的 CurseForge 文件 ID */
  curseFileIds: number[]
  /** 压缩包中要复制到游戏目录的文件夹前缀，按顺序复制（后面的覆盖前面的） */
  overridePrefixes: string[]
  /** 要复制的文件（同一路径只保留最后一个前缀里的） */
  overrides: OverrideFile[]
}

interface OverrideFile {
  /** 压缩包里的完整路径 */
  entryName: string
  /** 相对游戏目录的路径 */
  rel: string
  size: number
}

/**
 * 整合包里属于公共游戏目录的文件夹（有些网盘「完整包」把整个 .minecraft 都打包进来了）。
 * 这些文件不解压到版本自己的文件夹。其中只有按内容哈希命名的资源文件（声音、贴图、语言等数据，
 * 不能运行代码）会预先放进公共的 assets/objects，省得再下载；libraries 里是会被运行的 jar（包括 Forge 安装器），
 * 整合包自带的可能被替换过，而且会留在公共目录影响其他版本，一律不用，安装时从官方或镜像下载并校验
 */
const SHARED_FOLDERS = ['assets/', 'libraries/']
function isShared(rel: string): boolean {
  return SHARED_FOLDERS.some((f) => rel.toLowerCase().startsWith(f))
}
function isPreseedAsset(rel: string): boolean {
  const match = /^assets\/objects\/([0-9a-f]{2})\/([0-9a-f]{40})$/.exec(rel)
  return !!match && match[2].startsWith(match[1])
}

/** 路径的每一段统一成小写、去掉末尾的点和空格（Windows 与 macOS 不区分大小写，Windows 会忽略末尾的点和空格） */
function normalizedSegments(path: string): string[] {
  return path
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase().replace(/[. ]+$/, ''))
    .filter((segment) => segment !== '')
}

/**
 * 整合包不能写入的位置（解压的文件和下载的文件都检查）：
 * - versions 文件夹：版本文件由启动器自己生成，也防止改动其他版本
 * - 启动器的版本设置（liuli-*.json 里有启动前后执行的命令、Java 路径等）、版本图标
 * - 版本自己的 <版本名>.json / <版本名>.jar / <版本名>-natives（开启版本隔离时游戏目录就是版本文件夹）
 */
export function isForbiddenModpackPath(path: string, versionName: string): boolean {
  // 带冒号的路径在 Windows 上会写进别的文件（数据流），一律不允许
  if (/[:\u0000-\u001f]/.test(path)) return true
  const segments = normalizedSegments(path)
  const first = segments[0]
  if (!first) return true
  if (first === 'versions') return true
  // 启动器自己的文件（版本设置、图标、整合包的安装记录和更新备份）都以 liuli- 开头
  if (first.startsWith('liuli-')) return true
  // Windows 的 8.3 短文件名（例如 LIULI-~1.JSO 指向 liuli-version.json）可以绕过上面按名字的检查
  if (segments.some((segment) => /~\d/.test(segment))) return true
  const name = versionName.toLowerCase().replace(/[. ]+$/, '')
  return name !== '' && [`${name}.json`, `${name}.jar`, `${name}-natives`].includes(first)
}

type Loader = ModpackInfo['loader']
/** 各格式解析的结果（之后统一整理要复制的文件） */
type Parsed = Omit<ParsedModpack, 'overrides'>

// ---------- 路径安全 ----------

/** 只允许整合包写入游戏目录内部，防止 ../ 之类的路径写到其他地方 */
function isSafePath(path: string): boolean {
  if (!path || isAbsolute(path) || /^[a-zA-Z]:/.test(path)) return false
  // 冒号：Windows 上「文件名:流名」会写进同名文件的数据流（例如 liuli-version.json::$DATA 实际写的是 liuli-version.json），
  // 可以绕过下面按文件名做的检查；控制字符也不是正常的文件名
  if (/[:\u0000-\u001f]/.test(path)) return false
  return !path.split(/[\\/]/).includes('..')
}

function safeJoin(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!isSafePath(path) || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`整合包中包含不安全的文件路径：${path}`)
  }
  return target
}

// ---------- 各格式解析 ----------

interface ZipListing {
  names: string[]
  read: (name: string) => Promise<string>
}

function parseJson<T>(text: string, what: string): T {
  try {
    return JSON.parse(text.replace(/^﻿/, '')) as T
  } catch {
    throw new Error(`整合包中的 ${what} 格式不正确`)
  }
}

function countUnder(names: string[], prefixes: string[]): number {
  return names.filter((n) => !n.endsWith('/') && prefixes.some((p) => n.startsWith(p))).length
}

async function parseModrinth(zip: ZipListing, fileName: string): Promise<Parsed> {
  const index = parseJson<{
    game: string
    versionId: string
    name: string
    summary?: string
    files: {
      path: string
      hashes: { sha1: string }
      env?: { client?: string }
      downloads: string[]
      fileSize: number
    }[]
    dependencies: Record<string, string>
  }>(await zip.read('modrinth.index.json'), 'modrinth.index.json')
  if (index.game !== 'minecraft' || !index.dependencies?.minecraft) throw new Error('整合包格式不正确')
  const deps = index.dependencies
  const loaderKey = (['fabric-loader', 'forge', 'neoforge', 'quilt-loader'] as const).find((k) => deps[k])
  const loader: Loader = loaderKey ? (loaderKey.replace('-loader', '') as Loader) : null
  // 服务端专用的文件不需要
  const files = (Array.isArray(index.files) ? index.files : []).filter((f) => f?.env?.client !== 'unsupported')
  // Modrinth 规范要求每个文件都有 SHA-1；没有的话下载后无法校验，整个整合包拒绝安装
  for (const f of files) {
    if (
      typeof f.path !== 'string' ||
      !Array.isArray(f.downloads) ||
      typeof f.hashes?.sha1 !== 'string' ||
      !/^[0-9a-f]{40}$/i.test(f.hashes.sha1)
    ) {
      throw new Error(`整合包中的文件 ${String(f?.path ?? '').slice(0, 100)} 缺少下载地址或 SHA-1 校验值，已拒绝安装`)
    }
  }
  const overridePrefixes = ['overrides/', 'client-overrides/']
  return {
    info: {
      format: 'modrinth',
      fileName,
      name: index.name,
      version: index.versionId,
      summary: index.summary ?? '',
      minecraftVersion: deps.minecraft,
      loader,
      loaderVersion: loaderKey ? deps[loaderKey] : '',
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + (f.fileSize ?? 0), 0),
      overrideCount: countUnder(zip.names, overridePrefixes)
    },
    downloads: files.map((f) => ({ path: f.path, urls: f.downloads, sha1: f.hashes.sha1, size: f.fileSize })),
    curseFileIds: [],
    overridePrefixes
  }
}

/** CurseForge 的加载器写法：forge-47.2.0、fabric-0.15.3、neoforge-20.4.237 */
function parseLoaderId(id: string | undefined): { loader: Loader; version: string } {
  const match = /^(forge|neoforge|fabric|quilt)-(.+)$/.exec(id ?? '')
  return match ? { loader: match[1] as Loader, version: match[2] } : { loader: null, version: '' }
}

async function parseCurseForge(zip: ZipListing, fileName: string): Promise<Parsed> {
  const manifest = parseJson<{
    manifestType?: string
    name?: string
    version?: string
    author?: string
    minecraft?: { version: string; modLoaders?: { id: string; primary?: boolean }[] }
    files?: { projectID: number; fileID: number; required?: boolean }[]
    overrides?: string
  }>(await zip.read('manifest.json'), 'manifest.json')
  if (manifest.manifestType !== 'minecraftModpack' || !manifest.minecraft?.version) {
    throw new Error('整合包格式不正确（manifest.json 不是 CurseForge 整合包）')
  }
  const loaders = manifest.minecraft.modLoaders ?? []
  const { loader, version } = parseLoaderId((loaders.find((l) => l.primary) ?? loaders[0])?.id)
  const files = (manifest.files ?? []).filter((f) => f.required !== false)
  const overridePrefixes = [`${(manifest.overrides || 'overrides').replace(/\/$/, '')}/`]
  return {
    info: {
      format: 'curseforge',
      fileName,
      name: manifest.name || fileName.replace(/\.zip$/i, ''),
      version: manifest.version ?? '',
      summary: manifest.author ? `作者：${manifest.author}` : '',
      minecraftVersion: manifest.minecraft.version,
      loader,
      loaderVersion: version,
      fileCount: files.length,
      totalSize: 0,
      overrideCount: countUnder(zip.names, overridePrefixes)
    },
    downloads: [],
    curseFileIds: files.map((f) => f.fileID),
    overridePrefixes
  }
}

async function parseMcbbs(zip: ZipListing, fileName: string): Promise<Parsed> {
  const meta = parseJson<{
    name?: string
    version?: string
    description?: string
    author?: string
    addons?: { id: string; version: string }[]
  }>(await zip.read('mcbbs.packmeta'), 'mcbbs.packmeta')
  const addons = meta.addons ?? []
  const mc = addons.find((a) => a.id === 'game')?.version
  if (!mc) throw new Error('整合包格式不正确（mcbbs.packmeta 中没有游戏版本）')
  const loaderAddon = addons.find((a) => ['forge', 'neoforge', 'fabric', 'quilt'].includes(a.id))
  const overridePrefixes = ['overrides/']
  return {
    info: {
      format: 'mcbbs',
      fileName,
      name: meta.name || fileName.replace(/\.zip$/i, ''),
      version: meta.version ?? '',
      summary: meta.description || (meta.author ? `作者：${meta.author}` : ''),
      minecraftVersion: mc,
      loader: (loaderAddon?.id as Loader) ?? null,
      loaderVersion: loaderAddon?.version ?? '',
      fileCount: 0,
      totalSize: 0,
      overrideCount: countUnder(zip.names, overridePrefixes)
    },
    downloads: [],
    curseFileIds: [],
    overridePrefixes
  }
}

/** MultiMC / Prism 的组件 ID 与加载器的对应关系 */
const MMC_LOADERS: Record<string, Exclude<Loader, null>> = {
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge',
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt'
}

async function parseMultiMC(zip: ZipListing, fileName: string, packJson: string): Promise<Parsed> {
  // 实例可能在压缩包根目录，也可能在一个以实例名命名的文件夹里
  const root = packJson.slice(0, packJson.length - 'mmc-pack.json'.length)
  const pack = parseJson<{ components?: { uid: string; version?: string; cachedVersion?: string }[] }>(
    await zip.read(packJson),
    'mmc-pack.json'
  )
  const components = pack.components ?? []
  const versionOf = (c: { version?: string; cachedVersion?: string }): string => c.version ?? c.cachedVersion ?? ''
  const mcComponent = components.find((c) => c.uid === 'net.minecraft')
  if (!mcComponent || !versionOf(mcComponent))
    throw new Error('整合包格式不正确（mmc-pack.json 中没有 Minecraft 版本）')
  const loaderComponent = components.find((c) => MMC_LOADERS[c.uid])
  let name = basename(root) || fileName.replace(/\.zip$/i, '')
  if (zip.names.includes(`${root}instance.cfg`)) {
    const cfgName = /^name=(.+)$/m.exec(await zip.read(`${root}instance.cfg`))?.[1]?.trim()
    if (cfgName) name = cfgName
  }
  const gameFolder = zip.names.some((n) => n.startsWith(`${root}.minecraft/`)) ? '.minecraft/' : 'minecraft/'
  const overridePrefixes = [`${root}${gameFolder}`]
  return {
    info: {
      format: 'multimc',
      fileName,
      name,
      version: '',
      summary: '',
      minecraftVersion: versionOf(mcComponent),
      loader: loaderComponent ? MMC_LOADERS[loaderComponent.uid] : null,
      loaderVersion: loaderComponent ? versionOf(loaderComponent) : '',
      fileCount: 0,
      totalSize: 0,
      overrideCount: countUnder(zip.names, overridePrefixes)
    },
    downloads: [],
    curseFileIds: [],
    overridePrefixes
  }
}

/** 整合包里清单类文件（modrinth.index.json、manifest.json 等）的大小上限 */
const MAX_META_SIZE = 16 * 1024 * 1024
/** 压缩包里最多的文件数 */
const MAX_ENTRIES = 200000

type ZipFile = Awaited<ReturnType<typeof open>>
type ZipEntry = Awaited<ReturnType<typeof readAllEntries>>[number]

/**
 * 压缩包里一个文件的 SHA-1，边读边算，不把整个文件读进内存。
 * 用事件读取：没有压缩的条目返回的旧式读取流不支持 for await（会一直等不到结束）
 */
async function entrySha1(zip: ZipFile, entry: ZipEntry): Promise<string> {
  const stream = await openEntryReadStream(zip, entry)
  const hash = createHash('sha1')
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

/** 读取整合包，自动识别格式，并检查所有要写入的路径是否安全 */
async function parseModpack(path: string): Promise<ParsedModpack> {
  const zipFile = await open(path).catch(() => {
    throw new Error('无法读取整合包，文件可能已损坏或不是压缩包')
  })
  try {
    const entries = await readAllEntries(zipFile).catch((e: Error) => {
      // 压缩包里有 ../ 或绝对路径时，解压库会直接拒绝
      throw new Error(
        /relative path|absolute path/i.test(e.message)
          ? '整合包中包含不安全的文件路径，已拒绝安装'
          : '无法读取整合包，文件可能已损坏'
      )
    })
    if (entries.length > MAX_ENTRIES) throw new Error('整合包里的文件太多，可能已损坏')
    const byName = new Map(entries.map((e) => [e.fileName, e]))
    const listing: ZipListing = {
      names: entries.map((e) => e.fileName),
      read: async (name) => {
        const entry = byName.get(name)
        if (!entry) throw new Error(`整合包中缺少 ${name}`)
        // 清单类文件正常只有几百 KB；压缩炸弹解压后可能有几个 GB，会把启动器的内存撑爆
        if (entry.uncompressedSize > MAX_META_SIZE) throw new Error(`整合包中的 ${name} 太大，可能已损坏`)
        return (await readEntry(zipFile, entry)).toString('utf-8')
      }
    }
    const fileName = basename(path)
    let parsed: Parsed
    if (byName.has('modrinth.index.json')) {
      parsed = await parseModrinth(listing, fileName)
    } else if (byName.has('mcbbs.packmeta')) {
      // MCBBS 整合包通常也带有 manifest.json，优先使用 mcbbs.packmeta
      parsed = await parseMcbbs(listing, fileName)
    } else if (byName.has('manifest.json')) {
      parsed = await parseCurseForge(listing, fileName)
    } else {
      const packJson = listing.names.find((n) => /^([^/]+\/)?mmc-pack\.json$/.test(n))
      if (!packJson) {
        throw new Error('无法识别整合包格式，支持 Modrinth（.mrpack）、CurseForge、MultiMC / Prism、MCBBS 整合包')
      }
      parsed = await parseMultiMC(listing, fileName, packJson)
    }

    // 要复制的文件：按前缀顺序，后面的覆盖前面的
    const overrideMap = new Map<string, OverrideFile>()
    for (const prefix of parsed.overridePrefixes) {
      for (const entry of entries) {
        if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) continue
        const rel = entry.fileName.slice(prefix.length)
        // versions 文件夹由启动器自己生成，读取时就去掉（其他不能写入的位置在安装时按版本名再检查）
        if (!rel || normalizedSegments(rel)[0] === 'versions') continue
        overrideMap.set(rel, { entryName: entry.fileName, rel, size: entry.uncompressedSize })
      }
    }
    const overrides = [...overrideMap.values()]

    // 游戏和加载器的版本号会拼进下载地址和文件路径，格式不对的整合包直接拒绝
    const versionPart = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,80}$/
    if (
      !versionPart.test(parsed.info.minecraftVersion) ||
      (parsed.info.loaderVersion && !versionPart.test(parsed.info.loaderVersion))
    ) {
      throw new Error('整合包里的游戏或加载器版本号格式不对，已拒绝安装')
    }

    // 读取时就检查所有路径，有问题的整合包在开始安装前就拒绝
    const unsafe = [...parsed.downloads.map((d) => d.path), ...overrides.map((o) => o.rel)].find((p) => !isSafePath(p))
    if (unsafe) throw new Error(`整合包中包含不安全的文件路径：${unsafe}，已拒绝安装`)

    // 整合包列出的下载文件如果压缩包里已经有了（同一路径，或内容相同但文件名不同），就不再下载。
    // 内容相同但名字不同时如果还下载，mods 里会出现两份同一个模组，Forge 会报重复模组而无法启动
    if (parsed.downloads.length > 0) {
      const included = new Set(overrides.map((o) => o.rel.toLowerCase()))
      const sizes = new Set(parsed.downloads.map((d) => d.size).filter((n): n is number => !!n))
      const provided = new Set<string>()
      for (const o of overrides) {
        // 只计算大小与某个下载文件相同的条目的 SHA1，避免读取整个压缩包
        if (!sizes.has(o.size)) continue
        const entry = byName.get(o.entryName)
        if (!entry) continue
        provided.add(await entrySha1(zipFile, entry))
      }
      const remaining = parsed.downloads.filter(
        (d) => !included.has(d.path.toLowerCase()) && !provided.has(d.sha1.toLowerCase())
      )
      parsed.info.skippedDownloads = parsed.downloads.length - remaining.length
      parsed.info.fileCount = remaining.length
      parsed.info.totalSize = remaining.reduce((sum, d) => sum + (d.size ?? 0), 0)
      parsed.downloads = remaining
    }
    parsed.info.includedMods = overrides.filter((o) => /^mods\/[^/]+\.jar$/i.test(o.rel)).length
    parsed.info.includedGameFiles = overrides.filter((o) => isShared(o.rel)).length
    parsed.info.overrideCount = overrides.length - parsed.info.includedGameFiles
    return { ...parsed, overrides }
  } finally {
    zipFile.close()
  }
}

// ---------- CurseForge 文件查询 ----------

const MCIM_CURSEFORGE = 'https://mod.mcimirror.top/curseforge/v1'
const MCIM_FILES = 'https://mod.mcimirror.top'

interface CurseFile {
  id: number
  fileName: string
  fileLength: number
  downloadUrl: string | null
  hashes?: { value: string; algo: number }[]
}

/** 通过 MCIM 镜像查询 CurseForge 文件的下载信息 */
async function resolveCurseFiles(
  ids: number[]
): Promise<{ path: string; urls: string[]; sha1?: string; size?: number }[]> {
  const result: CurseFile[] = []
  for (let i = 0; i < ids.length; i += 200) {
    let response: Response
    try {
      response = await fetch(`${MCIM_CURSEFORGE}/mods/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': MODRINTH_USER_AGENT },
        body: JSON.stringify({ fileIds: ids.slice(i, i + 200) }),
        signal: AbortSignal.timeout(20000)
      })
    } catch (e) {
      throw new Error(`无法连接 MCIM 镜像获取 CurseForge 模组信息：${e instanceof Error ? e.message : String(e)}`)
    }
    if (!response.ok) throw new Error(`获取 CurseForge 模组信息失败：HTTP ${response.status}`)
    result.push(...((await response.json()) as { data: CurseFile[] }).data)
  }
  const found = new Set(result.map((f) => f.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0)
    throw new Error(`有 ${missing.length} 个模组在 CurseForge 上找不到（文件 ID：${missing.slice(0, 5).join('、')}）`)

  const { downloadSource } = await getSettings()
  return result.map((file) => {
    // 部分模组不允许第三方分发，接口不返回下载地址，按 CurseForge CDN 的规则拼出地址
    const official =
      file.downloadUrl ??
      `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`
    const mirror = official.replace(/^https:\/\/(edge|mediafilez)\.forgecdn\.net/, MCIM_FILES)
    const urls = downloadSource === 'bmclapi' ? [mirror, official] : [official, mirror]
    // CurseForge 整合包不写文件放在哪里：资源包是 .zip，其余按模组处理
    const folder = file.fileName.toLowerCase().endsWith('.zip') ? 'resourcepacks' : 'mods'
    return {
      path: `${folder}/${file.fileName}`,
      size: file.fileLength || undefined,
      urls: [...new Set(urls)],
      sha1: file.hashes?.find((h) => h.algo === 1)?.value
    }
  })
}

// ---------- 对外接口 ----------

/**
 * 用户最近选择的整合包（安装时只使用主进程自己记录的路径，不接受界面传入的路径）。
 * 从下载页下载的整合包记下来源，以后可以在线检查更新
 */
let pending: { path: string; info: ModpackInfo; source?: ModpackSource } | null = null

const EXTENSIONS = ['mrpack', 'zip']

/** 选择整合包文件并读取信息，取消时返回 null */
export async function pickModpack(win: BrowserWindow | null): Promise<ModpackInfo | null> {
  const options: Electron.OpenDialogOptions = {
    title: '导入整合包',
    filters: [{ name: '整合包（Modrinth / CurseForge / MultiMC / MCBBS）', extensions: EXTENSIONS }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  return loadModpack(path)
}

/** 读取整合包并记为待安装 */
export async function loadModpack(path: string, source?: ModpackSource): Promise<ModpackInfo> {
  const { info } = await parseModpack(path)
  pending = { path, info, source }
  return info
}

/** 拖入窗口的文件：只接受存在的 .mrpack / .zip 文件 */
export async function loadModpackFile(path: string): Promise<ModpackInfo> {
  if (typeof path !== 'string' || !EXTENSIONS.some((ext) => path.toLowerCase().endsWith(`.${ext}`))) {
    throw new Error('只支持整合包文件（.mrpack 或 .zip）')
  }
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error('找不到这个文件')
  return loadModpack(path)
}

/** 下载整合包的某个版本（Modrinth 或 CurseForge），返回文件路径和来源 */
async function fetchModpackVersion(versionId: string): Promise<{ path: string; source: ModpackSource }> {
  if (isCurseForgeId(versionId)) {
    const path = await downloadCurseForgeModpack(versionId)
    return {
      path,
      source: { platform: 'curseforge', projectId: versionId.split(':').slice(0, 2).join(':'), versionId }
    }
  }
  const { path, projectId } = await downloadModpackFile(versionId)
  return { path, source: { platform: 'modrinth', projectId, versionId } }
}

/** 从 Modrinth 或 CurseForge 下载整合包的某个版本并读取信息 */
export async function downloadModpack(versionId: string): Promise<ModpackInfo> {
  const { path, source } = await fetchModpackVersion(versionId)
  return loadModpack(path, source)
}

/** 整合包的加载器版本转换为安装请求 */
function toRequest(info: ModpackInfo, name: string): InstallRequest {
  const mc = info.minecraftVersion
  const request: InstallRequest = { minecraftVersion: mc, name }
  if (info.loader === 'quilt') request.quiltLoader = info.loaderVersion
  if (info.loader === 'fabric') request.fabricLoader = info.loaderVersion
  if (info.loader === 'forge') {
    // 有的整合包写成「1.20.1-47.2.0」，统一为 Forge 版本号本身
    request.forgeVersion = info.loaderVersion.replace(`${mc}-`, '')
  }
  if (info.loader === 'neoforge') {
    // 1.20.1 的 NeoForge 沿用 Forge 的版本格式（1.20.1-47.1.x）
    request.neoforgeVersion =
      mc === '1.20.1' && !info.loaderVersion.startsWith('1.20.1-') ? `1.20.1-${info.loaderVersion}` : info.loaderVersion
  }
  return request
}

/** 从整合包解压文件，进度按解压的字节数计算 */
class ExtractTask extends AbortableTask<void> {
  private aborted = false
  private stream: Readable | null = null

  constructor(
    private readonly zipPath: string,
    private readonly files: { entryName: string; target: string; size: number }[]
  ) {
    super()
    this._total = files.reduce((sum, f) => sum + f.size, 0)
  }

  protected async process(): Promise<void> {
    if (this.aborted) return abortedPause()
    const zip = await open(this.zipPath)
    try {
      const byName = new Map((await readAllEntries(zip)).map((e) => [e.fileName, e]))
      for (const file of this.files) {
        if (this.aborted) throw new AbortedError()
        const entry = byName.get(file.entryName)
        if (!entry) continue
        await mkdir(dirname(file.target), { recursive: true })
        const stream = await openEntryReadStream(zip, entry)
        this.stream = stream
        stream.on('data', (chunk: Buffer) => {
          this._progress += chunk.length
          this.update(chunk.length)
        })
        await pipeline(stream, createWriteStream(file.target)).catch((e) => {
          throw this.aborted ? new AbortedError() : e
        })
        this.stream = null
      }
    } finally {
      zip.close()
    }
  }

  protected abort(): void {
    this.aborted = true
    this.stream?.destroy(new AbortedError())
  }

  protected isAbortedError(e: unknown): boolean {
    return e instanceof AbortedError
  }
}

/** 跳过整合包不能写入的位置（记录到控制台，不中断安装） */
function allowedFor(versionName: string): (rel: string) => boolean {
  return (rel) => {
    if (!isForbiddenModpackPath(rel, versionName)) return true
    console.warn(`整合包试图写入受保护的位置，已跳过：${rel}`)
    return false
  }
}

/** 整合包要放进版本游戏目录的文件：压缩包里自带的（解压）和清单里列出的（下载） */
interface ModpackFiles {
  parsed: ParsedModpack
  extract: { rel: string; entryName: string; size: number }[]
  downloads: { path: string; urls: string[]; sha1?: string; size?: number }[]
}

async function collectModpackFiles(path: string, versionName: string): Promise<ModpackFiles> {
  const allowed = allowedFor(versionName)
  const parsed = await parseModpack(path)
  const included = new Set(parsed.overrides.map((o) => o.rel.toLowerCase()))
  const modrinthFiles = await Promise.all(
    parsed.downloads
      .filter((d) => !included.has(d.path.toLowerCase()) && allowed(d.path))
      .map(async (d) => {
        // Modrinth 整合包规定的下载网站（https），其他地址不访问
        const urls = d.urls.filter((u) => typeof u === 'string' && isAllowedModpackUrl(u))
        if (urls.length === 0)
          throw new Error(`整合包中的文件 ${d.path} 的下载地址不在 Modrinth 允许的网站内，已拒绝安装`)
        return { path: d.path, urls: await modrinthFileUrls(urls), sha1: d.sha1, size: d.size }
      })
  )
  let curseFiles: { path: string; urls: string[]; sha1?: string; size?: number }[] = []
  if (parsed.curseFileIds.length > 0) {
    try {
      curseFiles = (await resolveCurseFiles(parsed.curseFileIds)).filter(
        (f) => !included.has(f.path.toLowerCase()) && allowed(f.path)
      )
    } catch (e) {
      // 整合包已经带了全部模组时，查不到下载信息也可以继续安装
      if ((parsed.info.includedMods ?? 0) < parsed.curseFileIds.length) throw e
    }
  }
  const extract = parsed.overrides
    .filter((o) => !isShared(o.rel) && allowed(o.rel))
    .map((o) => ({ rel: o.rel, entryName: o.entryName, size: o.size }))
  return { parsed, extract, downloads: [...modrinthFiles, ...curseFiles] }
}

/** 安装原版之前：把整合包自带的资源文件放进公共的 assets（只补充缺少的，不覆盖已有的） */
async function preseedAssets(context: Parameters<InstallExtraStep>[0], path: string): Promise<void> {
  const parsed = await parseModpack(path)
  const root = (await getSettings()).gameDir
  // 公共的 assets、libraries 被所有版本共用：只补充缺少的文件，不覆盖已有的，避免整合包替换其他版本用到的库
  const shared: { entryName: string; target: string; size: number }[] = []
  for (const o of parsed.overrides) {
    if (!isPreseedAsset(o.rel)) continue
    const target = safeJoin(root, o.rel)
    if (
      !(await stat(target).then(
        () => true,
        () => false
      ))
    )
      shared.push({ entryName: o.entryName, target, size: o.size })
  }
  if (shared.length === 0) return
  await context.yield(new ExtractTask(path, shared).setName('modpackGameFiles'))
}

/**
 * 文件的 SHA-1，文件不存在时为 null。边读边算（大文件不读进内存）；
 * 读不了（被占用、没有权限等）时报错，不能当成「没有这个文件」直接覆盖
 */
async function currentSha1(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha1')
    await pipeline(createReadStream(path), hash)
    return hash.digest('hex')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw e
  }
}

/** 路径本身是不是符号链接（不跟随链接） */
async function isSymlink(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => null))?.isSymbolicLink() ?? false
}

/** 新建的安装记录 */
function newRecord(info: ModpackInfo, files: Record<string, string>, source?: ModpackSource): ModpackRecord {
  return {
    format: 1,
    name: info.name,
    version: info.version,
    minecraftVersion: info.minecraftVersion,
    loader: info.loader,
    loaderVersion: info.loaderVersion,
    source,
    files,
    installedAt: new Date().toJSON()
  }
}

/**
 * 整合包的安装步骤：
 * - 安装原版之前：把整合包自带的 assets、libraries 解压到游戏目录根部，原版与加载器的文件校验通过就不再下载；
 * - 安装之后：先把整合包自带的其余文件解压到该版本的游戏目录，再下载清单里缺少的模组（压缩包里已经有的跳过）；
 * - 最后记下整合包放进去的文件（以后更新整合包时用）
 */
function modpackStep(path: string, versionName: string, source?: ModpackSource): InstallExtraStep {
  /** 全部装好后要做的事（保存安装记录） */
  let finish: (() => Promise<void>) | null = null
  const step: InstallExtraStep = async (context, gameDir) => {
    const { parsed, extract, downloads } = await collectModpackFiles(path, versionName)
    // 先把整合包自带的文件解压出来，再下载缺少的文件
    const files = extract.map((o) => ({ entryName: o.entryName, target: safeJoin(gameDir, o.rel), size: o.size }))
    if (files.length > 0) await context.yield(new ExtractTask(path, files).setName('modpackOverrides'))

    if (downloads.length > 0) {
      await context.yield(
        new WatchedDownloadTask(
          downloads.map((d) => ({ urls: d.urls, destination: safeJoin(gameDir, d.path), sha1: d.sha1, size: d.size })),
          { 'User-Agent': MODRINTH_USER_AGENT }
        ).setName('modpackFiles')
      )
    }

    // 安装记录：整合包放进去的每个文件和它的 SHA-1。等游戏本体和加载器也装好后再保存（见 step.after）
    finish = async () => {
      try {
        const recorded: Record<string, string> = {}
        for (const o of extract) {
          const sha1 = await currentSha1(safeJoin(gameDir, o.rel))
          if (sha1) recorded[o.rel] = sha1
        }
        for (const d of downloads) {
          const sha1 = d.sha1?.toLowerCase() || (await currentSha1(safeJoin(gameDir, d.path)))
          if (sha1) recorded[d.path] = sha1
        }
        const root = (await getSettings()).gameDir
        await writeModpackRecord(root, versionName, newRecord(parsed.info, recorded, source))
      } catch (e) {
        // 记录失败不影响游戏，只是以后不能自动更新
        console.warn('无法保存整合包的安装记录：', e)
      }
    }
  }
  step.before = (context) => preseedAssets(context, path)
  step.after = async () => {
    await finish?.()
  }
  return step
}

// ---------- 更新整合包 ----------

/** mods 文件夹里的模组（玩家禁用的模组文件名后面多了 .disabled） */
function isModJar(rel: string): boolean {
  return /^mods\/[^/]+\.jar$/i.test(rel)
}

/** 存档：更新整合包时从不删除或覆盖 */
function inSaves(rel: string): boolean {
  return normalizedSegments(rel)[0] === 'saves'
}

/** 玩家自己的设置（按键、视频设置、服务器列表）：没有安装记录时保留现有的 */
const PERSONAL_FILES = ['options.txt', 'optionsof.txt', 'optionsshaders.txt', 'servers.dat']

/** 压缩包里各个文件的 SHA-1（边读边算，不把文件读进内存） */
async function hashEntries(zipPath: string, entryNames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (entryNames.length === 0) return result
  const wanted = new Set(entryNames)
  const zip = await open(zipPath)
  try {
    for (const entry of await readAllEntries(zip)) {
      if (!wanted.has(entry.fileName)) continue
      result.set(entry.fileName, await entrySha1(zip, entry))
    }
  } finally {
    zip.close()
  }
  return result
}

/**
 * 更新整合包的步骤（游戏本体和模组加载器按新版本重新安装，同时同步整合包的文件）：
 * - 新版本不再包含的整合包文件：玩家没改过的删除（存档从不删除）；
 * - 新版本的文件：没有的放进去，和现有的一样的跳过，整合包原来的、玩家没改过的直接替换，模组总是替换成新版本；
 *   玩家改过的配置文件保留玩家的版本；
 * - 没有安装记录（旧版本启动器安装的）时：新版本里没有的模组移到备份文件夹，要替换的文件先备份，
 *   按键等个人设置保留现有的
 */
function modpackUpdateStep(
  path: string,
  versionName: string,
  old: ModpackRecord | null,
  source?: ModpackSource
): InstallExtraStep {
  /** 全部装好后要做的事（删除旧文件、保存安装记录） */
  let finish: (() => Promise<void>) | null = null
  const step: InstallExtraStep = async (context, gameDir) => {
    const { parsed, extract, downloads } = await collectModpackFiles(path, versionName)
    const entryHashes = await hashEntries(
      path,
      extract.map((o) => o.entryName)
    )
    /** 新版本的文件：相对路径 → SHA-1（部分 CurseForge 文件没有 SHA-1） */
    const nextFiles = new Map<string, string | undefined>()
    for (const o of extract) nextFiles.set(o.rel, entryHashes.get(o.entryName))
    for (const d of downloads) nextFiles.set(d.path, d.sha1?.toLowerCase())
    const nextLower = new Set([...nextFiles.keys()].map((rel) => rel.toLowerCase()))
    const oldFiles = old?.files ?? {}
    const allowed = allowedFor(versionName)
    const backupDir = join(gameDir, 'liuli-modpack-backup', new Date().toISOString().replace(/[:.]/g, '-'))
    const backup = async (rel: string): Promise<void> => {
      const target = safeJoin(backupDir, rel)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(safeJoin(gameDir, rel), target)
    }

    // 决定每个新文件要不要写入
    /** 保留了玩家版本的文件 */
    const kept: string[] = []
    const destinationOf = async (rel: string, sha1: string | undefined): Promise<string | null> => {
      // 玩家禁用的模组：更新后仍然禁用
      let target = rel
      if (isModJar(rel) && !(await stat(safeJoin(gameDir, rel)).catch(() => null))) {
        if (await stat(safeJoin(gameDir, `${rel}.disabled`)).catch(() => null)) target = `${rel}.disabled`
      }
      const abs = safeJoin(gameDir, target)
      // 存档：已经有的世界里一个文件都不写（整合包的地图文件不能混进玩家的世界），只放整合包新带来的世界
      if (inSaves(rel)) {
        // 用原来的大小写（normalizedSegments 转成了小写，区分大小写的系统上会找不到世界文件夹）
        const world = rel
          .split(/[\\/]+/)
          .filter(Boolean)
          .slice(0, 2)
        if (world.length < 2 || (await stat(safeJoin(gameDir, world.join('/'))).catch(() => null))) {
          kept.push(rel)
          return null
        }
      }
      // 版本文件夹里被换成符号链接的文件：删掉链接再写，不顺着链接写到别处
      if (await isSymlink(abs)) await rm(abs, { force: true })
      const current = await currentSha1(abs)
      if (current === null) return abs
      // 内容相同，或者不知道新文件的 SHA-1（文件名里带版本号，同名就是同一个文件）
      if (!sha1 || current === sha1) return null
      if (inSaves(rel)) {
        kept.push(rel)
        return null
      }
      if (old) {
        // 模组总是换成新版本；其他文件玩家没改过才替换
        if (isModJar(rel) || current === oldFiles[rel]) return abs
        kept.push(rel)
        return null
      }
      // 没有安装记录：个人设置保留现有的，其他文件先备份再替换
      if (PERSONAL_FILES.includes(rel.toLowerCase())) {
        kept.push(rel)
        return null
      }
      await backup(target)
      return abs
    }

    const files: { entryName: string; target: string; size: number }[] = []
    for (const o of extract) {
      const target = await destinationOf(o.rel, entryHashes.get(o.entryName))
      if (target) files.push({ entryName: o.entryName, target, size: o.size })
    }
    const toDownload: { urls: string[]; destination: string; sha1?: string; size?: number }[] = []
    for (const d of downloads) {
      const target = await destinationOf(d.path, d.sha1?.toLowerCase())
      if (target) toDownload.push({ urls: d.urls, destination: target, sha1: d.sha1, size: d.size })
    }
    if (files.length > 0) await context.yield(new ExtractTask(path, files).setName('modpackOverrides'))
    if (toDownload.length > 0) {
      await context.yield(
        new WatchedDownloadTask(toDownload, { 'User-Agent': MODRINTH_USER_AGENT }).setName('modpackFiles')
      )
    }
    if (kept.length > 0)
      console.info(`更新整合包时保留了玩家修改过的 ${kept.length} 个文件：${kept.slice(0, 20).join('、')}`)

    finish = async () => {
      // 删除新版本不再包含的文件（新文件全部写好、游戏和加载器也装好后才删，中途失败时旧版本的文件还在）
      if (old) {
        for (const [rel, sha1] of Object.entries(oldFiles)) {
          if (nextLower.has(rel.toLowerCase()) || inSaves(rel) || !isSafePath(rel) || !allowed(rel)) continue
          for (const candidate of isModJar(rel) ? [rel, `${rel}.disabled`] : [rel]) {
            const abs = safeJoin(gameDir, candidate)
            if ((await currentSha1(abs)) === sha1) await rm(abs, { force: true })
          }
        }
      } else {
        // 没有安装记录：不知道哪些模组是整合包的，新版本里没有的模组移到备份文件夹（玩家自己加的模组可以从那里找回）
        const modsDir = join(gameDir, 'mods')
        for (const name of await readdir(modsDir).catch(() => [] as string[])) {
          if (!/\.jar(\.disabled)?$/i.test(name)) continue
          const rel = `mods/${name.replace(/\.disabled$/i, '')}`
          if (nextLower.has(rel.toLowerCase())) continue
          const target = safeJoin(backupDir, `mods/${name}`)
          await mkdir(dirname(target), { recursive: true })
          await rename(join(modsDir, name), target)
        }
      }

      // 新的安装记录：记录整合包这个版本的文件（玩家改过的文件下次更新时仍然算作改过）
      const recorded: Record<string, string> = {}
      for (const [rel, sha1] of nextFiles) {
        const value = sha1 ?? (await currentSha1(safeJoin(gameDir, rel)).catch(() => null))
        if (value) recorded[rel] = value
      }
      const root = (await getSettings()).gameDir
      await writeModpackRecord(root, versionName, newRecord(parsed.info, recorded, source))
    }
  }
  step.before = (context) => preseedAssets(context, path)
  step.after = async () => {
    await finish?.()
  }
  return step
}

/** 准备好的整合包更新（确认后开始，只使用主进程自己记录的文件路径） */
let pendingUpdate: {
  versionId: string
  token: string
  path: string
  info: ModpackInfo
  source?: ModpackSource
} | null = null

/** 整合包的某个版本是不是正式版以外的版本（测试版只在当前也是测试版时提示） */
function isStable(version: ModrinthProjectVersion): boolean {
  return version.versionType === 'release'
}

/** 检查整合包有没有新版本（只有从下载页安装的整合包能在线检查） */
export async function checkModpackUpdate(versionId: string): Promise<ModpackUpdateCheck> {
  assertSafeId(versionId)
  const { gameDir } = await getSettings()
  const record = await readModpackRecord(gameDir, versionId)
  if (!record?.source) return { current: record ? installedModpackOf(record) : null, updates: [], online: false }
  const { platform, projectId } = record.source
  const versions =
    platform === 'curseforge'
      ? await getCurseForgeVersions(projectId, 'modpack')
      : await getProjectVersions(projectId, 'modpack')
  // 从文件更新过的整合包没有版本 ID，按版本号找
  const current =
    versions.find((v) => v.id === record.source?.versionId) ??
    versions.find((v) => record.version && v.versionNumber === record.version)
  const sorted = [...versions].sort((a, b) => b.datePublished.localeCompare(a.datePublished))
  const updates = sorted
    .filter((v) => (current ? v.datePublished > current.datePublished && v.id !== current.id : true))
    .filter((v) => isStable(v) || (current ? !isStable(current) : false))
    .slice(0, 20)
  return { current: installedModpackOf(record), updates, online: true }
}

/** 下载整合包的新版本并读取信息（确认后再开始更新） */
export async function prepareModpackUpdate(versionId: string, packVersionId: string): Promise<ModpackUpdatePlan> {
  assertSafeId(versionId)
  const { gameDir } = await getSettings()
  const record = await readModpackRecord(gameDir, versionId)
  if (!record?.source) throw new Error('这个版本不是从下载页安装的整合包，请用整合包文件更新')
  // 版本 ID 会拼进下载地址：只接受接口返回的格式
  if (typeof packVersionId !== 'string' || !isModpackVersionId(record.source.platform, packVersionId)) {
    throw new Error('无效的整合包版本')
  }
  // 只能更新成同一个整合包的版本
  const sameProject =
    record.source.platform === 'curseforge'
      ? packVersionId.startsWith(`${record.source.projectId}:`)
      : !isCurseForgeId(packVersionId)
  if (!sameProject) throw new Error('只能更新为同一个整合包的版本')
  const { path, source } = await fetchModpackVersion(packVersionId)
  if (source.projectId !== record.source.projectId) throw new Error('只能更新为同一个整合包的版本')
  const { info } = await parseModpack(path)
  const token = randomUUID()
  pendingUpdate = { versionId, token, path, info, source }
  return { versionId, token, current: installedModpackOf(record), next: info }
}

/** 选择整合包文件来更新（离线导入的整合包，或旧版本启动器安装的整合包），取消时返回 null */
export async function pickModpackUpdateFile(
  versionId: string,
  win: BrowserWindow | null
): Promise<ModpackUpdatePlan | null> {
  assertSafeId(versionId)
  const options: Electron.OpenDialogOptions = {
    title: '选择新版本的整合包',
    filters: [{ name: '整合包（Modrinth / CurseForge / MultiMC / MCBBS）', extensions: EXTENSIONS }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  const { gameDir } = await getSettings()
  const record = await readModpackRecord(gameDir, versionId)
  const { info } = await parseModpack(path)
  // 同一个整合包：保留来源（以后仍可在线检查，按版本号对应），否则不再记录来源
  const source = record?.source && record.name === info.name ? { ...record.source, versionId: '' } : undefined
  const token = randomUUID()
  pendingUpdate = { versionId, token, path, info, source }
  return { versionId, token, current: record ? installedModpackOf(record) : null, next: info }
}

/** 开始更新整合包（游戏本体与模组加载器按新版本重新安装到同一个版本里） */
export async function applyModpackUpdate(versionId: string, token: string): Promise<void> {
  assertSafeId(versionId)
  // 只更新确认页上显示的那一次准备（同时准备了别的版本时，旧的确认页不能用）
  if (!pendingUpdate || pendingUpdate.versionId !== versionId || pendingUpdate.token !== token) {
    throw new Error('要更新的版本已经变了，请重新选择')
  }
  // 立即取走（两次很快的点击只有第一次生效）
  const { path, info, source } = pendingUpdate
  pendingUpdate = null
  assertIdle()
  assertGameStopped(versionId)
  const { gameDir } = await getSettings()
  if (!(await stat(join(gameDir, 'versions', versionId)).catch(() => null))?.isDirectory()) {
    throw new Error('找不到这个版本')
  }
  const record = await readModpackRecord(gameDir, versionId)
  await startCustomInstall(toRequest(info, versionId), true, modpackUpdateStep(path, versionId, record, source))
}

/** 整合包名称转为可用的版本名：去掉不能用的字符，已有同名版本时在后面加 (2)、(3)… */
async function availableVersionName(base: string): Promise<string> {
  const cleaned =
    base
      .replace(/[\\/:*?"<>|&^%\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+$/, '')
      .slice(0, 56)
      .trim() || '整合包'
  const versionsDir = join((await getSettings()).gameDir, 'versions')
  const taken = new Set((await readdir(versionsDir).catch(() => [] as string[])).map((n) => n.toLowerCase()))
  let name = cleaned
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${cleaned} (${i})`
  return name
}

/**
 * 下载页一键安装：下载整合包后直接开始安装（不经过安装确认页）。
 * 版本名自动取「整合包名称 版本号」，返回实际使用的版本名
 */
export async function downloadAndInstallModpack(versionId: string): Promise<string> {
  // 先检查有没有正在进行的安装，避免下载完才发现不能安装
  assertIdle()
  const info = await downloadModpack(versionId)
  const name = await availableVersionName(`${info.name} ${info.version}`)
  await installModpack(name)
  return name
}

/** 安装最近选择的整合包 */
export async function installModpack(name: string): Promise<void> {
  if (!pending) throw new Error('请先选择整合包')
  const { path, info, source } = pending
  await startCustomInstall(toRequest(info, name), false, modpackStep(path, name, source))
}
