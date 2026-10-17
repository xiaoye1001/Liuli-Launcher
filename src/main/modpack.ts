import { createHash } from 'crypto'
import { BrowserWindow, dialog } from 'electron'
import { DownloadMultipleTask } from '@xmcl/installer'
import { AbortableTask, CancelledError } from '@xmcl/task'
import { open, openEntryReadStream, readAllEntries, readEntry } from '@xmcl/unzip'
import { createWriteStream } from 'fs'
import { mkdir, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'path'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { startCustomInstall, type InstallExtraStep } from './install'
import { downloadModpackFile, modrinthFileUrls, MODRINTH_USER_AGENT } from './modrinth'
import { getSettings } from './config'
import { installDispatcher } from './network'
import type { InstallRequest, ModpackInfo } from '../shared/types'

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
 * 整合包里属于公共游戏目录的文件夹（有些网盘「完整包」把整个 .minecraft 都打包进来了）：
 * 安装前解压到游戏目录根部，安装原版和加载器时校验通过就不再下载
 */
const SHARED_FOLDERS = ['assets/', 'libraries/']
/** 不解压的文件夹：版本文件由启动器自己生成 */
const SKIPPED_FOLDERS = ['versions/']

function isShared(rel: string): boolean {
  return SHARED_FOLDERS.some((f) => rel.startsWith(f))
}

type Loader = ModpackInfo['loader']
/** 各格式解析的结果（之后统一整理要复制的文件） */
type Parsed = Omit<ParsedModpack, 'overrides'>

// ---------- 路径安全 ----------

/** 只允许整合包写入游戏目录内部，防止 ../ 之类的路径写到其他地方 */
function isSafePath(path: string): boolean {
  if (!path || isAbsolute(path) || /^[a-zA-Z]:/.test(path)) return false
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
  const files = index.files.filter((f) => f.env?.client !== 'unsupported')
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
    const byName = new Map(entries.map((e) => [e.fileName, e]))
    const listing: ZipListing = {
      names: entries.map((e) => e.fileName),
      read: async (name) => {
        const entry = byName.get(name)
        if (!entry) throw new Error(`整合包中缺少 ${name}`)
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
        if (!rel || SKIPPED_FOLDERS.some((f) => rel.startsWith(f))) continue
        overrideMap.set(rel, { entryName: entry.fileName, rel, size: entry.uncompressedSize })
      }
    }
    const overrides = [...overrideMap.values()]

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
        provided.add(
          createHash('sha1')
            .update(await readEntry(zipFile, entry))
            .digest('hex')
        )
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

/** 用户最近选择的整合包（安装时只使用主进程自己记录的路径，不接受界面传入的路径） */
let pending: { path: string; info: ModpackInfo } | null = null

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
export async function loadModpack(path: string): Promise<ModpackInfo> {
  const { info } = await parseModpack(path)
  pending = { path, info }
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

/** 从 Modrinth 下载整合包的某个版本并读取信息 */
export async function downloadModpack(modrinthVersionId: string): Promise<ModpackInfo> {
  return loadModpack(await downloadModpackFile(modrinthVersionId))
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
    const zip = await open(this.zipPath)
    try {
      const byName = new Map((await readAllEntries(zip)).map((e) => [e.fileName, e]))
      for (const file of this.files) {
        if (this.aborted) throw new CancelledError()
        const entry = byName.get(file.entryName)
        if (!entry) continue
        await mkdir(dirname(file.target), { recursive: true })
        const stream = await openEntryReadStream(zip, entry)
        this.stream = stream
        stream.on('data', (chunk: Buffer) => this.update(chunk.length))
        await pipeline(stream, createWriteStream(file.target))
        this.stream = null
      }
    } finally {
      zip.close()
    }
  }

  protected abort(): void {
    this.aborted = true
    this.stream?.destroy(new CancelledError())
  }

  protected isAbortedError(e: unknown): boolean {
    return this.aborted || e instanceof CancelledError
  }
}

/**
 * 一次下载多个文件，总大小一开始就按整合包里写的大小计算。
 * xmcl 只在每个文件开始下载后才知道它的大小，几百个模组时总大小会越下越大
 */
class SizedDownloadTask extends DownloadMultipleTask {
  constructor(
    options: ConstructorParameters<typeof DownloadMultipleTask>[0],
    private readonly expectedTotal: number
  ) {
    super(options)
  }

  get total(): number {
    return Math.max(super.total, this.expectedTotal)
  }
}

/**
 * 整合包的安装步骤：
 * - 安装原版之前：把整合包自带的 assets、libraries 解压到游戏目录根部，原版与加载器的文件校验通过就不再下载；
 * - 安装之后：先把整合包自带的其余文件解压到该版本的游戏目录，再下载清单里缺少的模组（压缩包里已经有的跳过）
 */
function modpackStep(path: string): InstallExtraStep {
  const step: InstallExtraStep = async (context, gameDir) => {
    const parsed = await parseModpack(path)
    const included = new Set(parsed.overrides.map((o) => o.rel.toLowerCase()))
    const modrinthFiles = await Promise.all(
      parsed.downloads
        .filter((d) => !included.has(d.path.toLowerCase()))
        .map(async (d) => ({ path: d.path, urls: await modrinthFileUrls(d.urls), sha1: d.sha1, size: d.size }))
    )
    let curseFiles: { path: string; urls: string[]; sha1?: string; size?: number }[] = []
    if (parsed.curseFileIds.length > 0) {
      try {
        curseFiles = (await resolveCurseFiles(parsed.curseFileIds)).filter((f) => !included.has(f.path.toLowerCase()))
      } catch (e) {
        // 整合包已经带了全部模组时，查不到下载信息也可以继续安装
        if ((parsed.info.includedMods ?? 0) < parsed.curseFileIds.length) throw e
      }
    }
    // 先把整合包自带的文件解压出来，再下载缺少的文件
    const files = parsed.overrides
      .filter((o) => !isShared(o.rel))
      .map((o) => ({ entryName: o.entryName, target: safeJoin(gameDir, o.rel), size: o.size }))
    if (files.length > 0) await context.yield(new ExtractTask(path, files).setName('modpackOverrides'))

    const downloads = [...modrinthFiles, ...curseFiles]
    if (downloads.length > 0) {
      await context.yield(
        new SizedDownloadTask(
          downloads.map((d) => ({
            url: d.urls,
            destination: safeJoin(gameDir, d.path),
            validator: d.sha1 ? { algorithm: 'sha1', hash: d.sha1 } : undefined,
            headers: { 'User-Agent': MODRINTH_USER_AGENT },
            dispatcher: installDispatcher()
          })),
          downloads.reduce((sum, d) => sum + (d.size ?? 0), 0)
        ).setName('modpackFiles')
      )
    }
  }
  step.before = async (context) => {
    const parsed = await parseModpack(path)
    const shared = parsed.overrides.filter((o) => isShared(o.rel))
    if (shared.length === 0) return
    const root = (await getSettings()).gameDir
    await context.yield(
      new ExtractTask(
        path,
        shared.map((o) => ({ entryName: o.entryName, target: safeJoin(root, o.rel), size: o.size }))
      ).setName('modpackGameFiles')
    )
  }
  return step
}

/** 安装最近选择的整合包 */
export async function installModpack(name: string): Promise<void> {
  if (!pending) throw new Error('请先选择整合包')
  const { path, info } = pending
  await startCustomInstall(toRequest(info, name), false, modpackStep(path))
}
