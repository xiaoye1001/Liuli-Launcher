/**
 * 插件（沙箱插件）：插件是一个 zip（manifest.json + 网页、脚本、图片），装到启动器数据文件夹的 plugins 里。
 *
 * 安全：
 * - 插件页面显示在界面里一个 sandbox 的 iframe 中（没有 allow-same-origin：独立的空白来源，碰不到启动器的页面、
 *   存储和 window.api），页面的 CSP 只允许加载插件自己的文件，不能直接联网
 * - 插件只能通过 postMessage 调用这里列出的接口；每种接口要在 manifest 里声明、安装时用户同意后才能用；
 *   联网只能访问 manifest 里写明的 https 网站，不跟随跳转
 * - 插件碰不到账号、登录令牌、密钥和电脑上的文件；每个插件只有自己的一小块存储
 */
import { app, BrowserWindow, clipboard, dialog, nativeImage, net, shell } from 'electron'
import { randomBytes } from 'crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { extname, join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { getGameStatus, launchGame, listInstalledVersions } from './launch'
import { notify } from './notify'
import { listMods } from './mods'
import { listWorldInfos } from './worlds'
import { listScreenshots, screenshotPath } from './screenshots'
import { listServers } from './servers'
import type { PluginInfo, PluginManifest, PluginPending, PluginPermission } from '../shared/types'
import { PLUGIN_PERMISSIONS } from '../shared/types'

const ROOT = join(app.getPath('userData'), 'plugins')
const PENDING_DIR = join(ROOT, '.pending')
const STATE_FILE = join(ROOT, 'plugins.json')
const DATA_DIR = join(app.getPath('userData'), 'plugin-data')

const ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/
const MAX_ENTRIES = 500
const MAX_FILE = 10 * 1024 * 1024
const MAX_TOTAL = 30 * 1024 * 1024
const MAX_DATA = 1024 * 1024
const MAX_PLUGINS = 50

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
}

interface PluginState {
  id: string
  enabled: boolean
  installedAt: number
}

// ---------- manifest ----------

const text = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** 插件里的相对路径：只能是普通的文件夹和文件名 */
function safeRelative(path: unknown): string | null {
  if (typeof path !== 'string' || !path || path.length > 200) return null
  const parts = path.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..' || /[\\:*?"<>|\u0000-\u001f]/.test(p))) return null
  return parts.join('/')
}

export function parseManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('manifest.json 格式不对')
  const m = raw as Record<string, unknown>
  const id = typeof m.id === 'string' ? m.id : ''
  if (!ID_RE.test(id)) throw new Error('插件 id 只能是小写字母、数字和 -，3～40 个字符')
  const name = text(m.name, 40)
  if (!name) throw new Error('插件没有名字（name）')
  const version = typeof m.version === 'string' && /^[0-9A-Za-z.+-]{1,20}$/.test(m.version) ? m.version : ''
  if (!version) throw new Error('插件版本号（version）格式不对')
  const entry = safeRelative(m.entry ?? 'index.html')
  if (!entry || extname(entry).toLowerCase() !== '.html') throw new Error('插件入口（entry）要是插件里的 .html 文件')
  const permissions: PluginPermission[] = []
  for (const p of Array.isArray(m.permissions) ? m.permissions : []) {
    if (!PLUGIN_PERMISSIONS.includes(p as PluginPermission)) throw new Error(`不认识的权限：${String(p).slice(0, 40)}`)
    if (!permissions.includes(p as PluginPermission)) permissions.push(p as PluginPermission)
  }
  const hosts: string[] = []
  for (const h of Array.isArray(m.hosts) ? m.hosts : []) {
    const host = typeof h === 'string' ? h.trim().toLowerCase() : ''
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
      throw new Error(`联网网站（hosts）格式不对：${String(h).slice(0, 60)}，只能写域名，例如 api.example.com`)
    }
    if (!hosts.includes(host)) hosts.push(host)
  }
  if (hosts.length > 20) throw new Error('联网网站（hosts）最多 20 个')
  if (permissions.includes('network') && hosts.length === 0)
    throw new Error('申请了联网权限，但没有写要访问的网站（hosts）')
  if (!permissions.includes('network') && hosts.length > 0)
    throw new Error('写了要访问的网站（hosts），但没有申请联网权限（network）')
  return {
    id,
    name,
    version,
    description: text(m.description, 200),
    author: text(m.author, 40),
    entry,
    permissions,
    hosts
  }
}

