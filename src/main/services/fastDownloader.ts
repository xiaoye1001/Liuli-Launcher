/**
 * 高速多线程下载引擎（FastDownloadEngine）
 *
 * - 先探测服务器是否支持分块（Accept-Ranges: bytes）以及文件大小；
 *   支持且文件大于 2 MB 时按线程数切成多个分块（Range: bytes=start-end）并发下载，
 *   直接写入预先分配好大小的临时文件的对应位置；不支持时在引擎内部降级为单线程下载
 * - 每个分块最多重试 3 次（从断开的位置接着下），仍然失败就抛出异常，由调用方回退到原来的下载方式，
 *   未完成的临时文件会被删除
 * - 支持暂停、继续、取消；下载完成后校验大小与 SHA1，通过后才改名为正式文件
 * - 每 250 毫秒把所有任务的状态推送给界面（download:progress）
 */
import { BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, open, readdir, rename, rm, stat, type FileHandle } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { request, type Dispatcher } from 'undici'
import { downloadDispatcher } from '../network'
import type { FastDownloadSource, FastDownloadStatus, FastDownloadTask } from '../../shared/types'

/** 大于这个大小才分块下载 */
const MIN_CHUNKED_SIZE = 2 * 1024 * 1024
/** 每个分块至少这么大，小文件不会切得太碎 */
const MIN_CHUNK_SIZE = 512 * 1024
export const DEFAULT_FAST_THREADS = 8
export const MAX_FAST_THREADS = 32
/** 单个分块的最大尝试次数 */
const CHUNK_ATTEMPTS = 3
/** 一个连接这么久没有收到任何数据，就断开重试 */
const STALL_TIMEOUT = 30_000
/** 探测请求的超时 */
const PROBE_TIMEOUT = 15_000
/** 推送进度的间隔 */
const PUSH_INTERVAL = 250
/** 最多保留多少个已结束的任务（完成、失败、取消） */
const MAX_FINISHED = 50
/** 临时文件的后缀 */
const PART_SUFFIX = '.liuli-part'

/** 用户取消了下载：调用方不应回退到原下载方式 */
export class DownloadCancelledError extends Error {
  constructor() {
    super('下载已取消')
    this.name = 'DownloadCancelledError'
  }
}

/** 内部使用：任务被暂停，等待继续 */
class PausedSignal extends Error {}
/** 内部使用：连接长时间没有数据 */
class StallError extends Error {}

export interface FastDownloadOptions {
  /** 下载地址，按顺序尝试，使用第一个能连通的地址 */
  urls: string[]
  /** 保存的完整路径；不填时需要填 directory，文件名从服务器响应或地址中获取 */
  destination?: string
  /** 保存到的文件夹（百宝箱直链下载用），同名文件不会被覆盖，会自动改名 */
  directory?: string
  /** 和 directory 一起使用：指定保存的文件名；不填时用服务器提供的文件名或地址中的文件名 */
  fileName?: string
  source: FastDownloadSource
  /** 期望的 SHA1，下载完成后校验 */
  sha1?: string
  /** 期望的大小（字节），和服务器告知的大小不一致时视为失败 */
  size?: number
  headers?: Record<string, string>
  /** 线程数（1~32） */
  threads?: number
}

interface Chunk {
  start: number
  /** 结束位置（包含）；-1 表示大小未知，下载到服务器断开为止 */
  end: number
  downloaded: number
}

interface ProbeResult {
  url: string
  size: number
  ranges: boolean
  fileName?: string
}

interface Task {
  id: string
  source: FastDownloadSource
  originalSource?: FastDownloadSource
  urls: string[]
  url: string
  fileName: string
  destination: string
  directory?: string
  /** 用户指定的文件名（directory 模式） */
  preferredName?: string
  tempPath: string
  sha1?: string
  expectedSize?: number
  headers: Record<string, string>
  threads: number
  total: number
  chunked: boolean
  chunks: Chunk[]
  status: FastDownloadStatus
  error?: string
  fallbackReason?: string
  createdAt: number
  finishedAt?: number
  /** 正在进行的请求，暂停、取消、失败时一起中断 */
  controllers: Set<AbortController>
  /** 某个分块已经彻底失败，其它分块不再重试 */
  failed: boolean
  /** 暂停时等待继续（或取消） */
  resumeWaiter?: () => void
  /** 回退到原下载方式时的进度 */
  fallbackWritten: number
  fallbackTotal: number
  // 网速统计
  lastBytes: number
  lastTime: number
  speed: number
}

