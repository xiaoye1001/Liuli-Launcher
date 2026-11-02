import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { PlaySession, PlayStats, YearPlayStats } from '../shared/types'

const STATS_FILE = join(app.getPath('userData'), 'play-stats.json')
/** 最多保留的游玩记录条数 */
const MAX_SESSIONS = 100

let cache: PlayStats | null = null
let writeQueue: Promise<void> = Promise.resolve()

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)

/** 统计文件被改坏时只保留格式正确的内容；用没有原型的对象，版本名是 __proto__ 也不会出问题 */
function sanitizeVersions(raw: unknown): PlayStats['versions'] {
  const versions = Object.create(null) as PlayStats['versions']
  if (!raw || typeof raw !== 'object') return versions
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || id.length > 128) continue
    const v = value as Record<string, unknown>
    versions[id] = { totalMs: num(v.totalMs), launches: num(v.launches), lastPlayed: num(v.lastPlayed) }
  }
  return versions
}

function sanitizeSessions(raw: unknown): PlayStats['sessions'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof s.versionId === 'string')
    .map((s) => ({
      versionId: String(s.versionId),
      start: num(s.start),
      durationMs: num(s.durationMs),
      crashed: s.crashed === true
    }))
}

/** 每年最多记住多少个版本的时长（只留时长最多的） */
const MAX_YEAR_VERSIONS = 100

function emptyYear(): YearPlayStats {
  return {
    totalMs: 0,
    launches: 0,
    crashes: 0,
    longestMs: 0,
    months: new Array(12).fill(0),
    hours: new Array(24).fill(0),
    days: [],
    versions: Object.create(null) as Record<string, number>
  }
}

function numbers(raw: unknown, length: number): number[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length }, (_, i) => num(list[i]))
}

function sanitizeYears(raw: unknown): PlayStats['years'] {
  const years = Object.create(null) as PlayStats['years']
  if (!raw || typeof raw !== 'object') return years
  for (const [year, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}$/.test(year) || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const versions = Object.create(null) as Record<string, number>
    if (v.versions && typeof v.versions === 'object') {
      for (const [id, ms] of Object.entries(v.versions as Record<string, unknown>).slice(0, MAX_YEAR_VERSIONS)) {
        if (id.length <= 128) versions[id] = num(ms)
      }
    }
    years[year] = {
      totalMs: num(v.totalMs),
      launches: num(v.launches),
      crashes: num(v.crashes),
      longestMs: num(v.longestMs),
      months: numbers(v.months, 12),
      hours: numbers(v.hours, 24),
      days: [...new Set((Array.isArray(v.days) ? v.days : []).filter((d) => Number.isInteger(d) && d >= 0 && d < 366))],
      versions
    }
  }
  return years
}

/** 把一次游玩算进它开始的那一年 */
function addToYear(years: PlayStats['years'], session: PlaySession): void {
  const date = new Date(session.start)
  const year = date.getFullYear()
  if (!Number.isFinite(year)) return
  const y = (years[String(year)] ??= emptyYear())
  y.totalMs += session.durationMs
  y.launches += 1
  if (session.crashed) y.crashes += 1
  y.longestMs = Math.max(y.longestMs, session.durationMs)
  y.months[date.getMonth()] += session.durationMs
  y.hours[date.getHours()] += 1
  // 这一年的第几天（用日期相减，夏令时也不会算错）
  const day = Math.round(
    (new Date(year, date.getMonth(), date.getDate()).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000
  )
  if (!y.days.includes(day)) y.days.push(day)
  y.versions[session.versionId] = (y.versions[session.versionId] ?? 0) + session.durationMs
  const ids = Object.keys(y.versions)
  if (ids.length > MAX_YEAR_VERSIONS) {
    const smallest = ids.reduce((a, b) => (y.versions[a] <= y.versions[b] ? a : b))
    delete y.versions[smallest]
  }
}

async function load(): Promise<PlayStats> {
  if (cache) return cache
  try {
    const data = JSON.parse(await readFile(STATS_FILE, 'utf-8'))
    const sessions = sanitizeSessions(data?.sessions)
    let years = sanitizeYears(data?.years)
    // 以前的版本没有按年统计：用保留下来的游玩记录（最近 100 次）补上
    if (!data?.years || typeof data.years !== 'object') {
      years = Object.create(null) as PlayStats['years']
      for (const s of sessions) addToYear(years, s)
    }
    cache = { versions: sanitizeVersions(data?.versions), sessions, years }
  } catch {
    cache = {
      versions: Object.create(null) as PlayStats['versions'],
      sessions: [],
      years: Object.create(null) as PlayStats['years']
    }
  }
  return cache
}

function save(): Promise<void> {
  const data = JSON.stringify(cache, null, 2)
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(dirname(STATS_FILE), { recursive: true })
      await writeFile(`${STATS_FILE}.tmp`, data, 'utf-8')
      await rename(`${STATS_FILE}.tmp`, STATS_FILE)
    })
    .catch((e) => console.error('保存游玩统计失败：', e))
  return writeQueue
}

export async function getPlayStats(): Promise<PlayStats> {
  return load()
}

/** 记录一次游玩（游戏进程退出时调用） */
export async function recordSession(versionId: string, start: number, end: number, crashed: boolean): Promise<void> {
  const stats = await load()
  const durationMs = Math.max(0, end - start)
  const current = stats.versions[versionId] ?? { totalMs: 0, launches: 0, lastPlayed: 0 }
  stats.versions[versionId] = {
    totalMs: current.totalMs + durationMs,
    launches: current.launches + 1,
    lastPlayed: end
  }
  const session: PlaySession = { versionId, start, durationMs, crashed }
  stats.sessions = [session, ...stats.sessions].slice(0, MAX_SESSIONS)
  addToYear(stats.years, session)
  await save()
}

/** 版本改名时，统计跟着换到新名字 */
export async function renamePlayStats(oldId: string, newId: string): Promise<void> {
  const stats = await load()
  if (stats.versions[oldId]) {
    stats.versions[newId] = stats.versions[oldId]
    delete stats.versions[oldId]
  }
  for (const s of stats.sessions) if (s.versionId === oldId) s.versionId = newId
  for (const year of Object.values(stats.years)) {
    if (year.versions[oldId] === undefined) continue
    year.versions[newId] = (year.versions[newId] ?? 0) + year.versions[oldId]
    delete year.versions[oldId]
  }
  await save()
}
