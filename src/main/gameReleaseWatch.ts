import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { notify } from './notify'
import { getVersionManifest } from './versions'
import type { GameReleaseNews } from '../shared/types'

/**
 * Minecraft 新版本发布提醒：启动器开着时每 3 小时看一次版本清单，最新正式版（或快照）变了就提醒：
 * 主页显示一条消息，启动器在后台时弹系统通知。第一次运行只记下当前的最新版本，不提醒。
 * 记录保存在 game-release-watch.json
 */
const FILE = join(app.getPath('userData'), 'game-release-watch.json')
const INTERVAL = 3 * 60 * 60_000
/** 启动后等一会儿再查，不和启动时的其他请求挤在一起 */
const FIRST_DELAY = Math.max(1000, Number(process.env.LIULI_RELEASE_WATCH_DELAY) || 45_000)

interface WatchState {
  /** 上次看到的最新正式版、快照 */
  release: string
  snapshot: string
  /** 还没被关掉的提醒 */
  news: GameReleaseNews | null
}

let state: WatchState | null = null
let checking = false

const VERSION_ID = /^[\w.+ -]{1,64}$/

function cleanId(value: unknown): string {
  return typeof value === 'string' && VERSION_ID.test(value) ? value : ''
}

async function load(): Promise<WatchState | null> {
  if (state) return state
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Partial<WatchState>
    const news = raw.news as Partial<GameReleaseNews> | null | undefined
    state = {
      release: cleanId(raw.release),
      snapshot: cleanId(raw.snapshot),
      news:
        news && cleanId(news.id) && (news.type === 'release' || news.type === 'snapshot')
          ? { id: cleanId(news.id), type: news.type, releaseTime: String(news.releaseTime ?? '').slice(0, 40) }
          : null
    }
  } catch {
    // 还没有记录：第一次运行
    state = null
  }
  return state
}

async function save(next: WatchState): Promise<void> {
  state = next
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(`${FILE}.tmp`, JSON.stringify(next, null, 2), 'utf-8')
  await rename(`${FILE}.tmp`, FILE)
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('gameRelease:changed', state?.news ?? null)
  }
}

/** 看一次版本清单；有新版本时记下并提醒 */
export async function checkGameRelease(): Promise<void> {
  if (checking) return
  checking = true
  try {
    const settings = await getSettings()
    if (settings.gameReleaseAlerts === 'off') return
    const manifest = await getVersionManifest(settings.downloadSource, true)
    const release = cleanId(manifest.latest.release)
    const snapshot = cleanId(manifest.latest.snapshot)
    if (!release) return
    const old = await load()
    if (!old || !old.release) {
      // 第一次：只记下现在的最新版本
      await save({ release, snapshot, news: null })
      return
    }
    const entry = (id: string): string => manifest.versions.find((v) => v.id === id)?.releaseTime ?? ''
    let news: GameReleaseNews | null = old.news
    if (release !== old.release) {
      news = { id: release, type: 'release', releaseTime: entry(release) }
      void notify(`Minecraft ${release} 正式版发布了`, '打开启动器就能一键安装')
    } else if (snapshot && snapshot !== old.snapshot && snapshot !== release && settings.gameReleaseAlerts === 'all') {
      news = { id: snapshot, type: 'snapshot', releaseTime: entry(snapshot) }
      void notify(`Minecraft 快照 ${snapshot} 发布了`, '打开启动器就能一键安装（快照不稳定，记得备份存档）')
    }
    // 正式版发布后，旧的快照提醒就不用了
    if (news?.type === 'snapshot' && release !== old.release) news = null
    await save({ release, snapshot, news })
    if (news !== old.news) broadcast()
  } finally {
    checking = false
  }
}

/** 主页显示的提醒 */
export async function getGameReleaseNews(): Promise<GameReleaseNews | null> {
  const settings = await getSettings()
  if (settings.gameReleaseAlerts === 'off') return null
  const news = (await load())?.news ?? null
  if (news?.type === 'snapshot' && settings.gameReleaseAlerts !== 'all') return null
  return news
}

/** 关掉提醒（「知道了」或者已经去安装） */
export async function dismissGameReleaseNews(): Promise<void> {
  const current = await load()
  if (!current?.news) return
  await save({ ...current, news: null })
  broadcast()
}

export function setupGameReleaseWatch(): void {
  setTimeout(() => void checkGameRelease().catch(() => undefined), FIRST_DELAY)
  setInterval(() => void checkGameRelease().catch(() => undefined), INTERVAL)
}