// ---------- 状态 ----------

async function readState(): Promise<PluginState[]> {
  try {
    const raw = JSON.parse(await readFile(STATE_FILE, 'utf-8')) as unknown
    return (Array.isArray(raw) ? raw : [])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && ID_RE.test(String(s.id)))
      .map((s) => ({ id: String(s.id), enabled: s.enabled !== false, installedAt: Number(s.installedAt) || 0 }))
  } catch {
    return []
  }
}

async function writeState(list: PluginState[]): Promise<void> {
  await mkdir(ROOT, { recursive: true })
  await writeFile(`${STATE_FILE}.tmp`, JSON.stringify(list, null, 2), 'utf-8')
  await rename(`${STATE_FILE}.tmp`, STATE_FILE)
}

async function manifestOf(id: string): Promise<PluginManifest> {
  return parseManifest(JSON.parse(await readFile(join(ROOT, id, 'manifest.json'), 'utf-8')))
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('plugins:changed')
}

export async function listPlugins(): Promise<PluginInfo[]> {
  const out: PluginInfo[] = []
  for (const s of await readState()) {
    try {
      out.push({ ...(await manifestOf(s.id)), enabled: s.enabled, installedAt: s.installedAt })
    } catch (e) {
      out.push({
        id: s.id,
        name: s.id,
        version: '',
        description: '',
        author: '',
        entry: 'index.html',
        permissions: [],
        hosts: [],
        enabled: false,
        installedAt: s.installedAt,
        error: `插件文件损坏：${e instanceof Error ? e.message : String(e)}`
      })
    }
  }
  return out
}

/** 启用中的插件（有这个权限时） */
async function activePlugin(id: unknown, permission?: PluginPermission): Promise<PluginManifest> {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('无效的插件')
  const state = (await readState()).find((s) => s.id === id)
  if (!state || !state.enabled) throw new Error('插件没有启用')
  const manifest = await manifestOf(id)
  if (permission && !manifest.permissions.includes(permission)) throw new Error(`插件没有「${permission}」权限`)
  return manifest
}

// ---------- 安装 ----------

const pending = new Map<string, { dir: string; manifest: PluginManifest }>()

/** 选一个插件 zip：检查、解压到临时文件夹，等用户确认权限后再装 */
export async function pickPlugin(win: BrowserWindow | null): Promise<PluginPending | null> {
  const options: Electron.OpenDialogOptions = {
    title: '选择插件（.zip）',
    properties: ['openFile'],
    filters: [{ name: '琉璃启动器插件', extensions: ['zip'] }]
  }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (picked.canceled || !picked.filePaths[0]) return null
  return preparePlugin(picked.filePaths[0])
}

/**
 * 拖进启动器的 zip：只看 manifest.json 判断是不是插件。是插件就和「安装插件」一样检查、等用户确认；
 * 不是插件（例如整合包，CurseForge 整合包也有 manifest.json，但里面写的是 minecraft、files）返回 null
 */