const tasks = new Map<string, Task>()
let ticker: ReturnType<typeof setInterval> | undefined

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 300)
  return String(e).slice(0, 300)
}

/** 丢弃不需要的响应正文：先接住中断时产生的错误，否则未处理的 error 事件会让主进程崩溃 */
function discard(body: Dispatcher.ResponseData['body']): void {
  body.on('error', () => undefined)
  body.destroy()
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/** 去掉文件名里不能用的字符，避免写到其它文件夹 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 200)
  return cleaned || 'download'
}

/** 从 Content-Disposition 或地址里取文件名 */
function fileNameFrom(disposition: string | undefined, url: string): string | undefined {
  if (disposition) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition)
    if (star) {
      try {
        return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
      } catch {
        // 编码不对时用下面的方式
      }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)
    if (plain) return plain[1].trim()
  }
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : undefined
  } catch {
    return undefined
  }
}

/** 文件夹里已有同名文件时，在文件名后面加 (2)、(3)… */
async function uniqueDestination(directory: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  const taken = new Set((await readdir(directory).catch(() => [] as string[])).map((n) => n.toLowerCase()))
  // 其它正在进行的任务准备写入的文件名也要避开
  for (const task of tasks.values()) {
    if (dirname(task.destination) === directory) taken.add(basename(task.destination).toLowerCase())
  }
  let candidate = name
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`
  return join(directory, candidate)
}

// ---------- 探测 ----------

async function probeUrl(url: string, headers: Record<string, string>, dispatcher: Dispatcher): Promise<ProbeResult> {
  let size = 0
  let ranges = false
  let disposition: string | undefined
  // 1. HEAD：看 Accept-Ranges 与 Content-Length
  try {
    const res = await request(url, {
      method: 'HEAD',
      headers,
      dispatcher,
      signal: AbortSignal.timeout(PROBE_TIMEOUT)
    })
    await res.body.dump().catch(() => undefined)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      size = Number(header(res.headers, 'content-length')) || 0
      ranges = /bytes/i.test(header(res.headers, 'accept-ranges') ?? '')
      disposition = header(res.headers, 'content-disposition')
    }
  } catch {
    // 有的服务器不支持 HEAD，用下面的方式再探测
  }
  if (ranges && size > 0) return { url, size, ranges, fileName: fileNameFrom(disposition, url) }

  // 2. 请求第一个字节：返回 206 且带 Content-Range 说明支持分块
  const res = await request(url, {
    method: 'GET',
    headers: { ...headers, Range: 'bytes=0-0' },
    dispatcher,
    signal: AbortSignal.timeout(PROBE_TIMEOUT)
  })
  try {
    if (res.statusCode === 206) {
      const match = /\/(\d+)\s*$/.exec(header(res.headers, 'content-range') ?? '')
      if (match) {
        size = Number(match[1])
        ranges = true
      }
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      size = Number(header(res.headers, 'content-length')) || size
      ranges = false
    } else {
      throw new Error(`服务器返回 HTTP ${res.statusCode}`)
    }
    disposition = header(res.headers, 'content-disposition') ?? disposition
  } finally {
    // 不需要正文，直接断开（不支持分块时服务器会发送整个文件）
    discard(res.body)
  }
  return { url, size, ranges, fileName: fileNameFrom(disposition, url) }
}

async function probe(task: Task): Promise<ProbeResult> {
  const dispatcher = downloadDispatcher()
  const errors: string[] = []
  for (const url of task.urls) {
    if (task.status === 'cancelled') throw new DownloadCancelledError()
    try {
      return await probeUrl(url, task.headers, dispatcher)
    } catch (e) {
      errors.push(`${hostOf(url)}：${errorText(e)}`)
    }
  }
  throw new Error(`无法连接下载地址（${errors.join('；')}）`)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// ---------- 分块 ----------

function planChunks(size: number, ranges: boolean, threads: number): Chunk[] {
  if (!ranges || size <= MIN_CHUNKED_SIZE) {
    return [{ start: 0, end: size > 0 ? size - 1 : -1, downloaded: 0 }]
  }
  const count = Math.max(1, Math.min(threads, Math.floor(size / MIN_CHUNK_SIZE)))
  const base = Math.floor(size / count)
  const chunks: Chunk[] = []
  for (let i = 0; i < count; i++) {
    const start = i * base
    const end = i === count - 1 ? size - 1 : start + base - 1
    chunks.push({ start, end, downloaded: 0 })
  }
  return chunks
}

function chunkDone(chunk: Chunk): boolean {
  return chunk.end >= 0 && chunk.start + chunk.downloaded > chunk.end
}

function receivedBytes(task: Task): number {
  if (task.status === 'fallback_retrying') return task.fallbackWritten
  return task.chunks.reduce((sum, c) => sum + c.downloaded, 0)
}

/** 暂停、取消、其它分块已失败时立即停止 */
function checkState(task: Task): void {
  if (task.status === 'cancelled') throw new DownloadCancelledError()
  if (task.status === 'paused') throw new PausedSignal()
  if (task.failed) throw new Error('其它分块下载失败')
}

function abortAll(task: Task): void {
  for (const controller of task.controllers) controller.abort()
}

async function downloadChunk(task: Task, index: number, file: FileHandle): Promise<void> {
  const chunk = task.chunks[index]
  const dispatcher = downloadDispatcher()
  let attempt = 0
  while (!chunkDone(chunk)) {
    checkState(task)
    const controller = new AbortController()
    task.controllers.add(controller)
    let lastData = Date.now()
    const watchdog = setInterval(() => {
      if (Date.now() - lastData > STALL_TIMEOUT) controller.abort(new StallError())
    }, 2000)
    try {
      const from = chunk.start + chunk.downloaded
      const headers: Record<string, string> = { ...task.headers }
      // 多线程分块，或单线程下载中断后服务器支持续传：从断开的位置接着下；否则从头下载
      const useRange = task.chunked || (rangeSupported(task) && chunk.end >= 0 && chunk.downloaded > 0)
      if (useRange) headers.Range = `bytes=${from}-${chunk.end}`
      else chunk.downloaded = 0
      const res = await request(task.url, { method: 'GET', headers, dispatcher, signal: controller.signal })
      if (useRange && res.statusCode !== 206) {
        discard(res.body)
        throw new Error(`服务器没有按分块返回数据（HTTP ${res.statusCode}）`)
      }
      if (!useRange && (res.statusCode < 200 || res.statusCode >= 300)) {
        discard(res.body)
        throw new Error(`服务器返回 HTTP ${res.statusCode}`)
      }
      let position = useRange ? from : chunk.start
      for await (const data of res.body) {
        lastData = Date.now()
        let buffer = data as Buffer
        if (chunk.end >= 0) {
          const room = chunk.end - position + 1
          if (room <= 0) break
          if (buffer.length > room) buffer = buffer.subarray(0, room)
        }
        await file.write(buffer, 0, buffer.length, position)
        position += buffer.length
        chunk.downloaded += buffer.length
        if (task.status !== 'downloading') {
          discard(res.body)
          checkState(task)
        }
      }
      if (chunk.end < 0) {
        // 大小未知：服务器发送完毕即结束
        chunk.end = chunk.start + chunk.downloaded - 1
        task.total = chunk.downloaded
        return
      }
      if (!chunkDone(chunk)) throw new Error('连接提前断开')
    } catch (e) {
      checkState(task)
      attempt++
      const reason =
        e instanceof StallError || controller.signal.reason instanceof StallError ? '长时间没有收到数据' : errorText(e)
      if (attempt >= CHUNK_ATTEMPTS) {
        throw new Error(`第 ${index + 1} 个分块重试 ${CHUNK_ATTEMPTS} 次仍然失败：${reason}`)
      }
      await sleep(800 * attempt)
    } finally {
      clearInterval(watchdog)
      task.controllers.delete(controller)
    }
  }
}

/** 是否可以按 Range 续传（探测时记录） */
const rangeFlags = new WeakMap<Task, boolean>()
function rangeSupported(task: Task): boolean {
  return rangeFlags.get(task) === true
}

/** 并发下载所有分块：任何一个分块彻底失败时中断其它分块 */
async function runChunks(task: Task, file: FileHandle): Promise<void> {
  const results = await Promise.allSettled(
    task.chunks.map((_, index) =>
      downloadChunk(task, index, file).catch((e) => {
        if (!(e instanceof PausedSignal) && !(e instanceof DownloadCancelledError) && !task.failed) {
          task.failed = true
          abortAll(task)
        }
        throw e
      })
    )
  )
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason)
  if (errors.length === 0) return
  if (errors.some((e) => e instanceof DownloadCancelledError) || task.status === 'cancelled') {
    throw new DownloadCancelledError()
  }
  const real = errors.find(
    (e) => !(e instanceof PausedSignal) && !(e instanceof Error && e.message === '其它分块下载失败')
  )
  if (real) throw real
  if (task.status === 'paused') throw new PausedSignal()
  throw errors[0]
}

async function fileSha1(path: string): Promise<string> {
  const hash = createHash('sha1')
  for await (const data of createReadStream(path)) hash.update(data as Buffer)
  return hash.digest('hex')
}

async function waitForResume(task: Task): Promise<void> {
  if (task.status !== 'paused') return
  await new Promise<void>((resolve) => {
    task.resumeWaiter = resolve
  })
  task.resumeWaiter = undefined
  // 等待期间状态会被 resume / cancel 修改
  if ((task.status as FastDownloadStatus) === 'cancelled') throw new DownloadCancelledError()
}

async function cleanup(task: Task): Promise<void> {
  await rm(task.tempPath, { force: true }).catch(() => undefined)
}

/** 执行下载：探测 → 分块 → 下载（可暂停）→ 校验 → 改名为正式文件 */
async function execute(task: Task): Promise<string> {
  const info = await probe(task)
  task.url = info.url
  rangeFlags.set(task, info.ranges)
  if (task.expectedSize && info.size && task.expectedSize !== info.size) {
    throw new Error(`文件大小和预期不一致（服务器：${info.size}，预期：${task.expectedSize}）`)
  }
  if (!task.destination && task.directory) {
    await mkdir(task.directory, { recursive: true })
    task.destination = await uniqueDestination(
      task.directory,
      sanitizeFileName(task.preferredName || info.fileName || 'download')
    )
    task.fileName = basename(task.destination)
    task.tempPath = `${task.destination}${PART_SUFFIX}`
  }
  task.total = info.size
  task.chunks = planChunks(info.size, info.ranges, task.threads)
  task.chunked = task.chunks.length > 1
  await mkdir(dirname(task.tempPath), { recursive: true })

  const file = await open(task.tempPath, 'w+')
  try {
    if (info.size > 0) await file.truncate(info.size)
    for (;;) {
      checkState(task)
      try {
        await runChunks(task, file)
        // 大小未知时，以实际收到的数据为准
        if (info.size <= 0) await file.truncate(task.total)
        break
      } catch (e) {
        if (!(e instanceof PausedSignal)) throw e
        await waitForResume(task)
        // 服务器不支持分块时，继续下载只能从头开始
        if (!rangeSupported(task)) {
          task.chunks[0].downloaded = 0
          if (info.size <= 0) task.chunks[0].end = -1
        }
      }
    }
  } finally {
    await file.close().catch(() => undefined)
  }

  // 校验
  const size = (await stat(task.tempPath)).size
  if (task.total > 0 && size !== task.total) throw new Error(`下载的文件大小不对（${size} / ${task.total}）`)
  if (task.expectedSize && size !== task.expectedSize) throw new Error('下载的文件大小和预期不一致')
  if (task.sha1) {
    const actual = await fileSha1(task.tempPath)
    if (actual.toLowerCase() !== task.sha1.toLowerCase()) throw new Error('文件校验失败（SHA1 不一致）')
  }
  await mkdir(dirname(task.destination), { recursive: true })
  await rename(task.tempPath, task.destination)
  return task.destination
}

// ---------- 进度推送 ----------

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`
  return `${(bytesPerSecond / 1024).toFixed(bytesPerSecond >= 100 * 1024 ? 0 : 1)} KB/s`
}

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
}

