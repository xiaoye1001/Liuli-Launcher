import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { DAILY_GOALS } from '../shared/dailyGoals'
import { unlockAchievement } from './achievements'
import type { DailyGoalStatus } from '../shared/types'

/**
 * 每日小目标：每天一个小挑战，按日期选（同一天一样），可以换 3 次；完成后打卡，连续打卡的天数会记下来，
 * 第一次完成和连续 7 天完成会解锁成就。记录保存在 daily-goals.json（只记日期，最多一年多）
 */
const FILE = join(app.getPath('userData'), 'daily-goals.json')
const MAX_SKIPS = 3
const MAX_DAYS = 400

interface Data {
  /** 完成的日子（YYYY-MM-DD，本地时间） */
  done: string[]
  /** 今天换过几次 */
  skips: { date: string; count: number }
}

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

/** 本地日期 YYYY-MM-DD */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function load(): Promise<Data> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Partial<Data>
    const done = Array.isArray(raw.done)
      ? raw.done.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d))
      : []
    const skips =
      raw.skips &&
      typeof raw.skips.date === 'string' &&
      DATE_RE.test(raw.skips.date) &&
      Number.isFinite(raw.skips.count)
        ? { date: raw.skips.date, count: Math.max(0, Math.min(MAX_SKIPS, Math.floor(raw.skips.count))) }
        : { date: '', count: 0 }
    return { done: [...new Set(done)].sort().slice(-MAX_DAYS), skips }
  } catch {
    return { done: [], skips: { date: '', count: 0 } }
  }
}

async function save(data: Data): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(`${FILE}.tmp`, JSON.stringify(data, null, 2), 'utf-8')
  await rename(`${FILE}.tmp`, FILE)
}

/** 日期字符串的简单哈希（同一天得到同一个目标） */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/** 从某一天往前数连续完成了几天 */
function streakFrom(done: Set<string>, start: Date): number {
  let n = 0
  while (done.has(dateKey(addDays(start, -n)))) n++
  return n
}

/** 最长的连续天数（日期换成天数编号，相差 1 就是连续的） */
function bestStreak(days: string[]): number {
  const nums = [
    ...new Set(
      days.map((day) => {
        const [y, m, d] = day.split('-').map(Number)
        return Date.UTC(y, m - 1, d) / 86_400_000
      })
    )
  ].sort((a, b) => a - b)
  let best = 0
  let run = 0
  nums.forEach((n, i) => {
    run = i > 0 && n === nums[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

function statusOf(data: Data, now: Date): DailyGoalStatus {
  const today = dateKey(now)
  const skips = data.skips.date === today ? data.skips.count : 0
  const index = (hash(today) + skips) % DAILY_GOALS.length
  const done = new Set(data.done)
  const doneToday = done.has(today)
  // 今天还没打卡时，从昨天算起的连续天数也还有效
  const streak = doneToday ? streakFrom(done, now) : streakFrom(done, addDays(now, -1))
  return {
    date: today,
    goal: DAILY_GOALS[index],
    done: doneToday,
    streak,
    best: bestStreak(data.done),
    total: data.done.length,
    skipsLeft: doneToday ? 0 : MAX_SKIPS - skips
  }
}

export function getDailyGoal(now = new Date()): Promise<DailyGoalStatus> {
  return serialized(async () => statusOf(await load(), now))
}

/** 打卡（done 为 false 时取消今天的打卡） */
export function setDailyGoalDone(done: boolean, now = new Date()): Promise<DailyGoalStatus> {
  return serialized(async () => {
    const data = await load()
    const today = dateKey(now)
    data.done = done
      ? [...new Set([...data.done, today])].sort().slice(-MAX_DAYS)
      : data.done.filter((d) => d !== today)
    await save(data)
    const status = statusOf(data, now)
    if (done) {
      void unlockAchievement('daily_goal').catch(() => undefined)
      if (status.streak >= 7) void unlockAchievement('daily_streak_7').catch(() => undefined)
    }
    return status
  })
}

/** 换一个目标（每天最多 3 次，打卡后不能换） */
export function skipDailyGoal(now = new Date()): Promise<DailyGoalStatus> {
  return serialized(async () => {
    const data = await load()
    const today = dateKey(now)
    if (data.done.includes(today)) throw new Error('今天已经完成了')
    const count = data.skips.date === today ? data.skips.count : 0
    if (count >= MAX_SKIPS) throw new Error(`每天最多换 ${MAX_SKIPS} 次`)
    data.skips = { date: today, count: count + 1 }
    await save(data)
    return statusOf(data, now)
  })
}

/** 成就进度用：最长连续完成天数 */
export async function dailyGoalBestStreak(): Promise<number> {
  return bestStreak((await load()).done)
}
