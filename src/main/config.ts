import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { totalmem } from 'os'
import { dirname, join } from 'path'
import type { AppSettings, OfflineAccount } from '../shared/types'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

/** 启动器默认的游戏目录：<用户数据目录>/.minecraft */
export function defaultGameDir(): string {
  return join(app.getPath('userData'), '.minecraft')
}

function defaultSettings(): AppSettings {
  const totalMB = Math.floor(totalmem() / 1024 / 1024)
  return {
    javaPath: '',
    javaAuto: true,
    maxMemory: Math.min(4096, Math.floor(totalMB / 2 / 256) * 256),
    memoryAuto: true,
    checkFiles: true,
    downloadSource: 'bmclapi',
    downloadThreads: 16,
    proxyMode: 'none',
    proxyUrl: '',
    gameDir: defaultGameDir(),
    offlineName: 'Steve',
    offlineAccounts: [],
    activeOffline: '',
    selectedVersion: '',
    skinDataUrl: '',
    skinModel: 'default',
    theme: 'system',
    versionIsolation: 'modded',
    activeAccount: 'offline',
    accentColor: 'emerald',
    backgroundImage: '',
    backgroundBlur: 0,
    backgroundDim: 30,
    animations: true,
    afterLaunch: 'keep',
    autoCheckUpdate: true,
    skippedVersion: ''
  }
}

let cache: AppSettings | null = null
let loading: Promise<AppSettings> | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function load(): Promise<AppSettings> {
  const defaults = defaultSettings()
  try {
    const saved = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8')) as Partial<AppSettings>
    // 保存的游戏目录已不存在、而默认目录存在时，改用默认目录。
    // 常见于免安装版：U 盘换了电脑后盘符变化（E: → F:），旧的绝对路径失效
    if (saved.gameDir && !existsSync(saved.gameDir) && existsSync(defaults.gameDir)) {
      saved.gameDir = defaults.gameDir
    }
    // 旧版本在设置中保存过 Client ID，现在改为构建时注入，不再保存
    delete (saved as Record<string, unknown>).msClientId
    return withOfflineAccounts({ ...defaults, ...saved })
  } catch {
    return withOfflineAccounts(defaults)
  }
}

export function newOfflineId(): string {
  return `o-${randomUUID().slice(0, 8)}`
}

/**
 * 保证至少有一个离线账号，并让 offlineName / skinDataUrl / skinModel 与当前离线账号一致。
 * 旧版本只有一个离线账号（保存在这三项里），升级后自动变成列表中的第一个账号。
 */
function withOfflineAccounts(settings: AppSettings): AppSettings {
  let list: OfflineAccount[] = Array.isArray(settings.offlineAccounts)
    ? settings.offlineAccounts.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
    : []
  if (list.length === 0) {
    list = [
      { id: newOfflineId(), name: settings.offlineName, skin: settings.skinDataUrl, skinModel: settings.skinModel }
    ]
  }
  const active = list.find((a) => a.id === settings.activeOffline) ?? list[0]
  return {
    ...settings,
    offlineAccounts: list,
    activeOffline: active.id,
    offlineName: active.name,
    skinDataUrl: active.skin,
    skinModel: active.skinModel
  }
}

/** 修改了当前离线账号的玩家名或皮肤时，同步写回离线账号列表 */
function syncActiveOffline(settings: AppSettings, patch: Partial<AppSettings>): AppSettings {
  if (patch.offlineAccounts || patch.activeOffline) return withOfflineAccounts(settings)
  if (patch.offlineName === undefined && patch.skinDataUrl === undefined && patch.skinModel === undefined) {
    return settings
  }
  return {
    ...settings,
    offlineAccounts: settings.offlineAccounts.map((a) =>
      a.id === settings.activeOffline
        ? { ...a, name: settings.offlineName, skin: settings.skinDataUrl, skinModel: settings.skinModel }
        : a
    )
  }
}

/** 读取设置（首次读取时从磁盘加载，文件缺失或损坏时使用默认值） */
export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache
  if (!loading) {
    loading = load().then((loaded) => {
      cache = loaded
      return loaded
    })
  }
  return loading
}

/** 合并更新设置并写入磁盘（先写临时文件再重命名，避免写到一半损坏） */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await getSettings()
  cache = syncActiveOffline({ ...(cache as AppSettings), ...patch }, patch)
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(dirname(SETTINGS_FILE), { recursive: true })
      const tmp = `${SETTINGS_FILE}.tmp`
      await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf-8')
      await rename(tmp, SETTINGS_FILE)
    })
    .catch((e) => console.error('保存设置失败：', e))
  await writeQueue
  // 返回最新的完整设置（可能已包含之后其他更新的内容）
  return cache as AppSettings
}