function isActive(task: Task): boolean {
  return task.status === 'downloading' || task.status === 'fallback_retrying' || task.status === 'paused'
}

function snapshot(task: Task): FastDownloadTask {
  const downloaded = receivedBytes(task)
  const total = task.status === 'fallback_retrying' ? task.fallbackTotal : task.total
  const progress = task.status === 'completed' ? 100 : total > 0 ? Math.min(100, (downloaded / total) * 100) : 0
  const running = task.status === 'downloading' || task.status === 'fallback_retrying'
  const speed = running ? task.speed : 0
  const eta = running && speed > 0 && total > 0 ? (total - downloaded) / speed : null
  const chunks =
    task.status === 'fallback_retrying'
      ? [progress]
      : task.chunks.length > 0
        ? task.chunks.map((c) => {
            if (task.status === 'completed') return 100
            const length = c.end >= 0 ? c.end - c.start + 1 : 0
            return length > 0 ? Math.min(100, (c.downloaded / length) * 100) : 0
          })
        : [0]
  return {
    taskId: task.id,
    fileName: task.fileName,
    source: task.source,
    originalSource: task.originalSource,
    destination: task.destination,
    url: task.url,
    totalBytes: total,
    downloadedBytes: downloaded,
    progress,
    speed,
    speedText: formatSpeed(speed),
    eta,
    etaText: formatEta(eta),
    chunks,
    chunked: task.chunked,
    status: task.status,
    error: task.error,
    fallbackReason: task.fallbackReason,
    createdAt: task.createdAt,
    finishedAt: task.finishedAt
  }
}