export async function preparePluginFile(zipPath: unknown): Promise<PluginPending | null> {
  if (typeof zipPath !== 'string' || !/\.zip$/i.test(zipPath)) return null
  const info = await stat(zipPath).catch(() => null)
  if (!info?.isFile() || info.size > MAX_TOTAL) return null
  const zip = await open(zipPath).catch(() => null)
  if (!zip) return null
  let looksLikePlugin = false
  try {
    const entries = await readAllEntries(zip)
    const names = entries.map((e) => e.fileName)
    const top = names.includes('manifest.json') ? 'manifest.json' : names.find((n) => /^[^/]+\/manifest\.json$/.test(n))
    const entry = top ? entries.find((e) => e.fileName === top) : undefined
    if (entry && entry.uncompressedSize <= 64 * 1024) {
      const raw = JSON.parse((await readEntry(zip, entry)).toString('utf-8')) as Record<string, unknown>
      looksLikePlugin =
        !!raw &&
        typeof raw === 'object' &&
        typeof raw.id === 'string' &&
        !('minecraft' in raw) &&
        !('manifestType' in raw) &&
        !('files' in raw)
    }
  } catch {
    // 读不出来就当作不是插件，交给整合包导入去报错
  } finally {
    zip.close()
  }
  return looksLikePlugin ? preparePlugin(zipPath) : null
}

export async function preparePlugin(zipPath: string): Promise<PluginPending> {
  const info = await stat(zipPath)
  if (!info.isFile() || info.size > MAX_TOTAL) throw new Error('插件文件太大或者不是文件')
  const zip = await open(zipPath).catch(() => {
    throw new Error('不是有效的 zip 文件')
  })
  const token = randomBytes(12).toString('hex')
  const dir = join(PENDING_DIR, token)
  try {
    const entries = (
      await readAllEntries(zip).catch(() => {
        throw new Error('插件里有不安全的文件路径')
      })
    ).filter((e) => !e.fileName.endsWith('/'))
    if (entries.length === 0 || entries.length > MAX_ENTRIES)
      throw new Error(`插件里的文件太多（最多 ${MAX_ENTRIES} 个）`)
    // 外面多套了一层文件夹（例如从 GitHub 下载的）时去掉
    const names = entries.map((e) => e.fileName)
    let prefix = ''
    if (!names.includes('manifest.json')) {
      const top = names.find((n) => /^[^/]+\/manifest\.json$/.test(n))
      if (!top || !names.every((n) => n.startsWith(top.slice(0, top.indexOf('/') + 1)))) {
        throw new Error('插件里没有 manifest.json')
      }
      prefix = top.slice(0, top.indexOf('/') + 1)
    }
    let total = 0
    await mkdir(dir, { recursive: true })
    for (const entry of entries) {
      const rel = safeRelative(entry.fileName.slice(prefix.length))
      if (!rel) throw new Error(`插件里有不安全的文件路径：${entry.fileName.slice(0, 80)}`)
      if (!(extname(rel).toLowerCase() in CONTENT_TYPES)) throw new Error(`插件里有不支持的文件类型：${rel}`)
      if (entry.uncompressedSize > MAX_FILE) throw new Error(`插件里的文件太大：${rel}`)
      total += entry.uncompressedSize
      if (total > MAX_TOTAL) throw new Error('插件太大了（解压后超过 30 MB）')
      const data = await readEntry(zip, entry)
      if (data.length > MAX_FILE) throw new Error(`插件里的文件太大：${rel}`)
      const target = join(dir, ...rel.split('/'))
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, data)
    }
    const manifest = parseManifest(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')))
    if (!(await stat(join(dir, ...manifest.entry.split('/'))).catch(() => null))?.isFile()) {
      throw new Error(`插件里没有入口文件 ${manifest.entry}`)
    }
    const installed = (await readState()).find((s) => s.id === manifest.id)
    const old = installed ? await manifestOf(manifest.id).catch(() => null) : null
    if (!installed && (await readState()).length >= MAX_PLUGINS) throw new Error(`最多装 ${MAX_PLUGINS} 个插件`)
    pending.set(token, { dir, manifest })
    return { token, manifest, update: old ? { version: old.version } : null }
  } catch (e) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw e
  } finally {
    zip.close()
  }
}

/** 用户同意了权限：装上（同一个插件就是更新，插件的数据保留） */
export async function installPlugin(token: unknown): Promise<PluginInfo[]> {
  const item = typeof token === 'string' ? pending.get(token) : undefined
  if (!item) throw new Error('安装已经过期，请重新选择插件')
  pending.delete(String(token))
  const target = join(ROOT, item.manifest.id)
  await rm(target, { recursive: true, force: true })
  await rename(item.dir, target)
  const state = (await readState()).filter((s) => s.id !== item.manifest.id)
  state.push({ id: item.manifest.id, enabled: true, installedAt: Date.now() })
  await writeState(state)
  broadcast()
  return listPlugins()
}

