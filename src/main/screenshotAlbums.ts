/**
 * 截图自动整理：按「每次游玩」把截图分组，并记下那次玩的是哪个存档、哪个服务器。
 * - 游戏结束时记一条游玩记录：开始、结束时间，从这次的游戏日志里找到进入的存档（Preparing level "…"）
 *   和服务器（Connecting to …），再加上这次期间保存过的存档。只是旁观游戏状态，不影响启动
 * - 分组：截图时间落在某次记录里就归到那次；没有记录的老截图按时间间隔分组（隔了 90 分钟以上算另一次）
 */
import { app, nativeImage } from 'electron'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getGameLogs, onGameStatusChange } from './launch'
import { gameDirOf } from './worlds'
import { listScreenshots, screenshotPath } from './screenshots'
import { screenshotTakenAt } from '../shared/screenshotTime'
import type { ScreenshotAlbum } from '../shared/types'

interface SessionRecord {
  versionId: string
  start: number
  end: number
  worlds: string[]
  servers: string[]
}

const FILE = join(app.getPath('userData'), 'screenshot-sessions.json')
const MAX_RECORDS = 300
/** 截图和游玩记录对时间时放宽一点 */
const SLACK = 60 * 1000
/** 没有记录时，隔了这么久算另一次游玩 */
const GAP = 90 * 60 * 1000

let records: SessionRecord[] | null = null
let writing: Promise<void> = Promise.resolve()

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v) ? v : null

async function load(): Promise<SessionRecord[]> {
  if (records) return records
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as { sessions?: unknown }
    records = (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        versionId: text(s.versionId, 128) ?? '',
        start: Number(s.start),
        end: Number(s.end),
        worlds: (Array.isArray(s.worlds) ? s.worlds : []).map((w) => text(w, 128)).filter((w): w is string => !!w),
        servers: (Array.isArray(s.servers) ? s.servers : []).map((w) => text(w, 255)).filter((w): w is string => !!w)
      }))
      .filter((s) => s.versionId && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
      .slice(-MAX_RECORDS)
  } catch {
    records = []
  }
  return records
}

function save(): void {
  const data = JSON.stringify({ sessions: records ?? [] })
  writing = writing
    .then(async () => {
      await mkdir(dirname(FILE), { recursive: true })
      await writeFile(`${FILE}.tmp`, data)
      await rename(`${FILE}.tmp`, FILE)
    })
    .catch((e) => console.warn('保存截图游玩记录失败：', e))
}

/** 从这次的游戏日志里找进入过的存档和服务器 */
export function placesFromLogs(lines: string[]): { worlds: string[]; servers: string[] } {
  const worlds = new Set<string>()
  const servers = new Set<string>()
  for (const line of lines) {
    const level = /Preparing level "([^"\u0000-\u001f]{1,128})"/.exec(line)
    if (level) worlds.add(level[1])
    const server = /Connecting to ([A-Za-z0-9.:[\]_-]{1,253}), (\d{1,5})\b/.exec(line)
    if (server) servers.add(server[2] === '25565' ? server[1] : `${server[1]}:${server[2]}`)
  }
  return { worlds: [...worlds].slice(0, 10), servers: [...servers].slice(0, 10) }
}

/** 这次期间保存过的存档（level.dat 的修改时间在这次游玩里） */
async function savedWorlds(versionId: string, since: number): Promise<string[]> {
  const saves = join(await gameDirOf(versionId), 'saves')
  const out: string[] = []
  for (const entry of await readdir(saves, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const level = await stat(join(saves, entry.name, 'level.dat')).catch(() => null)
    if (level && level.mtimeMs >= since) out.push(entry.name)
  }
  return out.slice(0, 10)
}

export async function recordSession(versionId: string, start: number, end: number, logs: string[]): Promise<void> {
  const list = await load()
  const places = placesFromLogs(logs)
  const saved = await savedWorlds(versionId, start - 5000).catch(() => [])
  const worlds = [...new Set([...places.worlds, ...saved])].slice(0, 10)
  list.push({ versionId, start, end, worlds, servers: places.servers })
  if (list.length > MAX_RECORDS) list.splice(0, list.length - MAX_RECORDS)
  save()
}

let sessionStart = 0
let sessionVersion = ''

export function setupScreenshotSessions(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'launching' && previous !== 'launching') {
      sessionStart = next.startedAt ?? Date.now()
      sessionVersion = next.versionId
    }
    const ended = next.state === 'exited' || next.state === 'crashed'
    if (!ended || !sessionStart || !sessionVersion) return
    const start = sessionStart
    const versionId = sessionVersion
    sessionStart = 0
    // 日志在下次启动时才清空，这里先拿一份
    const logs = getGameLogs().slice()
    void recordSession(versionId, start, Date.now(), logs).catch((e) => console.warn('记录截图游玩失败：', e))
  })
}

/** 把一个版本截图文件夹里的截图按每次游玩分组（新的一次在前，组里按拍摄时间排） */
export async function listScreenshotAlbums(versionId: string): Promise<ScreenshotAlbum[]> {
  const list = await listScreenshots(versionId)
  const shots = list.items
    .map((s) => ({ fileName: s.fileName, time: screenshotTakenAt(s.fileName, s.time) }))
    .sort((a, b) => a.time - b.time)
  // 没开版本隔离的版本共用截图文件夹：同一个文件夹的游玩记录都算
  const dirs = new Map<string, string>()
  const sessions: SessionRecord[] = []
  for (const s of await load()) {
    if (!dirs.has(s.versionId)) dirs.set(s.versionId, await gameDirOf(s.versionId).catch(() => ''))
    if (dirs.get(s.versionId) === dirname(list.dir)) sessions.push(s)
  }
  const albums: ScreenshotAlbum[] = []
  let loose: ScreenshotAlbum | null = null
  const byStart = new Map<number, ScreenshotAlbum>()
  for (const shot of shots) {
    const session = sessions.find((s) => shot.time >= s.start - SLACK && shot.time <= s.end + SLACK)
    if (session) {
      let album = byStart.get(session.start)
      if (!album) {
        album = {
          start: shot.time,
          end: shot.time,
          versionId: session.versionId,
          worlds: session.worlds,
          servers: session.servers,
          recorded: true,
          shots: []
        }
        byStart.set(session.start, album)
        albums.push(album)
      }
      album.shots.push(shot)
      album.end = shot.time
      loose = null
      continue
    }
    if (!loose || shot.time - loose.end > GAP) {
      loose = { start: shot.time, end: shot.time, versionId, worlds: [], servers: [], recorded: false, shots: [] }
      albums.push(loose)
    }
    loose.shots.push(shot)
    loose.end = shot.time
  }
  return albums.sort((a, b) => b.start - a.start)
}

/** 拼图用的缩小图片（data URL，界面画到画布上；最多 30 张） */
export async function screenshotImages(versionId: string, fileNames: unknown, width: unknown): Promise<string[]> {
  const names = Array.isArray(fileNames) ? fileNames.filter((f): f is string => typeof f === 'string').slice(0, 30) : []
  const w = Math.min(800, Math.max(160, Math.round(Number(width) || 480)))
  const out: string[] = []
  for (const name of names) {
    const image = nativeImage.createFromPath(await screenshotPath(versionId, name))
    if (image.isEmpty()) {
      out.push('')
      continue
    }
    const resized = image.getSize().width > w ? image.resize({ width: w, quality: 'good' }) : image
    out.push(`data:image/jpeg;base64,${resized.toJPEG(85).toString('base64')}`)
  }
  return out
}
