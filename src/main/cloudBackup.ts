import { app, BrowserWindow } from 'electron'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import { getSettings, updateSettings } from './config'
import { notify } from './notify'
import { seal, unseal } from './secure'
import { backupFile, backupFolderName, backupsDirFor, gameDirOf, parseBackupName } from './worlds'
import type { CloudBackupConfig, CloudBackupInput, CloudBackupItem, CloudBackupStatus } from '../shared/types'

/**
 * 存档云备份（WebDAV，例如坚果云、Nextcloud、群晖；百度网盘、夸克网盘没有 WebDAV，通过本机运行的
 * OpenList / AList 挂成 WebDAV 后使用）：存档备份做好后上传到网盘的
 * 「文件夹/游戏目录名-哈希/」里；可以列出网盘里的备份（包括别的电脑上传的），下载回本地后用原来的还原功能还原。
 *
 * 安全：网盘地址只能是 https（本机地址可以用 http），不跟随跳转；密码用系统安全存储加密，单独保存，
 * 不发给界面、不写日志；密码只对保存时的网址和用户名有效，换了网址或用户名要重新输入
 */
const SECRET_FILE = join(app.getPath('userData'), 'cloud-backup-secret.json')
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
/** 网盘里每个存档最多保留几份自动备份（手动备份不删） */
const REMOTE_AUTO_KEEP = 5
const MAX_LIST = 2000

interface StoredSecret {
  value: string
  encrypted: boolean
  origin: string
  user: string
}

// ---------- 检查输入 ----------

export function checkDavUrl(input: unknown): string {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) throw new Error('请填写 WebDAV 地址')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('WebDAV 地址格式不对，例如 https://dav.jianguoyun.com/dav/')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error('WebDAV 地址必须以 https:// 开头（本机运行的服务可以用 http://）')
  }
  if (url.username || url.password) throw new Error('地址里不能包含用户名或密码，请分开填写')
  if (url.search || url.hash) throw new Error('地址里不能带 ? 或 # 后面的内容')
  return url.toString().replace(/\/+$/, '')
}

function checkUser(input: unknown): string {
  const user = typeof input === 'string' ? input.trim() : ''
  if (!user) throw new Error('请填写用户名')
  if (user.length > 200 || /[\u0000-\u001f\u007f:]/.test(user)) throw new Error('用户名格式不对')
  return user
}

