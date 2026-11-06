import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir, totalmem } from 'os'
import { basename, dirname, join, resolve } from 'path'
import type { AppSettings, GameDirEntry, OfflineAccount } from '../shared/types'
import { AI_PROVIDERS, AI_PROVIDER_IDS } from '../shared/aiProviders'
import { portableDir } from './paths'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

/**
 * 启动器默认的游戏目录，和启动器自己的文件（设置、账号、缓存、Java）分开放：
 * - 免安装版：exe 旁边的 .minecraft（启动器的文件在旁边的 LiuliLauncher-Data 里）
 * - 安装版：系统的 .minecraft（和官方启动器共用）
 */
export function defaultGameDir(): string {
  return portableDir ? join(dirname(portableDir), '.minecraft') : officialGameDir()
}

/** 旧版本（0.5.1 及以前）的默认游戏目录：放在启动器的数据文件夹里，启动时搬到 defaultGameDir（见 gameDirMove.ts） */
export function legacyGameDir(): string {
  return join(app.getPath('userData'), '.minecraft')
}

/** 官方启动器的 .minecraft 目录 */
export function officialGameDir(): string {
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? homedir(), '.minecraft')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'minecraft')
  return join(homedir(), '.minecraft')
}

export function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  return norm(a) === norm(b)
}

/** 新添加的游戏目录的默认名字：.minecraft 文件夹用上一级文件夹的名字（例如「愚者整合包」） */
export function gameDirDisplayName(path: string): string {
  if (samePath(path, defaultGameDir())) return '默认目录'
  if (samePath(path, officialGameDir())) return '官方启动器目录'
  if (samePath(path, legacyGameDir())) return '旧的默认目录'
  const base = basename(path)
  const name = /^\.?minecraft$/i.test(base) ? basename(dirname(path)) || base : base
  return name.slice(0, 32) || path
}

/** 整理游戏目录列表：去掉无效和重复的项，保证默认目录和当前目录都在列表中 */
function withGameDirs(settings: AppSettings): AppSettings {
  const list: GameDirEntry[] = []
  const add = (entry: GameDirEntry): void => {
    if (!list.some((e) => samePath(e.path, entry.path))) list.push(entry)
  }
  add({ path: defaultGameDir(), name: '默认目录' })
  for (const e of Array.isArray(settings.gameDirs) ? settings.gameDirs : []) {
    if (e && typeof e.path === 'string' && e.path && typeof e.name === 'string') {
      const existing = list.find((x) => samePath(x.path, e.path))
      // 默认目录可以改名：用保存的名字替换上面的默认名字
      if (existing) Object.assign(existing, { name: e.name || existing.name, selectedVersion: e.selectedVersion })
      else add({ path: e.path, name: e.name.trim() || gameDirDisplayName(e.path), selectedVersion: e.selectedVersion })
    }
  }
  add({ path: settings.gameDir, name: gameDirDisplayName(settings.gameDir) })
  return { ...settings, gameDirs: list }
}