/** 所有任务（最新的在前） */
export function listFastDownloads(): FastDownloadTask[] {
  return [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt).map(snapshot)
}

function push(): void {
  const list = listFastDownloads()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('download:progress', list)
  }
}

/** 计算网速（平滑处理，避免数字跳动），推送状态；没有进行中的任务时停止计时 */
function tick(): void {
  const now = Date.now()
  for (const task of tasks.values()) {
    const bytes = receivedBytes(task)
    const seconds = (now - task.lastTime) / 1000
    if (seconds > 0) {
      const instant = Math.max(0, bytes - task.lastBytes) / seconds
      task.speed = task.speed === 0 ? instant : task.speed * 0.7 + instant * 0.3
    }
    task.lastBytes = bytes
    task.lastTime = now
  }
  push()
  if (![...tasks.values()].some(isActive)) {
    clearInterval(ticker)
    ticker = undefined
  }
}

function ensureTicker(): void {
  if (!ticker) ticker = setInterval(tick, PUSH_INTERVAL)
}

/** 只保留最近的已结束任务 */
function trimFinished(): void {
  const finished = [...tasks.values()].filter((t) => !isActive(t)).sort((a, b) => b.createdAt - a.createdAt)
  for (const task of finished.slice(MAX_FINISHED)) tasks.delete(task.id)
}