export async function discardPlugin(token: unknown): Promise<void> {
  const item = typeof token === 'string' ? pending.get(token) : undefined
  if (!item) return
  pending.delete(String(token))
  await rm(item.dir, { recursive: true, force: true })
}

export async function setPluginEnabled(id: unknown, enabled: unknown): Promise<PluginInfo[]> {
  const list = await readState()
  const s = list.find((x) => x.id === id)
  if (!s) throw new Error('找不到这个插件')
  s.enabled = enabled === true
  await writeState(list)
  broadcast()
  return listPlugins()
}

/** 卸载：插件文件移到回收站，插件自己的数据一起删掉 */
export async function uninstallPlugin(id: unknown): Promise<PluginInfo[]> {
  const list = await readState()
  if (typeof id !== 'string' || !list.some((x) => x.id === id)) throw new Error('找不到这个插件')
  const dir = join(ROOT, id)
  if (await stat(dir).catch(() => null)) {
    await shell.trashItem(dir).catch(() => rm(dir, { recursive: true, force: true }))
  }
  await rm(join(DATA_DIR, `${id}.json`), { force: true })
  await writeState(list.filter((x) => x.id !== id))
  broadcast()
  return listPlugins()
}

export async function clearPluginData(id: unknown): Promise<void> {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('无效的插件')
  await rm(join(DATA_DIR, `${id}.json`), { force: true })
}

/** 启动时清掉没装完的临时文件 */
export async function cleanupPendingPlugins(): Promise<void> {
  await rm(PENDING_DIR, { recursive: true, force: true }).catch(() => undefined)
}

// ---------- 插件页面（liuli://plugin/<id>/<文件>） ----------