function defaultSettings(): AppSettings {
  const totalMB = Math.floor(totalmem() / 1024 / 1024)
  return {
    javaPath: '',
    javaAuto: true,
    maxMemory: Math.min(4096, Math.floor(totalMB / 2 / 256) * 256),
    memoryAuto: true,
    optimizeGc: true,
    checkFiles: true,
    openLogOnLaunch: false,
    launchSplash: true,
    darkLoadingScreen: true,
    defaultChinese: true,
    showTray: true,
    systemNotifications: true,
    playReminderMinutes: 0,
    autoBackupWorlds: true,
    backupDir: '',
    downloadSource: 'bmclapi',
    showNews: true,
    showRecentPlays: true,
    showSplash: true,
    showTrivia: true,
    showDailyGoal: true,
    autoSnapshots: true,
    modUpdateCheck: true,
    gameReleaseAlerts: 'release',
    onboardingDone: false,
    cloudBackupEnabled: false,
    cloudBackupUrl: '',
    cloudBackupUser: '',
    cloudBackupFolder: 'LiuliLauncher',
    birthday: '',
    recentPlaysCollapsed: false,
    downloadThreads: 16,
    proxyMode: 'none',
    proxyUrl: '',
    gameDir: defaultGameDir(),
    gameDirs: [],
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
    customAccent: '#10b981',
    panelOpacity: 10,
    panelBlur: 24,
    backgroundImage: '',
    backgroundImages: [],
    backgroundMode: 'off',
    backgroundInterval: 10,
    backgroundFit: 'cover',
    themePreset: 'aurora',
    particleEffect: 'auto',
    particleDensity: 'normal',
    particleSpeed: 100,
    particleInteract: true,
    parallax: true,
    customThemes: [],
    autoTheme: { enabled: false, day: 'preset:sky', night: 'preset:aurora', dayStart: '07:00', nightStart: '19:00' },
    backgroundBlur: 0,
    backgroundDim: 30,
    animations: true,
    clickEffect: true,
    themeMusic: '',
    fontFamily: '',
    uiScale: 100,
    musicEnabled: false,
    musicVolume: 40,
    musicOrder: 'sequential',
    musicPauseInGame: true,
    launcherTitle: '',
    launcherSubtitle: '',
    hiddenPages: [],
    welcomeTitle: '',
    welcomeSubtitle: '',
    afterLaunch: 'keep',
    autoCheckUpdate: true,
    updateSource: 'auto',
    skippedVersion: '',
    aiProvider: 'anthropic',
    aiBaseUrl: AI_PROVIDERS[0].baseUrl,
    aiModel: AI_PROVIDERS[0].model,
    aiAutoAnalyze: true
  }
}

/** 界面不能直接修改的设置：由专门的接口管理（切换游戏目录、背景库、账号） */
const MANAGED_KEYS = new Set<string>([
  'gameDir',
  'gameDirs',
  'backgroundImages',
  'offlineAccounts',
  'activeOffline',
  'activeAccount',
  // AI 助手的服务商、接口地址、模型由 AI 设置接口检查后修改
  'aiProvider',
  'aiBaseUrl',
  'aiModel',
  // 存档备份位置由选择文件夹的接口检查后修改
  'backupDir',
  // 存档云备份的网盘地址、账号由云备份设置接口检查后修改
  'cloudBackupEnabled',
  'cloudBackupUrl',
  'cloudBackupUser',
  'cloudBackupFolder'
])

/** 是不是只能由专门接口修改的设置项（设置导出时不包含） */
export function isManagedSetting(key: string): boolean {
  return MANAGED_KEYS.has(key)
}

/** 取值固定的设置项 */
const ENUM_VALUES: Partial<Record<keyof AppSettings, readonly string[]>> = {
  downloadSource: ['mojang', 'bmclapi'],
  proxyMode: ['none', 'system', 'custom'],
  skinModel: ['default', 'slim'],
  theme: ['system', 'dark', 'light'],
  versionIsolation: ['off', 'modded', 'all'],
  accentColor: ['emerald', 'sky', 'violet', 'rose', 'amber', 'teal', 'indigo', 'red', 'lime', 'slate', 'custom'],
  backgroundMode: ['off', 'fixed', 'random', 'slideshow'],
  backgroundFit: ['cover', 'contain', 'stretch', 'center', 'tile'],
  musicOrder: ['sequential', 'shuffle', 'single'],
  afterLaunch: ['keep', 'minimize', 'hide'],
  updateSource: ['auto', 'official', 'github'],
  aiProvider: AI_PROVIDER_IDS,
  particleDensity: ['low', 'normal', 'high'],
  gameReleaseAlerts: ['off', 'release', 'all']
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 检查设置项的类型：只保留已知的设置项，类型必须与默认值一致，取值固定的项必须是允许的值。
 * 不合格的项直接丢弃（保留原来的值）
 */
function checkedSettings(input: unknown, defaults: AppSettings, allowManaged: boolean): Partial<AppSettings> {
  if (!isPlainObject(input)) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue
    if (!allowManaged && MANAGED_KEYS.has(key)) continue
    const fallback = (defaults as unknown as Record<string, unknown>)[key]
    if (Array.isArray(fallback) ? !Array.isArray(value) : typeof value !== typeof fallback) continue
    if (isPlainObject(fallback) && !isPlainObject(value)) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    const allowed = ENUM_VALUES[key as keyof AppSettings]
    if (allowed && !allowed.includes(value as string)) continue
    result[key] = value
  }
  if (typeof result.skinDataUrl === 'string' && result.skinDataUrl !== '') {
    // 皮肤只能是不超过 1 MB 的 PNG
    if (!result.skinDataUrl.startsWith('data:image/png;base64,') || result.skinDataUrl.length > 1_500_000) {
      delete result.skinDataUrl
    }
  }
  return result as Partial<AppSettings>
}

