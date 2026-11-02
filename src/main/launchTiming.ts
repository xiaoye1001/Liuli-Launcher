import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { onGameStatusChange } from './launch'
import type { LaunchTiming, LaunchTimingRecord } from '../shared/types'

/**
 * 启动用时：从游戏进程启动到游戏窗口出现用了多久（不算启动前检查文件、下载 Java 的时间，前后可以比较）。
 * 记录最近一次、每个版本的上一次和最快的一次，保存在 launch-times.json
 */
const FILE = join(app.getPath('userData'), 'launch-times.json')

interface TimingData {
  last?: LaunchTimingRecord
  best?: LaunchTimingRecord
  versions: Record<string, { last?: LaunchTimingRecord; best?: LaunchTimingRecord }>
}

let loading: Promise<TimingData> | null = null
let queue: Promise<void> = Promise.resolve()
/** 最近一次启动和这个版本的上一次相比 */
let latest: LaunchTiming | null = null

function valid(r: unknown): r is LaunchTimingRecord {
  const x = r as LaunchTimingRecord
  return !!x && typeof x.versionId === 'string' && Number.isFinite(x.ms) && x.ms > 0 && Number.isFinite(x.at)
}

function load(): Promise<TimingData> {
  loading ??= (async () => {
    const data: TimingData = { versions: Object.create(null) }
    try {
      const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Partial<TimingData>
      if (valid(raw.last)) data.last = raw.last
      if (valid(raw.best)) data.best = raw.best
      for (const [id, v] of Object.entries(raw.versions ?? {})) {
        if (id.length > 128 || !v || typeof v !== 'object') continue
        data.versions[id] = { ...(valid(v.last) ? { last: v.last } : {}), ...(valid(v.best) ? { best: v.best } : {}) }
      }
    } catch {
      // 还没有记录
    }
    return data
  })()
  return loading
}

function save(data: TimingData): Promise<void> {
  queue = queue
    .then(async () => {
      await mkdir(dirname(FILE), { recursive: true })
      const tmp = `${FILE}.tmp`
      await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
      await rename(tmp, FILE)
    })
    .catch(() => undefined)
  return queue
}

async function record(versionId: string, ms: number): Promise<void> {
  const data = await load()
  const entry: LaunchTimingRecord = { versionId, ms, at: Date.now() }
  const version = (data.versions[versionId] ??= {})
  latest = { current: entry, previous: version.last, best: data.best }
  version.last = entry
  if (!version.best || ms < version.best.ms) version.best = entry
  data.last = entry
  if (!data.best || ms < data.best.ms) data.best = entry
  await save(data)
}

export function setupLaunchTiming(): void {
  onGameStatusChange((next, previous) => {
    if (next.state !== 'running' || previous === 'running' || !next.startedAt) return
    const ms = Date.now() - next.startedAt
    // 超过 30 分钟的不算（例如电脑休眠过）
    if (ms > 0 && ms < 30 * 60_000) void record(next.versionId, ms).catch(() => undefined)
  })
}

/** 最近一次启动的用时（和这个版本上一次比较）以及最快的一次 */
export async function getLaunchTiming(): Promise<{ latest: LaunchTiming | null; best?: LaunchTimingRecord }> {
  const data = await load()
  return { latest, best: data.best }
}

/** 最快的一次启动（成就用） */
export async function bestLaunchMs(): Promise<number | null> {
  return (await load()).best?.ms ?? null
}
