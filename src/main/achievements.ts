import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { listInstalledVersions, onGameStatusChange } from './launch'
import { getPlayStats } from './playStats'
import { getMainWindow } from './windows'
import { ACHIEVEMENTS, isAchievementId, type AchievementId, type AchievementStatus } from '../shared/achievements'
import type { AppSettings } from '../shared/types'

/**
 * 启动器成就：解锁记录保存在 achievements.json（成就 ID → 解锁时间），
 * 解锁时通知主窗口弹出「达成进度」提示。检查出错不影响其他功能
 */
const FILE = join(app.getPath('userData'), 'achievements.json')
const HOUR = 3_600_000

let unlocked: Record<string, number> | null = null
let queue: Promise<void> = Promise.resolve()

async function load(): Promise<Record<string, number>> {
  if (unlocked) return unlocked
  const data = Object.create(null) as Record<string, number>
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Record<string, unknown>
    for (const [id, time] of Object.entries(raw ?? {})) {
      if (isAchievementId(id) && typeof time === 'number' && Number.isFinite(time)) data[id] = time
    }
  } catch {
    // 还没有解锁过成就
  }
  unlocked = data
  return data
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

/** 根据游玩记录检查累计类的成就 */
async function checkPlayStats(): Promise<void> {
  const stats = await getPlayStats()
  const versions = Object.values(stats.versions)
  const totalMs = versions.reduce((sum, v) => sum + v.totalMs, 0)
  if (totalMs >= 10 * HOUR) unlock('hours_10')
  if (totalMs >= 100 * HOUR) unlock('hours_100')
  if (versions.filter((v) => v.totalMs > 0).length >= 5) unlock('explorer')
  if (stats.sessions[0] && stats.sessions[0].durationMs >= 3 * HOUR) unlock('marathon')
}

/** 设置变化时检查（换了自己的背景） */
export function checkSettingsAchievements(settings: AppSettings): void {
  // 精选主题的壁纸是 liuli-theme- 开头的，自己添加的（background- 开头）才算
  if (settings.backgroundMode !== 'off' && /^background-/.test(settings.backgroundImage)) unlock('decorator')
}

async function onGameRunning(versionId: string): Promise<void> {
  unlock('first_launch')
  const hour = new Date().getHours()
  if (hour < 5) unlock('night_owl')
  else if (hour < 7) unlock('early_bird')
  const version = (await listInstalledVersions()).find((v) => v.id === versionId)
  if (version?.loader) unlock('modded')
}

/** 启动时调用：关注游戏状态，并检查一次已有的游玩记录和设置 */
export function setupAchievements(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'running' && previous !== 'running') void onGameRunning(next.versionId).catch(() => undefined)
    if (next.state === 'crashed') unlock('crash')
    // 游玩记录在游戏结束时保存，稍等再检查
    if (next.state === 'exited' || next.state === 'crashed') {
      setTimeout(() => void checkPlayStats().catch(() => undefined), 1500)
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
  const current: Partial<Record<AchievementId, number>> = { hours_10: hours, hours_100: hours, explorer: played }
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    desc: a.desc,
    ...(data[a.id] ? { unlockedAt: data[a.id] } : {}),
    ...('target' in a ? { progress: { current: Math.min(current[a.id] ?? 0, a.target), target: a.target } } : {})
  }))
}
