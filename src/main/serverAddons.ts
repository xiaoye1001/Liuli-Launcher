/**
 * 一键开服的数据包和模组：
 * - 数据包：放在服务器存档（server.properties 的 level-name，默认 world）的 datapacks 文件夹，
 *   只收根目录有 pack.mcmeta 的 .zip；停用时改名成 .zip.disabled
 * - Fabric 服务端：从 Fabric 官方元数据下载服务端启动器（选择 BMCLAPI 时先走镜像），它会用文件夹里
 *   校验过的 server.jar 启动；第一次启动时由它自己下载 Fabric 需要的文件
 * - 服务端模组：mods 文件夹，只收 Fabric 模组；声明了只能在客户端用（environment: client）的不装。
 *   可以从客户端的 Fabric 版本里导入，会自动跳过只能在客户端用的模组
 * 服务器运行时不能改，下次启动生效
 */
import { BrowserWindow, dialog, shell } from 'electron'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { getSettings } from './config'
import { getFabricLoaders } from './install'
import { getLocalServerStatus, listLocalServers, localServerDir } from './localServer'
import { listModFiles, modsContextOf } from './mods'
import { FABRIC_JAR, LOADER_FILE, serverLoaderOf } from './serverLoader'
import type { ServerAddonFile, ServerAddonKind, ServerAddons, ServerModImportResult } from '../shared/types'

const FABRIC_META = 'https://meta.fabricmc.net'
const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const DISABLED = '.disabled'
/** 数据包、模组文件的大小上限 */
const MAX_FILE = 300 * 1024 * 1024
/** Fabric 服务端启动器只有几百 KB */
const MAX_LAUNCHER = 20 * 1024 * 1024

function assertStopped(id: string): void {
  const s = getLocalServerStatus().status
  if (s.id === id && s.state !== 'stopped' && s.state !== 'error') {
    throw new Error('服务器正在运行，请先停止再改数据包和模组')
  }
}

async function serverOf(id: string): Promise<{ dir: string; version: string }> {
  const dir = localServerDir(id)
  const server = (await listLocalServers()).find((s) => s.id === id)
  if (!server) throw new Error('找不到这个服务器')
  return { dir, version: server.version }
}

