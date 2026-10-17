import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { PlaySession, PlayStats } from '../shared/types'

const STATS_FILE = join(app.getPath('userData'), 'play-stats.json')
/** 最多保留的游玩记录条数 */
const MAX_SESSIONS = 100

let cache: PlayStats | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function load(): Promise<PlayStats> {
  if (cache) return cache
  try {
    const data = JSON.parse(await readFile(STATS_FILE, 'utf-8'))
    cache = {
      versions: data && typeof data.versions === 'object' ? data.versions : {},
      sessions: Array.isArray(data?.sessions) ? data.sessions : []
    }
  } catch {
    cache = { versions: {}, sessions: [] }
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
  await save()
}
