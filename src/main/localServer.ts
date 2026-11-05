import { app, BrowserWindow, shell } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { createServer } from 'net'
import { networkInterfaces, totalmem } from 'os'
import { join } from 'path'
import { getSettings } from './config'
import { getVersionManifest } from './versions'
import { componentForMajor, pickJava, requirementOf } from './javaRuntime'
import { downloadWithFallback } from './services/downloadWithFallback'
import type { LocalServer, LocalServerInput, LocalServerStatus } from '../shared/types'

/**
 * 一键开服：在这台电脑上开一个原版 Minecraft 服务器，局域网里的朋友可以直接加入。
 * 服务端（server.jar）从 Mojang 官方下载并校验 SHA1；只有用户勾选同意 Minecraft EULA 后才写入 eula.txt。
 * 每个服务器一个文件夹，放在启动器数据文件夹的 local-servers 里；同一时间只运行一个
 */
const ROOT = join(app.getPath('userData'), 'local-servers')
const META = 'liuli-server.json'
const ID_RE = /^srv-[a-z0-9]{6,24}$/
const MAX_SERVERS = 20
const MAX_LOG = 1000
const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const EULA_URL = 'https://aka.ms/MinecraftEULA'

interface Running {
  id: string
  child: ChildProcess
  port: number
  stopping: boolean
  killTimer?: ReturnType<typeof setTimeout>
}

let running: Running | null = null
let status: LocalServerStatus = { id: null, state: 'stopped', addresses: [], port: 0 }
let log: string[] = []
/** 正在下载服务端的服务器 */
const preparing = new Set<string>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function setStatus(next: Partial<LocalServerStatus>): void {
  status = { ...status, ...next }
  broadcast('localServer:status', status)
}

function pushLog(line: string): void {
  // 去掉终端颜色代码和控制字符
  const clean = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  if (!clean.trim()) return
  log.push(clean.slice(0, 2000))
  if (log.length > MAX_LOG) log = log.slice(-MAX_LOG)
  broadcast('localServer:log', clean.slice(0, 2000))
}

function assertId(id: string): string {
  if (!ID_RE.test(id)) throw new Error('无效的服务器')
  return join(ROOT, id)
}

const cleanName = (name: unknown): string =>
  typeof name === 'string'
    ? name
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 40)
    : ''

function clampPort(port: unknown): number {
  const n = Math.floor(Number(port))
  if (!Number.isFinite(n) || n < 1024 || n > 65535) throw new Error('端口要在 1024 到 65535 之间')
  return n
}

function clampMemory(memory: unknown): number {
  const max = Math.max(1024, Math.floor(totalmem() / 1024 / 1024) - 1024)
  const n = Math.floor(Number(memory))
  if (!Number.isFinite(n) || n < 512) throw new Error('内存至少 512 MB')
  return Math.min(n, max, 32768)
}