function finish(task: Task, status: FastDownloadStatus, error?: string): void {
  task.status = status
  task.error = error
  task.finishedAt = Date.now()
  task.speed = 0
  trimFinished()
  push()
}

// ---------- 对外接口 ----------

export interface StartedDownload {
  taskId: string
  /** 下载完成时得到保存路径；失败时抛出异常，取消时抛出 DownloadCancelledError */
  promise: Promise<string>
}

/** 新建下载任务并立即开始 */
export function startFastDownload(options: FastDownloadOptions): StartedDownload {
  const urls = options.urls.filter((u) => /^https?:\/\//i.test(u))
  if (urls.length === 0) throw new Error('下载地址无效：只支持 http:// 或 https:// 开头的地址')
  if (!options.destination && !options.directory) throw new Error('没有指定保存位置')
  const id = randomUUID()
  const destination = options.destination ?? ''
  const threads = Math.min(MAX_FAST_THREADS, Math.max(1, Math.floor(options.threads ?? DEFAULT_FAST_THREADS)))
  const task: Task = {
    id,
    source: options.source,
    urls,
    url: urls[0],
    fileName: destination
      ? basename(destination)
      : options.fileName?.trim() || (fileNameFrom(undefined, urls[0]) ?? 'download'),
    destination,
    directory: options.directory,
    preferredName: options.fileName?.trim() || undefined,
    tempPath: destination ? `${destination}${PART_SUFFIX}` : '',
    sha1: options.sha1,
    expectedSize: options.size,
    headers: options.headers ?? {},
    threads,
    total: options.size ?? 0,
    chunked: false,
    chunks: [],
    status: 'downloading',
    createdAt: Date.now(),
    controllers: new Set(),
    failed: false,
    fallbackWritten: 0,
    fallbackTotal: 0,
    lastBytes: 0,
    lastTime: Date.now(),
    speed: 0
  }
  tasks.set(id, task)
  ensureTicker()
  push()

  const promise = execute(task).then(
    (path) => {
      finish(task, 'completed')
      return path
    },
    async (e) => {
      abortAll(task)
      if (task.tempPath) await cleanup(task)
      if (e instanceof DownloadCancelledError || task.status === 'cancelled') {
        finish(task, 'cancelled')
        throw new DownloadCancelledError()
      }
      finish(task, 'error', errorText(e))
      throw e
    }
  )
  return { taskId: id, promise }
}

/** 下载文件（等待完成），返回保存路径 */
export async function fastDownload(options: FastDownloadOptions): Promise<string> {
  return startFastDownload(options).promise
}

export function pauseFastDownload(taskId: string): void {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'downloading') return
  task.status = 'paused'
  abortAll(task)
  push()
}

