import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { getGameStatus, listInstalledVersions } from './launch'
import { checkModUpdates } from './modrinth'
import { modsContextOf } from './mods'
import { notify } from './notify'
import type { ModUpdate, ModUpdateSummary } from '../shared/types'

/**
 * 模组更新提醒：启动器开着时，每 6 小时在后台检查一次各个版本的模组有没有新版本（只能检查 Modrinth 上的模组），
 * 版本列表上显示「N 个模组可更新」。结果保存在 mod-update-cache.json；在模组页手动检查、更新模组时也会更新这里
 */
const FILE = join(app.getPath('userData'), 'mod-update-cache.json')
const INTERVAL = 6 * 60 * 60_000
/** 启动后等一会儿再查，不和启动时的其他请求挤在一起 */
const FIRST_DELAY = Math.max(1000, Number(process.env.LIULI_MOD_UPDATE_DELAY) || 60_000)
/** 两个版本之间隔一会儿，不连续请求 */
const GAP = 3_000

let cache: Record<string, ModUpdateSummary> | null = null
let checking = false

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function load(): Promise<Record<string, ModUpdateSummary>> {
  if (cache) return cache
  const result: Record<string, ModUpdateSummary> = {}
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as Record<string, Partial<ModUpdateSummary>>
    for (const [id, s] of Object.entries(raw ?? {})) {
      if (!s || !Number.isFinite(s.at) || !Array.isArray(s.mods)) continue
      result[id] = {
        at: Number(s.at),
        mods: s.mods
          .filter((m) => m && typeof m.fileName === 'string' && typeof m.title === 'string')
          .map((m) => ({
            fileName: m.fileName.slice(0, 255),
            title: m.title.slice(0, 100),
            newVersion: typeof m.newVersion === 'string' ? m.newVersion.slice(0, 64) : ''
          }))
          .slice(0, 200)
      }
    }
  } catch {
    // 还没有检查过
  }
  cache = result
  return result
}

async function save(): Promise<void> {
  if (!cache) return
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(`${FILE}.tmp`, JSON.stringify(cache, null, 2), 'utf-8')
  await rename(`${FILE}.tmp`, FILE)
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('modUpdates:changed', cache ?? {})
  }
}

/** 记下一个版本的检查结果（后台检查和模组页的手动检查都会调用） */
export async function recordModUpdates(versionId: string, updates: ModUpdate[]): Promise<void> {
  const data = await load()
  data[versionId] = {
    at: Date.now(),
    mods: updates.slice(0, 200).map((u) => ({ fileName: u.fileName, title: u.title, newVersion: u.newVersion }))
  }
  await save().catch(() => undefined)
  broadcast()
}

/** 更新了一个模组：从可更新列表里去掉 */
export async function markModUpdated(versionId: string, fileName: string): Promise<void> {
  const data = await load()
  const entry = data[versionId]
  if (!entry) return
  entry.mods = entry.mods.filter((m) => m.fileName !== fileName)
  await save().catch(() => undefined)
  broadcast()
}

/** 各个版本可以更新的模组（界面显示用） */
export async function getModUpdateSummary(): Promise<Record<string, ModUpdateSummary>> {
  return { ...(await load()) }
}

/** 检查所有装了模组加载器的版本（同一个 mods 文件夹只查一次） */
export async function checkAllModUpdates(force = false): Promise<void> {
  if (checking) return
  checking = true
  try {
    if (!(await getSettings()).modUpdateCheck) return
    const data = await load()
    const before = new Map(Object.entries(data).map(([id, s]) => [id, new Set(s.mods.map((m) => m.fileName))]))
    const seen = new Set<string>()
    const found: { id: string; count: number }[] = []
    for (const version of await listInstalledVersions().catch(() => [])) {
      if (!version.loader || version.loader === 'optifine') continue
      const ctx = await modsContextOf(version.id).catch(() => null)
      if (!ctx || seen.has(ctx.dir)) continue
      seen.add(ctx.dir)
      // 6 小时内查过的不再查；游戏运行时不查（不和游戏抢网络）
      if (!force && Date.now() - (data[version.id]?.at ?? 0) < INTERVAL) continue
      const game = getGameStatus()
      if (game.state === 'launching' || game.state === 'running') break
      const updates = await checkModUpdates(version.id).catch(() => null)
      if (updates) {
        await recordModUpdates(version.id, updates)
        const fresh = updates.filter((u) => !before.get(version.id)?.has(u.fileName))
        if (fresh.length > 0) found.push({ id: version.id, count: updates.length })
      }
      await sleep(GAP)
    }
    if (found.length > 0) {
      const total = found.reduce((n, f) => n + f.count, 0)
      void notify(
        `有 ${total} 个模组可以更新`,
        found.map((f) => `${f.id} ${f.count} 个`).join('、') + '，打开启动器的「版本」页查看'
      )
    }
  } finally {
    checking = false
  }
}

export function setupModUpdateWatch(): void {
  setTimeout(() => void checkAllModUpdates().catch(() => undefined), FIRST_DELAY)
  setInterval(() => void checkAllModUpdates().catch(() => undefined), INTERVAL)
}