/** server.properties 的值：非 ASCII 字符写成 \\uXXXX（老版本服务端按 ISO-8859-1 读取） */
function propertyValue(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** 修改 server.properties 里的几项，其他内容不动 */
async function patchProperties(dir: string, values: Record<string, string>): Promise<void> {
  const file = join(dir, 'server.properties')
  const lines = (await readFile(file, 'utf-8').catch(() => '')).split(/\r?\n/)
  const left = new Map(Object.entries(values))
  const next = lines.map((line) => {
    const key = /^([^#!=:\s][^=:]*)[=:]/.exec(line)?.[1]?.trim()
    if (key && left.has(key)) {
      const value = left.get(key)!
      left.delete(key)
      return `${key}=${propertyValue(value)}`
    }
    return line
  })
  while (next.length > 0 && next[next.length - 1] === '') next.pop()
  for (const [key, value] of left) next.push(`${key}=${propertyValue(value)}`)
  await writeFile(file, next.join('\n') + '\n', 'utf-8')
}

async function readMeta(dir: string): Promise<LocalServer | null> {
  try {
    const raw = JSON.parse(await readFile(join(dir, META), 'utf-8')) as Partial<LocalServer>
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id) || typeof raw.version !== 'string') return null
    const jar = await stat(join(dir, 'server.jar')).catch(() => null)
    return {
      id: raw.id,
      name: cleanName(raw.name) || '我的服务器',
      version: raw.version.slice(0, 64),
      port: Number.isInteger(raw.port) && raw.port! >= 1024 && raw.port! <= 65535 ? raw.port! : 25565,
      memoryMb: Number.isFinite(raw.memoryMb) ? Math.max(512, Math.floor(raw.memoryMb!)) : 2048,
      onlineMode: raw.onlineMode !== false,
      javaMajor: Number.isInteger(raw.javaMajor) ? raw.javaMajor! : 8,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt! : 0,
      ready: !!jar?.isFile() && jar.size > 0 && !preparing.has(raw.id)
    }
  } catch {
    return null
  }
}

async function writeMeta(dir: string, server: LocalServer): Promise<void> {
  const { ready: _ready, ...data } = server
  void _ready
  await writeFile(join(dir, `${META}.tmp`), JSON.stringify(data, null, 2), 'utf-8')
  await rename(join(dir, `${META}.tmp`), join(dir, META))
}

export async function listLocalServers(): Promise<LocalServer[]> {
  const list: LocalServer[] = []
  for (const name of await readdir(ROOT).catch(() => [] as string[])) {
    if (!ID_RE.test(name)) continue
    const meta = await readMeta(join(ROOT, name))
    if (meta && meta.id === name) list.push(meta)
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

/** 版本 json 里官方服务端的下载地址和 SHA1 */
async function serverDownload(version: string): Promise<{ urls: string[]; sha1: string; javaMajor: number }> {
  const { downloadSource } = await getSettings()
  const manifest = await getVersionManifest(downloadSource)
  const entry = manifest.versions.find((v) => v.id === version)
  if (!entry) throw new Error(`找不到游戏版本 ${version}`)
  if (!/^https:\/\//.test(entry.url)) throw new Error('版本信息的地址无效')
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`获取版本信息失败：HTTP ${response.status}`)
  const json = (await response.json()) as {
    downloads?: { server?: { url?: unknown; sha1?: unknown } }
    javaVersion?: { majorVersion?: number; component?: string }
  }
  const url = json.downloads?.server?.url
  const sha1 = json.downloads?.server?.sha1
  if (
    typeof url !== 'string' ||
    !url.startsWith('https://') ||
    typeof sha1 !== 'string' ||
    !/^[0-9a-f]{40}$/.test(sha1)
  ) {
    throw new Error(`${version} 没有官方服务端`)
  }
  const mirror = `${BMCLAPI}/version/${encodeURIComponent(version)}/server`
  return {
    urls: downloadSource === 'bmclapi' ? [mirror, url] : [url, mirror],
    sha1,
    javaMajor: requirementOf(json).majorVersion
  }
}

/** 下载（或重新下载）服务端 */
async function downloadServerJar(dir: string, server: LocalServer): Promise<void> {
  if (preparing.has(server.id)) throw new Error('正在下载服务端')
  preparing.add(server.id)
  broadcast('localServer:changed', null)
  try {
    const { urls, sha1, javaMajor } = await serverDownload(server.version)
    await downloadWithFallback(
      { url: urls, destination: join(dir, 'server.jar'), validator: { algorithm: 'sha1', hash: sha1 } },
      'server'
    )
    await writeMeta(dir, { ...server, javaMajor })
  } finally {
    preparing.delete(server.id)
    broadcast('localServer:changed', null)
  }
}

/** 新建服务器：必须同意 EULA；下载好服务端后才能启动 */
export async function createLocalServer(input: LocalServerInput): Promise<LocalServer> {
  if (input?.acceptEula !== true) throw new Error(`需要先阅读并同意 Minecraft 最终用户许可协议（EULA）：${EULA_URL}`)
  if ((await listLocalServers()).length >= MAX_SERVERS)
    throw new Error(`最多创建 ${MAX_SERVERS} 个服务器，请先删除一些`)
  const version = typeof input.version === 'string' ? input.version.trim() : ''
  if (!/^[A-Za-z0-9._ -]{1,64}$/.test(version)) throw new Error('请选择游戏版本')
  const id = `srv-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  const dir = assertId(id)
  const server: LocalServer = {
    id,
    name: cleanName(input.name) || `${version} 服务器`,
    version,
    port: clampPort(input.port ?? 25565),
    memoryMb: clampMemory(input.memoryMb ?? 2048),
    onlineMode: input.onlineMode !== false,
    javaMajor: 8,
    createdAt: Date.now(),
    ready: false
  }
  await mkdir(dir, { recursive: true })
  await writeMeta(dir, server)
  await writeFile(
    join(dir, 'eula.txt'),
    `# 玩家在琉璃启动器里阅读并同意了 Minecraft EULA（${EULA_URL}），${new Date().toISOString()}\neula=true\n`,
    'utf-8'
  )
  await patchProperties(dir, {
    motd: server.name,
    'server-port': String(server.port),
    'online-mode': String(server.onlineMode),
    'max-players': '10',
    'view-distance': '10'
  })
  try {
    await downloadServerJar(dir, server)
  } catch (e) {
    throw new Error(
      `服务器已创建，但服务端下载失败，可以稍后点「重新下载」：${e instanceof Error ? e.message : String(e)}`
    )
  }
  return (await readMeta(dir)) ?? server
}

export async function redownloadLocalServer(id: string): Promise<LocalServer> {
  const dir = assertId(id)
  if (running?.id === id) throw new Error('服务器正在运行')
  const server = await readMeta(dir)
  if (!server) throw new Error('找不到这个服务器')
  await downloadServerJar(dir, server)
  return (await readMeta(dir)) ?? server
}

/** 修改名称、端口、内存、正版验证 */
export async function updateLocalServer(
  id: string,
  patch: Partial<Pick<LocalServer, 'name' | 'port' | 'memoryMb' | 'onlineMode'>>
): Promise<LocalServer> {
  const dir = assertId(id)
  if (running?.id === id) throw new Error('服务器运行时不能修改，请先停止')
  const server = await readMeta(dir)
  if (!server) throw new Error('找不到这个服务器')
  const next: LocalServer = {
    ...server,
    name: patch.name !== undefined ? cleanName(patch.name) || server.name : server.name,
    port: patch.port !== undefined ? clampPort(patch.port) : server.port,
    memoryMb: patch.memoryMb !== undefined ? clampMemory(patch.memoryMb) : server.memoryMb,
    onlineMode: patch.onlineMode !== undefined ? patch.onlineMode === true : server.onlineMode
  }
  await writeMeta(dir, next)
  await patchProperties(dir, {
    motd: next.name,
    'server-port': String(next.port),
    'online-mode': String(next.onlineMode)
  })
  return (await readMeta(dir)) ?? next
}

export async function deleteLocalServer(id: string): Promise<void> {
  const dir = assertId(id)
  if (running?.id === id || preparing.has(id)) throw new Error('服务器正在运行或下载，不能删除')
  await shell.trashItem(dir).catch(async () => {
    // 回收站不可用时直接删除
    await rm(dir, { recursive: true, force: true })
  })
  if (status.id === id) setStatus({ id: null, state: 'stopped', message: undefined })
}

export async function openLocalServerFolder(id: string): Promise<void> {
  const error = await shell.openPath(assertId(id))
  if (error) throw new Error(error)
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, () => probe.close(() => resolve(true)))
  })
}