/** 网盘里的文件夹：最多 3 层，每层是普通名字 */
export function checkFolder(input: unknown): string {
  const text = typeof input === 'string' ? input.trim() : ''
  const parts = text
    .split(/[\\/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'LiuliLauncher'
  if (parts.length > 3) throw new Error('网盘文件夹最多 3 层')
  for (const p of parts) {
    if (p === '.' || p === '..' || p.length > 64 || /[\u0000-\u001f\u007f<>:"|?*]/.test(p)) {
      throw new Error(`网盘文件夹名不对：${p}`)
    }
  }
  return parts.join('/')
}

/** 网盘上的文件名或文件夹名（来自网盘的列表，不可信）：只能是普通名字 */
function checkName(name: unknown, what: string): string {
  if (
    typeof name !== 'string' ||
    !name ||
    name !== basename(name) ||
    name === '.' ||
    name === '..' ||
    /[\u0000-\u001f\\/]/.test(name)
  ) {
    throw new Error(`无效的${what}`)
  }
  return name
}

// ---------- 密码 ----------

async function loadSecret(): Promise<StoredSecret | null> {
  try {
    const raw = JSON.parse(await readFile(SECRET_FILE, 'utf-8')) as Partial<StoredSecret>
    if (
      typeof raw.value === 'string' &&
      typeof raw.encrypted === 'boolean' &&
      typeof raw.origin === 'string' &&
      typeof raw.user === 'string'
    ) {
      return { value: raw.value, encrypted: raw.encrypted, origin: raw.origin, user: raw.user }
    }
  } catch {
    // 还没有保存密码
  }
  return null
}

async function saveSecret(secret: StoredSecret | null): Promise<void> {
  if (!secret) {
    await rm(SECRET_FILE, { force: true })
    return
  }
  await mkdir(dirname(SECRET_FILE), { recursive: true })
  await writeFile(`${SECRET_FILE}.tmp`, JSON.stringify(secret), { encoding: 'utf-8', mode: 0o600 })
  await rename(`${SECRET_FILE}.tmp`, SECRET_FILE)
}

/** 密码只对保存时的网址（协议 + 域名 + 端口）和用户名有效 */
async function passwordFor(url: string, user: string): Promise<string> {
  const secret = await loadSecret()
  if (!secret || !url || secret.origin !== new URL(url).origin || secret.user !== user) return ''
  try {
    return unseal(secret.value, secret.encrypted)
  } catch {
    return ''
  }
}

// ---------- 设置 ----------

export async function getCloudBackupConfig(): Promise<CloudBackupConfig> {
  const s = await getSettings()
  return {
    enabled: s.cloudBackupEnabled,
    url: s.cloudBackupUrl,
    user: s.cloudBackupUser,
    folder: s.cloudBackupFolder,
    hasPassword: !!s.cloudBackupUrl && !!(await passwordFor(s.cloudBackupUrl, s.cloudBackupUser))
  }
}

/** 保存网盘设置；password 为空时保留原来的密码（网址或用户名变了时原来的密码作废） */
export async function configureCloudBackup(input: CloudBackupInput): Promise<CloudBackupConfig> {
  if (input?.clear === true) {
    await saveSecret(null)
    await updateSettings({ cloudBackupEnabled: false, cloudBackupUrl: '', cloudBackupUser: '' })
    return getCloudBackupConfig()
  }
  const url = checkDavUrl(input?.url)
  const user = checkUser(input?.user)
  const folder = checkFolder(input?.folder)
  const password = typeof input?.password === 'string' ? input.password : ''
  if (password.length > 512 || /[\u0000-\u001f\u007f]/.test(password)) throw new Error('密码格式不对')
  if (password) {
    await saveSecret({ ...seal(password), origin: new URL(url).origin, user })
  } else if (!(await passwordFor(url, user))) {
    await saveSecret(null)
    if (input?.enabled === true) throw new Error('请填写密码（换了网址或用户名后需要重新输入）')
  }
  await updateSettings({
    cloudBackupEnabled: input?.enabled === true,
    cloudBackupUrl: url,
    cloudBackupUser: user,
    cloudBackupFolder: folder
  })
  return getCloudBackupConfig()
}

// ---------- WebDAV ----------

interface Active {
  url: string
  user: string
  password: string
  folder: string[]
}

async function active(): Promise<Active> {
  const s = await getSettings()
  if (!s.cloudBackupUrl || !s.cloudBackupUser) throw new Error('还没有设置云备份')
  const url = checkDavUrl(s.cloudBackupUrl)
  const password = await passwordFor(url, s.cloudBackupUser)
  if (!password) throw new Error('云备份的密码失效了，请在设置里重新输入')
  return { url, user: s.cloudBackupUser, password, folder: checkFolder(s.cloudBackupFolder).split('/') }
}

/** OpenList / AList 的默认端口（百度网盘、夸克网盘通过它们挂成 WebDAV） */
const OPENLIST_PORT = '5244'

/** 地址看起来是 OpenList / AList：报错时给出它的设置方法 */
export function isOpenListUrl(url: string): boolean {
  try {
    return new URL(url).port === OPENLIST_PORT
  } catch {
    return false
  }
}

function friendly(status: number, url = ''): string {
  const openList = isOpenListUrl(url)
  if (status === 401) return openList ? 'OpenList 的用户名或密码不对' : '用户名或密码不对'
  if (status === 403) {
    return openList
      ? '没有权限：在 OpenList 后台的「用户」里给这个用户勾上 WebDAV 读取和管理权限'
      : '没有权限（坚果云等网盘要用「应用密码」，不是登录密码）'
  }
  if (status === 404 || status === 409) {
    return openList
      ? '找不到这个文件夹：检查地址最后的挂载路径和 OpenList 里添加网盘时填的「挂载路径」是否一样'
      : '网盘里找不到这个文件夹'
  }
  if (status === 507) return '网盘空间不够了'
  return `网盘返回了错误（HTTP ${status}）`
}

async function dav(
  cfg: Active,
  method: string,
  segments: string[],
  init: {
    body?: string | ReadableStream
    headers?: Record<string, string>
    timeoutMs?: number
    collection?: boolean
  } = {}
): Promise<Response> {
  const path = segments.map((s) => encodeURIComponent(s)).join('/')
  const url = `${cfg.url}/${path}${init.collection ? '/' : ''}`
  try {
    return await fetch(url, {
      method,
      body: init.body,
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`,
        ...init.headers
      },
      // 不跟随跳转：密码不能被转发到别的网站
      redirect: 'error',
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      ...(init.body instanceof ReadableStream ? { duplex: 'half' } : {})
    } as RequestInit)
  } catch (e) {
    // Node 的 fetch 把真正的原因放在 cause 里（例如「unexpected redirect」「ECONNREFUSED」）
    const cause = (e as { cause?: unknown }).cause
    const message = [e, cause]
      .map((x) => (x instanceof Error ? x.message : x ? String(x) : ''))
      .filter(Boolean)
      .join('：')
    if (/redirect/i.test(message)) throw new Error('网盘地址发生了跳转，请填写跳转后的地址')
    if (isOpenListUrl(cfg.url) && /ECONNREFUSED|fetch failed/i.test(message)) {
      throw new Error('连不上 OpenList：请确认 OpenList 正在这台电脑上运行（上传、下载备份时都要开着）')
    }
    throw new Error(`连不上网盘：${message}`)
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

/** 一层层建好文件夹（已经有了也没关系） */
async function ensureDirs(cfg: Active, segments: string[]): Promise<void> {
  for (let i = 1; i <= segments.length; i++) {
    const response = await dav(cfg, 'MKCOL', segments.slice(0, i), { collection: true })
    await discard(response)
    // 201 新建，405 已经有了
    if (response.status !== 201 && response.status !== 405 && !response.ok)
      throw new Error(friendly(response.status, cfg.url))
  }
}

interface DavEntry {
  name: string
  collection: boolean
  size: number
  modified: number
}

/** 列出网盘文件夹里的东西（PROPFIND Depth: 1） */
async function listDir(cfg: Active, segments: string[]): Promise<DavEntry[]> {
  const response = await dav(cfg, 'PROPFIND', segments, {
    collection: true,
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>'
  })
  if (response.status === 404) {
    await discard(response)
    return []
  }
  if (response.status !== 207 && !response.ok) {
    await discard(response)
    throw new Error(friendly(response.status, cfg.url))
  }
  const xml = (await response.text()).slice(0, 8 * 1024 * 1024)
  const strip = (p: string): string => p.replace(/\/+$/, '').toLowerCase()
  // 列表里第一条通常是文件夹自己，按路径去掉
  const selfPath = strip(
    decodeURIComponent(new URL(`${cfg.url}/${segments.map((s) => encodeURIComponent(s)).join('/')}/`).pathname)
  )
  const entries: DavEntry[] = []
  for (const block of xml.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1)) {
    const href = /<(?:[\w-]+:)?href[^>]*>([^<]*)</i.exec(block)?.[1]
    if (!href) continue
    let path: string
    try {
      path = decodeURIComponent(new URL(href.trim().replace(/&amp;/g, '&'), cfg.url + '/').pathname)
    } catch {
      continue
    }
    if (strip(path) === selfPath) continue
    const name = path.split('/').filter(Boolean).pop() ?? ''
    if (!name) continue
    const size = Number(/getcontentlength[^>]*>\s*(\d+)\s*</i.exec(block)?.[1] ?? 0)
    const modified = Date.parse(/getlastmodified[^>]*>([^<]+)</i.exec(block)?.[1] ?? '')
    entries.push({
      name,
      collection: /<(?:[\w-]+:)?collection\b/i.test(block),
      size: Number.isFinite(size) ? size : 0,
      modified: Number.isFinite(modified) ? modified : 0
    })
    if (entries.length >= MAX_LIST) break
  }
  return entries
}

/** 测试连接：建好网盘文件夹并列出内容 */
export async function testCloudBackup(): Promise<string> {
  const cfg = await active()
  await ensureDirs(cfg, cfg.folder)
  await listDir(cfg, cfg.folder)
  return `连接成功，备份会放在网盘的「${cfg.folder.join('/')}」文件夹里`
}

// ---------- 上传 ----------

let status: CloudBackupStatus = { state: 'idle', queued: 0 }
let queue: Promise<unknown> = Promise.resolve()

function setStatus(next: Partial<CloudBackupStatus>): void {
  status = { ...status, ...next }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('cloudBackup:status', status)
  }
}

export function getCloudBackupStatus(): CloudBackupStatus {
  return status
}

async function uploadNow(versionId: string, path: string): Promise<void> {
  const cfg = await active()
  const source = backupFolderName(await gameDirOf(versionId))
  const file = checkName(basename(path), '备份文件名')
  const dir = [...cfg.folder, source]
  await ensureDirs(cfg, dir)
  const { size } = await stat(path)
  const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
  const response = await dav(cfg, 'PUT', [...dir, file], {
    body,
    headers: { 'Content-Type': 'application/zip', 'Content-Length': String(size) },
    // 大文件慢慢传：至少 2 分钟，按 50 KB/s 估算，最多 6 小时
    timeoutMs: Math.min(6 * 3600_000, 120_000 + Math.ceil(size / 50_000) * 1000)
  })
  await discard(response)
  if (!response.ok) throw new Error(friendly(response.status, cfg.url))
  // 网盘里每个存档只留最近几份自动备份
  const parsed = parseBackupName(file)
  if (parsed?.auto) {
    const autos = (await listDir(cfg, dir))
      .filter((e) => !e.collection)
      .map((e) => ({ name: e.name, parsed: parseBackupName(e.name) }))
      .filter((e) => e.parsed?.auto && e.parsed.world === parsed.world)
      .sort((a, b) => b.parsed!.createdAt - a.parsed!.createdAt)
    for (const old of autos.slice(REMOTE_AUTO_KEEP)) {
      await discard(await dav(cfg, 'DELETE', [...dir, old.name]).catch(() => new Response(null)))
    }
  }
}

/** 把一个备份文件排队上传；返回上传完成（或失败）的 Promise */
export function uploadBackup(versionId: string, path: string): Promise<void> {
  setStatus({ queued: status.queued + 1 })
  const task = queue.then(async () => {
    setStatus({ state: 'uploading', file: basename(path), error: undefined })
    try {
      await uploadNow(versionId, path)
      setStatus({ state: 'idle', file: undefined, lastUploadAt: Date.now(), queued: Math.max(0, status.queued - 1) })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({
        state: 'error',
        file: undefined,
        error: `${basename(path)}：${message}`,
        queued: Math.max(0, status.queued - 1)
      })
      void notify('存档云备份失败', `${basename(path)} 没能上传：${message}`)
      throw e
    }
  })
  queue = task.catch(() => undefined)
  return task
}

/** 新做好的备份：开启了云备份时自动上传（失败不影响本地备份） */
export async function uploadIfEnabled(versionId: string, paths: string[]): Promise<void> {
  const s = await getSettings()
  if (!s.cloudBackupEnabled || !s.cloudBackupUrl) return
  for (const path of paths) void uploadBackup(versionId, path).catch(() => undefined)
}

/** 手动上传一个已有的本地备份 */
export async function uploadExistingBackup(versionId: string, file: string): Promise<void> {
  await uploadBackup(versionId, await backupFile(versionId, file))
}

// ---------- 列出、下载 ----------

/** 网盘里的存档备份：每个游戏目录一个文件夹（包括别的电脑上传的） */
export async function listCloudBackups(versionId: string): Promise<CloudBackupItem[]> {
  const cfg = await active()
  const mine = backupFolderName(await gameDirOf(versionId))
  const items: CloudBackupItem[] = []
  for (const dir of await listDir(cfg, cfg.folder)) {
    if (!dir.collection) continue
    for (const entry of await listDir(cfg, [...cfg.folder, dir.name])) {
      if (entry.collection || !/\.zip$/i.test(entry.name)) continue
      const parsed = parseBackupName(entry.name)
      items.push({
        source: dir.name,
        file: entry.name,
        world: parsed?.world ?? entry.name.replace(/\.zip$/i, ''),
        size: entry.size,
        createdAt: parsed?.createdAt ?? entry.modified,
        auto: parsed?.auto ?? false,
        mine: dir.name === mine
      })
      if (items.length >= MAX_LIST) break
    }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

/** 把网盘里的备份下载到这个版本的备份文件夹，之后在「备份」里还原 */
export async function downloadCloudBackup(versionId: string, source: string, file: string): Promise<string> {
  const cfg = await active()
  checkName(source, '网盘文件夹')
  checkName(file, '备份文件名')
  if (!/\.zip$/i.test(file)) throw new Error('只能下载 zip 格式的存档备份')
  const backups = await backupsDirFor(await gameDirOf(versionId))
  await mkdir(backups, { recursive: true })
  const target = join(backups, file)
  if (await stat(target).catch(() => null)) throw new Error('本地已经有这个备份了')
  const response = await dav(cfg, 'GET', [...cfg.folder, source, file], { timeoutMs: 6 * 3600_000 })
  if (!response.ok || !response.body) {
    await discard(response)
    throw new Error(friendly(response.status, cfg.url))
  }
  const temp = `${target}.part`
  try {
    await pipeline(Readable.fromWeb(response.body as unknown as WebReadableStream), createWriteStream(temp))
    const expected = Number(response.headers.get('content-length'))
    if (Number.isFinite(expected) && expected > 0 && (await stat(temp)).size !== expected) {
      throw new Error('下载不完整，请重试')
    }
    await rename(temp, target)
  } catch (e) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw e
  }
  return file
}
