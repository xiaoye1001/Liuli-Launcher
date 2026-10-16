import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { totalmem } from 'os'
import { dirname, join } from 'path'
import type { AppSettings } from '../shared/types'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

function defaultSettings(): AppSettings {
  const totalMB = Math.floor(totalmem() / 1024 / 1024)
  return {
    javaPath: '',
    maxMemory: Math.min(4096, Math.floor(totalMB / 2 / 256) * 256),
    downloadSource: 'bmclapi',
    gameDir: join(app.getPath('userData'), '.minecraft')
  }
}

let cache: AppSettings | null = null
let loading: Promise<AppSettings> | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function load(): Promise<AppSettings> {
  const defaults = defaultSettings()
  try {
    const saved = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8')) as Partial<AppSettings>
    return { ...defaults, ...saved }
  } catch {
    return defaults
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
  cache = { ...(cache as AppSettings), ...patch }
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