/** 局域网里朋友可以用的地址 */
function lanAddresses(port: number): string[] {
  const suffix = port === 25565 ? '' : `:${port}`
  const list: string[] = []
  for (const items of Object.values(networkInterfaces())) {
    for (const item of items ?? []) {
      if (item.family === 'IPv4' && !item.internal) list.push(`${item.address}${suffix}`)
    }
  }
  return list.slice(0, 6)
}

export async function startLocalServer(id: string): Promise<void> {
  const dir = assertId(id)
  if (running) throw new Error('已经有一个服务器在运行，请先停止它')
  const server = await readMeta(dir)
  if (!server) throw new Error('找不到这个服务器')
  if (!server.ready) throw new Error('服务端还没有下载好')
  const java = await pickJava({
    majorVersion: server.javaMajor,
    component: componentForMajor(server.javaMajor)
  }).catch(() => null)
  if (!java) {
    throw new Error(
      `没有找到 Java ${server.javaMajor}：先启动一次 ${server.version} 的游戏（会自动下载需要的 Java），再来开服`
    )
  }
  if (!(await portFree(server.port))) throw new Error(`端口 ${server.port} 已经被占用，换一个端口或关掉占用它的程序`)
  log = []
  pushLog(`[琉璃启动器] 正在启动 ${server.name}（${server.version}），使用 Java ${java.majorVersion}`)
  const child = spawn(
    java.path,
    [
      `-Xmx${server.memoryMb}M`,
      '-Dfile.encoding=UTF-8',
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
      '-jar',
      'server.jar',
      'nogui'
    ],
    { cwd: dir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const current: Running = { id, child, port: server.port, stopping: false }
  running = current
  setStatus({ id, state: 'starting', message: undefined, port: server.port, addresses: lanAddresses(server.port) })
  let buffer = ''
  const onData = (data: Buffer): void => {
    buffer += data.toString('utf-8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      pushLog(line)
      if (status.state === 'starting' && /Done \([\d.,]+s\)!/.test(line)) setStatus({ state: 'running' })
      if (/FAILED TO BIND TO PORT/i.test(line)) setStatus({ message: `端口 ${server.port} 被占用` })
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.on('error', (e) => {
    pushLog(`[琉璃启动器] 无法启动 Java：${e.message}`)
  })
  child.on('close', (code) => {
    if (buffer) pushLog(buffer)
    if (current.killTimer) clearTimeout(current.killTimer)
    if (running === current) running = null
    const failed = !current.stopping && code !== 0
    pushLog(`[琉璃启动器] 服务器已停止${code !== null ? `（退出码 ${code}）` : ''}`)
    setStatus({
      id,
      state: failed ? 'error' : 'stopped',
      message: failed ? (status.message ?? '服务器意外停止，请查看下面的输出') : undefined,
      addresses: []
    })
  })
}

/** 停止服务器：先让服务器自己保存并退出，20 秒还没退出就强制结束 */
export function stopLocalServer(): void {
  const current = running
  if (!current || current.stopping) return
  current.stopping = true
  setStatus({ state: 'stopping' })
  try {
    current.child.stdin?.write('stop\n')
  } catch {
    current.child.kill()
  }
  current.killTimer = setTimeout(() => {
    if (current.child.exitCode === null) current.child.kill('SIGKILL')
  }, 20_000)
}

/** 往服务器控制台发一条命令（只能一行，不用加 /） */
export function sendLocalServerCommand(command: string): void {
  if (!running || running.stopping) throw new Error('服务器没有在运行')
  const line = String(command ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/^\//, '')
    .slice(0, 256)
  if (!line) return
  pushLog(`> ${line}`)
  running.child.stdin?.write(`${line}\n`)
  if (/^stop\b/i.test(line)) {
    running.stopping = true
    setStatus({ state: 'stopping' })
  }
}

export function getLocalServerStatus(): { status: LocalServerStatus; log: string[]; preparing: string[] } {
  return { status, log, preparing: [...preparing] }
}

/** 退出启动器时先停止服务器（最多等 10 秒），不留下后台的服务器进程 */
export function setupLocalServerShutdown(): void {
  let quitting = false
  app.on('before-quit', (event) => {
    const current = running
    if (!current || quitting) return
    event.preventDefault()
    quitting = true
    stopLocalServer()
    let finished = false
    const done = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      app.quit()
    }
    const timer = setTimeout(() => {
      if (current.child.exitCode === null) current.child.kill('SIGKILL')
      done()
    }, 10_000)
    current.child.once('close', done)
  })
}

export { EULA_URL }
