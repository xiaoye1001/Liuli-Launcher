import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { onGameStatusChange } from './launch'
import { sanitizeLog } from './logShare'
import type { CrashRecord } from '../shared/types'

/**
 * 崩溃记录：每次游戏崩溃或启动失败都记下时间、版本、识别出的原因（或关键错误），
 * 方便对比「是不是同一个问题」。保存在启动器数据文件夹的 crash-history.json，最多 50 条
 */
const FILE = join(app.getPath('userData'), 'crash-history.json')
const MAX = 50

let loading: Promise<CrashRecord[]> | null = null
let queue: Promise<unknown> = Promise.resolve()

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

function load(): Promise<CrashRecord[]> {
  loading ??= (async () => {
    try {
      const raw = JSON.parse(await readFile(FILE, 'utf-8')) as unknown
      if (!Array.isArray(raw)) return []
      return raw
        .filter((r): r is CrashRecord => !!r && typeof r.id === 'string' && Number.isFinite(r.at))
        .map((r) => ({
          id: r.id,
          at: r.at,
          versionId: text(r.versionId, 128),
          kind: r.kind === 'launch' ? ('launch' as const) : ('crash' as const),
          exitCode: Number.isFinite(r.exitCode) ? r.exitCode : null,
          causes: Array.isArray(r.causes)
            ? r.causes
                .map((c) => text(c, 100))
                .filter(Boolean)
                .slice(0, 5)
            : [],
          detail: text(r.detail, 400)
        }))
        .slice(0, MAX)
    } catch {
      return []
    }
  })()
  return loading
}

function save(list: CrashRecord[]): Promise<void> {
  const data = JSON.stringify(list, null, 2)
  const next = queue.then(async () => {
    await mkdir(dirname(FILE), { recursive: true })
    await writeFile(`${FILE}.tmp`, data, 'utf-8')
    await rename(`${FILE}.tmp`, FILE)
  })
  queue = next.catch(() => undefined)
  return next
}

/** 启动时调用：游戏崩溃或启动失败时记一条 */
export function setupCrashHistory(): void {
  onGameStatusChange((next) => {
    if (next.state !== 'crashed') return
    const analysis = next.analysis
    const record: CrashRecord = {
      id: randomUUID(),
      at: Date.now(),
      versionId: next.versionId,
      kind: analysis ? 'crash' : 'launch',
      exitCode: analysis?.exitCode ?? next.exitCode ?? null,
      causes: (analysis?.causes ?? []).map((c) => c.title).slice(0, 5),
      // 没有识别出原因时记关键错误；启动失败记失败原因的第一行（去掉登录令牌和用户文件夹路径再保存）
      detail: sanitizeLog(analysis ? (analysis.keyError ?? '') : (next.error ?? '').split('\n')[0]).slice(0, 400)
    }
    void load()
      .then((list) => {
        list.unshift(record)
        list.splice(MAX)
        return save(list)
      })
      .catch(() => undefined)
  })
}

export async function listCrashHistory(): Promise<CrashRecord[]> {
  return [...(await load())]
}

export async function clearCrashHistory(): Promise<void> {
  const list = await load()
  list.splice(0)
  await save(list)
}