/** 存档文件夹名：server.properties 的 level-name（只接受普通的文件夹名） */
async function worldName(dir: string): Promise<string> {
  const text = await readFile(join(dir, 'server.properties'), 'utf-8').catch(() => '')
  const line = text.split(/\r?\n/).find((l) => /^\s*level-name\s*=/.test(l))
  const value = line ? line.slice(line.indexOf('=') + 1).trim() : ''
  if (!value || value.length > 64 || /[\\/:*?"<>|\u0000-\u001f]/.test(value) || /^\.+$/.test(value)) return 'world'
  return value
}

function folderOf(dir: string, kind: ServerAddonKind, world: string): string {
  return kind === 'datapack' ? join(dir, world, 'datapacks') : join(dir, 'mods')
}

const PATTERNS: Record<ServerAddonKind, RegExp> = {
  datapack: /\.zip(\.disabled)?$/i,
  mod: /\.jar(\.disabled)?$/i
}

function assertFileName(kind: ServerAddonKind, fileName: unknown): string {
  const name = typeof fileName === 'string' ? fileName : ''
  if (!name || name !== basename(name) || name.startsWith('.') || !PATTERNS[kind].test(name)) {
    throw new Error('无效的文件名')
  }
  return name
}

async function listFolder(path: string, kind: ServerAddonKind): Promise<ServerAddonFile[]> {
  const out: ServerAddonFile[] = []
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('.')) continue
    const full = join(path, entry.name)
    if (entry.isFile() && PATTERNS[kind].test(entry.name)) {
      const info = await stat(full).catch(() => null)
      out.push({
        fileName: entry.name,
        name: entry.name.replace(/\.disabled$/i, ''),
        size: info?.size ?? 0,
        enabled: !entry.name.toLowerCase().endsWith(DISABLED),
        folder: false
      })
    } else if (kind === 'datapack' && entry.isDirectory()) {
      // 文件夹形式的数据包：只能删，不能停用
      if (await stat(join(full, 'pack.mcmeta')).catch(() => null)) {
        out.push({ fileName: entry.name, name: entry.name, size: 0, enabled: true, folder: true })
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listServerAddons(id: string): Promise<ServerAddons> {
  const { dir } = await serverOf(id)
  const world = await worldName(dir)
  return {
    serverId: id,
    world,
    worldExists: !!(await stat(join(dir, world, 'level.dat')).catch(() => null)),
    loader: await serverLoaderOf(dir),
    datapacks: await listFolder(folderOf(dir, 'datapack', world), 'datapack'),
    mods: await listFolder(folderOf(dir, 'mod', world), 'mod')
  }
}

/** 读压缩包里的文件名单和某个文件 */
async function inspectZip(path: string): Promise<{ names: Set<string>; read: (name: string) => Promise<string> }> {
  const zip = await open(path).catch(() => {
    throw new Error(`${basename(path)} 不是有效的压缩包`)
  })
  try {
    const entries = await readAllEntries(zip)
    const byName = new Map(entries.map((e) => [e.fileName, e]))
    const cache = new Map<string, string>()
    for (const name of ['pack.mcmeta', 'fabric.mod.json', 'quilt.mod.json', 'META-INF/MANIFEST.MF']) {
      const entry = byName.get(name)
      if (entry && entry.uncompressedSize < 1024 * 1024)
        cache.set(name, (await readEntry(zip, entry)).toString('utf-8'))
    }
    return {
      names: new Set(byName.keys()),
      read: async (name) => cache.get(name) ?? ''
    }
  } finally {
    zip.close()
  }
}

/** 数据包：根目录要有 pack.mcmeta（GitHub 下载的源码包外面多一层文件夹，游戏认不出来） */
async function checkDatapack(path: string): Promise<void> {
  const zip = await inspectZip(path)
  if (zip.names.has('pack.mcmeta')) return
  const nested = [...zip.names].some((n) => /^[^/]+\/pack\.mcmeta$/.test(n))
  throw new Error(
    nested
      ? `${basename(path)} 外面多套了一层文件夹，游戏认不出来：解压后把里面那个文件夹重新压缩再添加`
      : `${basename(path)} 不是数据包（里面没有 pack.mcmeta）`
  )
}

/** 模组的运行环境：client / server / *；不是 Fabric 模组时返回 null */
async function fabricEnvironment(path: string): Promise<string | null> {
  const zip = await inspectZip(path)
  const text = (await zip.read('fabric.mod.json')) || (await zip.read('quilt.mod.json'))
  if (!text) return null
  try {
    const json = JSON.parse(text) as {
      environment?: unknown
      quilt_loader?: unknown
      minecraft?: { environment?: unknown }
    }
    const env = json.environment ?? json.minecraft?.environment
    return typeof env === 'string' ? env : '*'
  } catch {
    return '*'
  }
}

async function uniquePath(folder: string, name: string): Promise<string> {
  let path = join(folder, name)
  const dot = name.toLowerCase().endsWith('.zip') || name.toLowerCase().endsWith('.jar') ? name.length - 4 : name.length
  for (let n = 2; await stat(path).catch(() => null); n++) {
    path = join(folder, `${name.slice(0, dot)} (${n})${name.slice(dot)}`)
  }
  return path
}

/** 选择文件添加数据包或模组；返回添加的个数和跳过的原因 */
export async function addServerAddons(
  win: BrowserWindow | null,
  id: string,
  kind: ServerAddonKind
): Promise<{ added: string[]; skipped: string[] }> {
  assertStopped(id)
  const { dir } = await serverOf(id)
  if (kind === 'mod' && !(await serverLoaderOf(dir))) throw new Error('先装上 Fabric 服务端才能装模组')
  const options: Electron.OpenDialogOptions = {
    title: kind === 'datapack' ? '选择数据包（.zip）' : '选择 Fabric 模组（.jar）',
    properties: ['openFile', 'multiSelections'],
    filters:
      kind === 'datapack' ? [{ name: '数据包', extensions: ['zip'] }] : [{ name: 'Fabric 模组', extensions: ['jar'] }]
  }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (picked.canceled) return { added: [], skipped: [] }
  return addServerAddonFiles(id, kind, picked.filePaths)
}

export async function addServerAddonFiles(
  id: string,
  kind: ServerAddonKind,
  paths: string[]
): Promise<{ added: string[]; skipped: string[] }> {
  assertStopped(id)
  const { dir } = await serverOf(id)
  const folder = folderOf(dir, kind, await worldName(dir))
  const added: string[] = []
  const skipped: string[] = []
  for (const path of paths.slice(0, 100)) {
    const name = basename(path)
    try {
      if (!(kind === 'datapack' ? /\.zip$/i : /\.jar$/i).test(name)) throw new Error(`${name} 的类型不对`)
      const info = await stat(path)
      if (!info.isFile() || info.size > MAX_FILE) throw new Error(`${name} 太大或者不是文件`)
      if (kind === 'datapack') await checkDatapack(path)
      else {
        const env = await fabricEnvironment(path)
        if (env === null) throw new Error(`${name} 不是 Fabric 模组`)
        if (env === 'client') throw new Error(`${name} 只能在客户端用，服务器不需要`)
      }
      await mkdir(folder, { recursive: true })
      await copyFile(path, await uniquePath(folder, name))
      added.push(name)
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { added, skipped }
}

/** 启用 / 停用（改名加上或去掉 .disabled） */
export async function setServerAddonEnabled(
  id: string,
  kind: ServerAddonKind,
  fileName: unknown,
  enabled: boolean
): Promise<void> {
  assertStopped(id)
  const { dir } = await serverOf(id)
  const name = assertFileName(kind, fileName)
  const folder = folderOf(dir, kind, await worldName(dir))
  const isDisabled = name.toLowerCase().endsWith(DISABLED)
  if (enabled === !isDisabled) return
  const next = enabled ? name.slice(0, -DISABLED.length) : `${name}${DISABLED}`
  if (await stat(join(folder, next)).catch(() => null)) throw new Error('已经有一个同名的文件')
  await rename(join(folder, name), join(folder, next))
}

/** 删除：移到回收站 */
export async function removeServerAddon(id: string, kind: ServerAddonKind, fileName: unknown): Promise<void> {
  assertStopped(id)
  const { dir } = await serverOf(id)
  const folder = folderOf(dir, kind, await worldName(dir))
  const name = typeof fileName === 'string' ? fileName : ''
  // 文件夹形式的数据包
  const folderPack =
    kind === 'datapack' &&
    name === basename(name) &&
    !name.startsWith('.') &&
    !!(await stat(join(folder, name, 'pack.mcmeta')).catch(() => null))
  const target = join(folder, folderPack ? name : assertFileName(kind, name))
  await shell.trashItem(target)
}

/** 从客户端的 Fabric 版本导入模组（只导入启用的；跳过只能在客户端用的、已经有的） */
export async function importServerMods(id: string, versionId: string): Promise<ServerModImportResult> {
  assertStopped(id)
  const { dir, version } = await serverOf(id)
  if (!(await serverLoaderOf(dir))) throw new Error('先装上 Fabric 服务端才能装模组')
  const ctx = await modsContextOf(versionId)
  if (ctx.loader !== 'fabric' && ctx.loader !== 'quilt') throw new Error('只能从 Fabric 版本导入模组')
  if (ctx.minecraftVersion !== version) {
    throw new Error(`游戏版本不一样：这个版本是 ${ctx.minecraftVersion}，服务器是 ${version}`)
  }
  const folder = join(dir, 'mods')
  await mkdir(folder, { recursive: true })
  const existing = new Set(
    (await readdir(folder).catch(() => [] as string[])).map((n) => n.replace(/\.disabled$/i, '').toLowerCase())
  )
  const result: ServerModImportResult = { copied: [], clientOnly: [], existing: [], invalid: [] }
  for (const name of await listModFiles(ctx.dir)) {
    if (!/\.jar$/i.test(name)) continue
    const path = join(ctx.dir, name)
    if (existing.has(name.toLowerCase())) {
      result.existing.push(name)
      continue
    }
    const env = await fabricEnvironment(path).catch(() => null)
    if (env === null) result.invalid.push(name)
    else if (env === 'client') result.clientOnly.push(name)
    else {
      await copyFile(path, join(folder, name))
      result.copied.push(name)
    }
  }
  return result
}

/** 请求 Fabric 元数据：选择 BMCLAPI 时先走镜像，失败再用官方地址 */
async function fabricGet(path: string): Promise<Response> {
  const { downloadSource } = await getSettings()
  const urls = [`${FABRIC_META}${path}`]
  if (downloadSource === 'bmclapi') urls.unshift(`${BMCLAPI}/fabric-meta${path}`)
  let last: unknown
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' })
      // 镜像可能跳转到它的下载节点：最后的地址也必须是 https
      if (response.ok && (!response.url || response.url.startsWith('https://'))) return response
      last = new Error(`HTTP ${response.status}`)
    } catch (e) {
      last = e
    }
  }
  throw new Error(`连不上 Fabric 的服务器：${last instanceof Error ? last.message : String(last)}`)
}

/** 装 Fabric 服务端：用最新的稳定版加载器 */
export async function installFabricServer(id: string): Promise<{ loader: string }> {
  assertStopped(id)
  const { dir, version } = await serverOf(id)
  if (!(await stat(join(dir, 'server.jar')).catch(() => null))) throw new Error('原版服务端还没有下载好')
  const loaders = await getFabricLoaders(version).catch((e) => {
    throw new Error(`获取 Fabric 版本失败：${e instanceof Error ? e.message : String(e)}`)
  })
  const loader = (loaders.find((l) => l.stable) ?? loaders[0])?.version
  if (!loader || !/^[0-9A-Za-z.+-]{1,40}$/.test(loader)) throw new Error(`Fabric 还不支持 ${version}`)
  const installers = (await (await fabricGet('/v2/versions/installer')).json()) as {
    version?: unknown
    stable?: unknown
  }[]
  const installer = (Array.isArray(installers) ? installers : []).find(
    (i) => i?.stable === true && typeof i.version === 'string' && /^[0-9A-Za-z.+-]{1,40}$/.test(i.version)
  )?.version as string | undefined
  if (!installer) throw new Error('获取 Fabric 安装器版本失败')
  const response = await fabricGet(
    `/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loader)}/${encodeURIComponent(installer)}/server/jar`
  )
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length < 100 || data.length > MAX_LAUNCHER) throw new Error('下载的 Fabric 服务端无效')
  const part = join(dir, `${FABRIC_JAR}.part`)
  await writeFile(part, data)
  try {
    const manifest = await (await inspectZip(part)).read('META-INF/MANIFEST.MF')
    if (!/^Main-Class:\s*net\.fabricmc\./m.test(manifest)) throw new Error('下载的 Fabric 服务端无效')
  } catch (e) {
    await rm(part, { force: true })
    throw e
  }
  await rename(part, join(dir, FABRIC_JAR))
  // 让 Fabric 用文件夹里已经校验过的原版服务端
  await writeFile(join(dir, 'fabric-server-launcher.properties'), 'serverJar=server.jar\n', 'utf-8')
  await writeFile(join(dir, LOADER_FILE), JSON.stringify({ loader: 'fabric', version: loader, installer }), 'utf-8')
  await mkdir(join(dir, 'mods'), { recursive: true })
  return { loader }
}

/** 换回原版服务端（mods 文件夹留着，原版不会加载它） */
export async function removeFabricServer(id: string): Promise<void> {
  assertStopped(id)
  const { dir } = await serverOf(id)
  await rm(join(dir, LOADER_FILE), { force: true })
  await rm(join(dir, FABRIC_JAR), { force: true })
}