export function resumeFastDownload(taskId: string): void {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'paused') return
  task.status = 'downloading'
  task.failed = false
  task.lastBytes = receivedBytes(task)
  task.lastTime = Date.now()
  task.speed = 0
  ensureTicker()
  task.resumeWaiter?.()
  push()
}

export function cancelFastDownload(taskId: string): void {
  const task = tasks.get(taskId)
  if (!task || !(task.status === 'downloading' || task.status === 'paused')) return
  task.status = 'cancelled'
  abortAll(task)
  task.resumeWaiter?.()
  push()
}

/** 从列表中移除已结束的任务；不传 taskId 时移除全部已结束的任务 */
export function removeFastDownload(taskId?: string): void {
  for (const task of [...tasks.values()]) {
    if ((taskId === undefined || task.id === taskId) && !isActive(task)) tasks.delete(task.id)
  }
  push()
}

export function getFastDownload(taskId: string): FastDownloadTask | undefined {
  const task = tasks.get(taskId)
  return task ? snapshot(task) : undefined
}

// ---------- 回退到原下载方式时的状态 ----------

/** 高速引擎失败、开始用原下载方式重新下载 */
export function markFallbackStarted(taskId: string, reason: string): void {
  const task = tasks.get(taskId)
  if (!task) return
  task.originalSource = task.source
  task.source = 'fallback'
  task.status = 'fallback_retrying'
  task.fallbackReason = reason
  task.error = undefined
  task.finishedAt = undefined
  task.fallbackWritten = 0
  task.fallbackTotal = 0
  task.lastBytes = 0
  task.lastTime = Date.now()
  task.speed = 0
  task.chunked = false
  ensureTicker()
  push()
}

/** 原下载方式的进度 */
export function reportFallbackProgress(taskId: string, written: number, total: number): void {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'fallback_retrying') return
  task.fallbackWritten = written
  if (total > 0) task.fallbackTotal = total
}

/** 原下载方式结束 */
export function markFallbackFinished(taskId: string, error?: unknown): void {
  const task = tasks.get(taskId)
  if (!task) return
  if (error === undefined) {
    task.fallbackWritten = Math.max(task.fallbackWritten, task.fallbackTotal)
    finish(task, 'completed')
  } else {
    finish(task, 'error', errorText(error))
  }
}
