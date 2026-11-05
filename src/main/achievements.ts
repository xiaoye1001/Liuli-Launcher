import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { listInstalledVersions, onGameStatusChange } from './launch'
import { bestLaunchMs } from './launchTiming'
import { getPlayStats } from './playStats'
import { totalDiamonds } from './worlds'
import { isBirthdayToday } from '../shared/birthday'
import { getMainWindow } from './windows'
import { dailyGoalBestStreak } from './dailyGoals'
import { ACHIEVEMENTS, isAchievementId, type AchievementId, type AchievementStatus } from '../shared/achievements'
import type { AppSettings, PlayStats } from '../shared/types'

/**
 * 启动器成就：解锁记录保存在 achievements.json（成就 ID → 解锁时间），
 * 解锁时通知主窗口弹出「达成进度」提示。检查出错不影响其他功能
 */
const FILE = join(app.getPath('userData'), 'achievements.json')
const HOUR = 3_600_000

/** 只读一次文件：同时解锁几个成就时共用同一份记录（各自读一份会互相覆盖，只保存下最后一个） */
let loading: Promise<Record<string, number>> | null = null
let queue: Promise<void> = Promise.resolve()
/** 这次启动是从服务器列表加入服务器，还是「继续上次的存档」（游戏窗口出现后才算解锁） */
let launchKind: 'join_server' | 'continue_world' | null = null

function load(): Promise<Record<string, number>> {
  loading ??= (async () => {
    const data = Object.create(null) as Record<string, number>
    try {
      const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Record<string, unknown>
      for (const [id, time] of Object.entries(raw ?? {})) {
        if (isAchievementId(id) && typeof time === 'number' && Number.isFinite(time)) data[id] = time
      }
    } catch {
      // 还没有解锁过成就
    }
    return data
  })()
  return loading
}

/** 启动游戏的请求：记下是加入服务器还是继续存档，游戏真正运行起来时再解锁对应的成就 */
export function noteLaunchRequest(server: unknown, world: unknown): void {
  launchKind =
    typeof server === 'string' && server ? 'join_server' : typeof world === 'string' && world ? 'continue_world' : null
}