/** 检查界面发来的设置修改 */
export function sanitizeSettingsPatch(patch: unknown): Partial<AppSettings> {
  return checkedSettings(patch, defaultSettings(), false)
}

let cache: AppSettings | null = null
let loading: Promise<AppSettings> | null = null
let writeQueue: Promise<void> = Promise.resolve()

/**
 * 旧的默认游戏目录（启动器数据文件夹里的 .minecraft）：
 * - 已经搬走（或从来没有创建过）：设置里指向它的地方改为新的默认目录
 * - 没能搬走（例如新位置已经有 .minecraft）：继续使用，名字从「默认目录」改为「旧的默认目录」
 */
function withMovedGameDir(saved: Partial<AppSettings>): void {
  const legacy = legacyGameDir()
  const moved = !existsSync(legacy)
  const fix = (path: string): string => (moved && samePath(path, legacy) ? defaultGameDir() : path)
  if (typeof saved.gameDir === 'string') saved.gameDir = fix(saved.gameDir)
  if (Array.isArray(saved.gameDirs)) {
    saved.gameDirs = saved.gameDirs.map((entry) => {
      if (!entry || typeof entry.path !== 'string') return entry
      if (moved) return { ...entry, path: fix(entry.path) }
      return samePath(entry.path, legacy) && entry.name === '默认目录' ? { ...entry, name: '旧的默认目录' } : entry
    })
  }
}

async function load(): Promise<AppSettings> {
  const defaults = defaultSettings()
  try {
    // 手动改坏的设置项丢弃，用默认值
    const saved = checkedSettings(JSON.parse(await readFile(SETTINGS_FILE, 'utf-8')), defaults, true)
    withMovedGameDir(saved)
    // 保存的游戏目录已不存在、而默认目录存在时，改用默认目录。
    // 常见于免安装版：U 盘换了电脑后盘符变化（E: → F:），旧的绝对路径失效
    if (saved.gameDir && !existsSync(saved.gameDir) && existsSync(defaults.gameDir)) {
      saved.gameDir = defaults.gameDir
    }
    // 旧版本在设置中保存过 Client ID，现在改为构建时注入，不再保存
    delete (saved as Record<string, unknown>).msClientId
    // 旧版本只有一张背景：放进背景库，模式设为固定
    if (!Array.isArray(saved.backgroundImages)) {
      saved.backgroundImages = saved.backgroundImage ? [saved.backgroundImage] : []
      if (!saved.backgroundMode) saved.backgroundMode = saved.backgroundImage ? 'fixed' : 'off'
    }
    return withGameDirs(withOfflineAccounts({ ...defaults, ...saved }))
  } catch {
    return withGameDirs(withOfflineAccounts(defaults))
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
  if (patch.gameDir !== undefined || patch.gameDirs !== undefined) cache = withGameDirs(cache)
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