/** 插件页面的安全策略：只能加载插件自己的文件，不能直接联网、提交表单、嵌入别的页面 */
function pluginCsp(id: string): string {
  const self = `liuli://plugin/${id}/`
  return [
    "default-src 'none'",
    `script-src ${self} 'unsafe-inline'`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `media-src ${self}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'"
  ].join('; ')
}

/**
 * 插件页面最前面加的一段脚本：拖进插件页面的文件不交给插件（拖放由启动器处理：安装插件、导入整合包），
 * 插件读不到用户拖进来的文件。它比插件自己的脚本先运行，在最外层先拦下拖放事件
 */
const DROP_GUARD =
  '<script>(()=>{const s=(e)=>{e.preventDefault();e.stopImmediatePropagation();if(e.dataTransfer)e.dataTransfer.dropEffect="none"};' +
  'for(const t of ["dragenter","dragover","drop"])window.addEventListener(t,s,true)})()</script>'

function withDropGuard(html: string): string {
  // 放在 <!doctype> 后面（放在它前面会让页面进入怪异模式），没有 doctype 时放在最前面
  const doctype = /^\uFEFF?\s*<!doctype[^>]*>/i.exec(html)
  return doctype ? doctype[0] + DROP_GUARD + html.slice(doctype[0].length) : DROP_GUARD + html
}

export async function pluginResponse(url: URL): Promise<Response> {
  try {
    const [id, ...rest] = url.pathname.replace(/^\//, '').split('/').map(decodeURIComponent)
    await activePlugin(id)
    const rel = safeRelative(rest.join('/'))
    if (!rel) return new Response('Not found', { status: 404 })
    const ext = extname(rel).toLowerCase()
    const type = CONTENT_TYPES[ext]
    const base = join(ROOT, id)
    const path = resolve(base, ...rel.split('/'))
    if (!type || !path.startsWith(base + sep) || !(await stat(path).catch(() => null))?.isFile()) {
      return new Response('Not found', { status: 404 })
    }
    const headers: Record<string, string> = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }
    if (ext === '.html') {
      headers['Content-Security-Policy'] = pluginCsp(id)
      return new Response(withDropGuard(await readFile(path, 'utf-8')), { status: 200, headers })
    }
    // 直接打开的 SVG 不能运行脚本（当图片用时本来就不会运行）
    if (ext === '.svg')
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
    const file = await net.fetch(pathToFileURL(path).toString())
    return new Response(file.body, { status: 200, headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

// ---------- 插件能用的接口 ----------

async function readData(id: string): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(await readFile(join(DATA_DIR, `${id}.json`), 'utf-8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function dataKey(key: unknown): string {
  if (typeof key !== 'string' || !key || key.length > 100) throw new Error('存储的键要是 1～100 个字符')
  return key
}

const METHODS: Record<string, PluginPermission | null> = {
  'launcher.info': null,
  'storage.get': null,
  'storage.set': null,
  'storage.delete': null,
  'storage.keys': null,
  'versions.list': 'versions',
  'game.launch': 'launch',
  'game.status': 'game',
  notify: 'notifications',
  'net.fetch': 'network',
  'clipboard.writeText': 'clipboard',
  'open.url': 'open-url',
  'mods.list': 'mods',
  'worlds.list': 'worlds',
  'screenshots.list': 'screenshots',
  'screenshots.thumbnail': 'screenshots',
  'servers.list': 'servers'
}

/** 只能读已经安装的版本（版本名来自插件，先确认是真实存在的版本） */
async function installedVersion(value: unknown): Promise<string> {
  const versionId = typeof value === 'string' ? value : ''
  if (!versionId || !(await listInstalledVersions()).some((v) => v.id === versionId)) throw new Error('没有这个版本')
  return versionId
}

export async function callPlugin(id: unknown, method: unknown, params: unknown): Promise<unknown> {
  if (typeof method !== 'string' || !(method in METHODS))
    throw new Error(`没有这个接口：${String(method).slice(0, 40)}`)
  const manifest = await activePlugin(id, METHODS[method] ?? undefined)
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>
  switch (method) {
    case 'launcher.info':
      return { version: app.getVersion(), language: 'zh-CN', plugin: { id: manifest.id, version: manifest.version } }
    case 'storage.get':
      return (await readData(manifest.id))[dataKey(p.key)] ?? null
    case 'storage.keys':
      return Object.keys(await readData(manifest.id))
    case 'storage.set':
    case 'storage.delete': {
      const data = await readData(manifest.id)
      const key = dataKey(p.key)
      if (method === 'storage.delete') delete data[key]
      else data[key] = JSON.parse(JSON.stringify(p.value ?? null))
      const json = JSON.stringify(data)
      if (Buffer.byteLength(json) > MAX_DATA) throw new Error('插件的数据太多了（最多 1 MB）')
      await mkdir(DATA_DIR, { recursive: true })
      await writeFile(join(DATA_DIR, `${manifest.id}.json`), json, 'utf-8')
      return true
    }
    case 'versions.list':
      return (await listInstalledVersions()).map((v) => ({
        id: v.id,
        minecraftVersion: v.minecraftVersion,
        loader: v.loader ?? null
      }))
    case 'game.status': {
      const s = getGameStatus()
      return { state: s.state, versionId: s.versionId }
    }
    case 'game.launch': {
      const versionId = typeof p.versionId === 'string' ? p.versionId : ''
      if (!(await listInstalledVersions()).some((v) => v.id === versionId)) throw new Error('没有这个版本')
      await launchGame(versionId)
      return true
    }
    case 'notify':
      await notify(`${manifest.name}：${text(p.title, 60) || '提醒'}`, text(p.body, 200))
      return true
    case 'clipboard.writeText': {
      const value = typeof p.text === 'string' ? p.text : ''
      if (value.length > 100_000) throw new Error('内容太长了')
      clipboard.writeText(value)
      return true
    }
    case 'open.url': {
      const url = new URL(String(p.url ?? ''))
      if (url.protocol !== 'https:') throw new Error('只能打开 https 网页')
      await shell.openExternal(url.toString())
      return true
    }
    case 'net.fetch':
      return pluginFetch(manifest, p)
    // 下面这些只读，不返回电脑上的文件路径
    case 'mods.list': {
      const list = await listMods(await installedVersion(p.versionId))
      return {
        minecraftVersion: list.minecraftVersion,
        loader: list.loader ?? null,
        mods: list.mods.map((m) => ({
          fileName: m.fileName,
          name: m.name,
          zhName: m.zhName ?? null,
          modId: m.modId,
          version: m.version,
          enabled: m.enabled,
          kind: m.kind
        }))
      }
    }
    case 'worlds.list': {
      const list = await listWorldInfos(await installedVersion(p.versionId))
      return list.worlds.map((w) => ({
        folder: w.folder,
        name: w.name,
        gameMode: w.gameMode,
        hardcore: w.hardcore,
        version: w.version,
        lastPlayed: w.lastPlayed
      }))
    }
    case 'screenshots.list': {
      const list = await listScreenshots(await installedVersion(p.versionId))
      const limit = Math.min(500, Math.max(1, Math.floor(Number(p.limit) || 100)))
      return list.items.slice(0, limit).map((s) => ({ fileName: s.fileName, time: s.time, size: s.size }))
    }
    case 'screenshots.thumbnail': {
      const path = await screenshotPath(await installedVersion(p.versionId), String(p.fileName ?? ''))
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) throw new Error('没有这张截图')
      if (info.size > 64 * 1024 * 1024) throw new Error('截图太大了')
      const image = nativeImage.createFromPath(path)
      if (image.isEmpty()) throw new Error('读不出这张截图')
      const width = Math.min(1024, Math.max(32, Math.floor(Number(p.width) || 320)))
      const size = image.getSize()
      const small = size.width > width ? image.resize({ width, quality: 'good' }) : image
      return `data:image/jpeg;base64,${small.toJPEG(82).toString('base64')}`
    }
    case 'servers.list':
      return (await listServers()).map((s) => ({ name: s.name, address: s.address, versionId: s.versionId }))
  }
  throw new Error('没有这个接口')
}

/** 联网：只能访问 manifest 里写明的 https 网站，不跟随跳转，回复最多 2 MB 的文字 */
async function pluginFetch(manifest: PluginManifest, p: Record<string, unknown>): Promise<unknown> {
  let url: URL
  try {
    url = new URL(String(p.url ?? ''))
  } catch {
    throw new Error('网址格式不对')
  }
  if (url.protocol !== 'https:') throw new Error('只能访问 https 网址')
  if (url.username || url.password) throw new Error('网址里不能带用户名和密码')
  if (!manifest.hosts.includes(url.hostname.toLowerCase())) throw new Error(`插件没有声明可以访问 ${url.hostname}`)
  const method = typeof p.method === 'string' ? p.method.toUpperCase() : 'GET'
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('不支持的请求方式')
  const headers: Record<string, string> = {}
  if (p.headers && typeof p.headers === 'object') {
    for (const [k, v] of Object.entries(p.headers as Record<string, unknown>).slice(0, 30)) {
      if (typeof v !== 'string' || !/^[A-Za-z0-9-]{1,60}$/.test(k) || /[\r\n]/.test(v) || v.length > 4000) continue
      if (/^(host|cookie|origin|referer|content-length|connection)$/i.test(k)) continue
      headers[k] = v
    }
  }
  const body = typeof p.body === 'string' ? p.body : undefined
  if (body && Buffer.byteLength(body) > MAX_DATA) throw new Error('发送的内容太长了（最多 1 MB）')
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000)
  }).catch((e: unknown) => {
    throw new Error(`联网失败：${e instanceof Error ? e.message : String(e)}`)
  })
  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 2 * MAX_DATA) {
      await reader.cancel().catch(() => undefined)
      throw new Error('回复太大了（超过 2 MB）')
    }
    chunks.push(value)
  }
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') ?? '',
    text: Buffer.concat(chunks).toString('utf-8')
  }
}