function save(data: Record<string, number>): Promise<void> {
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

/** 解锁成就（已经解锁过的不重复提示） */
export async function unlockAchievement(id: AchievementId): Promise<void> {
  const data = await load()
  if (data[id]) return
  data[id] = Date.now()
  await save(data)
  const win = getMainWindow()
  if (win && !win.webContents.isDestroyed()) win.webContents.send('achievement:unlocked', id)
}

function unlock(id: AchievementId): void {
  void unlockAchievement(id).catch(() => undefined)
}

/** 最长连续玩了几天（按年统计里玩过的日子算） */
function longestStreak(stats: PlayStats): number {
  const days = new Set<number>()
  for (const [year, y] of Object.entries(stats.years ?? {})) {
    const start = Date.UTC(Number(year), 0, 1) / 86_400_000
    for (const d of y.days) days.add(start + d)
  }
  let best = 0
  for (const day of days) {
    if (days.has(day - 1)) continue
    let length = 1
    while (days.has(day + length)) length++
    best = Math.max(best, length)
  }
  return best
}

/** 根据游玩记录检查累计类的成就 */
async function checkPlayStats(): Promise<void> {
  const stats = await getPlayStats()
  const versions = Object.values(stats.versions)
  const totalMs = versions.reduce((sum, v) => sum + v.totalMs, 0)
  if (totalMs >= 10 * HOUR) unlock('hours_10')
  if (totalMs >= 100 * HOUR) unlock('hours_100')
  if (versions.filter((v) => v.totalMs > 0).length >= 5) unlock('explorer')
  if (stats.sessions.some((s) => s.durationMs >= 3 * HOUR)) unlock('marathon')
  if (longestStreak(stats) >= 7) unlock('streak_7')
}

/** 游戏结束后数一数存档里挖到的钻石矿 */
async function checkDiamonds(versionId: string): Promise<void> {
  const data = await load()
  if (data.diamonds_100 || !versionId) return
  if ((await totalDiamonds(versionId)) >= 100) unlock('diamonds_100')
}

/** 设置变化时检查（换了自己的背景） */
export function checkSettingsAchievements(settings: AppSettings): void {
  // 精选主题的壁纸是 liuli-theme- 开头的，自己添加的（background- 开头）才算
  if (settings.backgroundMode !== 'off' && /^background-/.test(settings.backgroundImage)) unlock('decorator')
}

async function onGameRunning(versionId: string): Promise<void> {
  unlock('first_launch')
  if (launchKind) unlock(launchKind)
  launchKind = null
  const hour = new Date().getHours()
  if (hour < 5) unlock('night_owl')
  else if (hour < 7) unlock('early_bird')
  const { birthday } = await getSettings()
  if (birthday && isBirthdayToday(birthday)) unlock('birthday')
  // 启动用时在游戏窗口出现时记录，稍等再看
  setTimeout(() => {
    void bestLaunchMs()
      .then((ms) => ms !== null && ms < 10_000 && unlock('speedrunner'))
      .catch(() => undefined)
  }, 1500)
  const version = (await listInstalledVersions()).find((v) => v.id === versionId)
  if (version?.loader) unlock('modded')
}

/** 启动时调用：关注游戏状态，并检查一次已有的游玩记录和设置 */
export function setupAchievements(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'running' && previous !== 'running') void onGameRunning(next.versionId).catch(() => undefined)
    // 只算游戏运行起来以后的崩溃（启动失败、取消启动也会是 crashed，不算）
    if (next.state === 'crashed' && previous === 'running') unlock('crash')
    if (next.state === 'exited' || next.state === 'crashed') launchKind = null
    // 游玩记录在游戏结束时保存，稍等再检查
    if (next.state === 'exited' || next.state === 'crashed') {
      setTimeout(() => void checkPlayStats().catch(() => undefined), 1500)
      if (previous === 'running') {
        const versionId = next.versionId
        setTimeout(() => void checkDiamonds(versionId).catch(() => undefined), 3000)
      }
    }
  })
  // 启动时检查一次：等主窗口加载完、开屏动画播完再检查，界面才能收到并显示提示
  const check = (): void => {
    setTimeout(() => {
      void checkPlayStats().catch(() => undefined)
      void getSettings()
        .then(checkSettingsAchievements)
        .catch(() => undefined)
    }, 4000)
  }
  const win = getMainWindow()
  if (win && win.webContents.isLoading()) win.webContents.once('did-finish-load', check)
  else check()
}

/** 成就列表（界面显示用），累计类的带进度 */
export async function getAchievements(): Promise<AchievementStatus[]> {
  const data = await load()
  const stats = await getPlayStats()
  const versions = Object.values(stats.versions)
  const hours = versions.reduce((sum, v) => sum + v.totalMs, 0) / HOUR
  const played = versions.filter((v) => v.totalMs > 0).length
  const current: Partial<Record<AchievementId, number>> = {
    hours_10: hours,
    hours_100: hours,
    explorer: played,
    streak_7: longestStreak(stats),
    daily_streak_7: await dailyGoalBestStreak().catch(() => 0)
  }
  return ACHIEVEMENTS.map((a) => {
    const unlocked = !!data[a.id]
    // 隐藏成就解锁前不显示名称和条件
    if ('hidden' in a && a.hidden && !unlocked) {
      return { id: a.id, title: '？？？', desc: '隐藏成就：达成后才会显示', hidden: true }
    }
    return {
      id: a.id,
      title: a.title,
      desc: a.desc,
      ...('hidden' in a && a.hidden ? { hidden: true } : {}),
      ...(unlocked ? { unlockedAt: data[a.id] } : {}),
      ...('target' in a ? { progress: { current: Math.min(current[a.id] ?? 0, a.target), target: a.target } } : {})
    }
  })
}
