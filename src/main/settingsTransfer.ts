/**
 * 启动器设置导出 / 导入：.liulisettings 文件（JSON），换电脑或重装后一键恢复
 * {
 *   "format": "liuli-settings", "version": 1, "exportedAt": 时间, "launcherVersion": "0.8.1",
 *   "settings": { ...设置项 }, "servers": [...], "seeds": [...], "collections": [...], "skins": [...]
 * }
 * 不包含：账号和皮肤站登录、各种密钥和密码、代理地址（可能带密码）、AI 和网盘设置、
 * 只在这台电脑上有意义的路径（游戏目录、Java、备份位置、壁纸和音乐文件）。
 * 导入时每一项都重新检查，和在界面上修改设置走同一套检查
 */
import { app, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings, isManagedSetting } from './config'
import { listServers, saveServer } from './servers'
import { addSeedFavorite, listSeedFavorites } from './seedFavorites'
import { importModCollections, listModCollections } from './modCollections'
import { addToWardrobe, listWardrobe } from './skinWardrobe'
import { MAX_CUSTOM_THEMES, sanitizeCustomThemes } from '../shared/theme'
import type { AppSettings, SettingsImportPreview, SettingsImportResult, SettingsTransferPart } from '../shared/types'

const FORMAT = 'liuli-settings'
const MAX_FILE_BYTES = 20 * 1024 * 1024

/** 不导出的设置项（除了专门接口管理的那些） */
const EXCLUDED = new Set<string>([
  // 只在这台电脑上有意义
  'javaPath',
  'selectedVersion',
  'backgroundImage',
  'backgroundMode',
  'themeMusic',
  'skippedVersion',
  // 账号和皮肤（跟着账号走）
  'offlineName',
  'skinDataUrl',
  'skinModel',
  // 代理地址里可能有用户名和密码
  'proxyMode',
  'proxyUrl'
])

function exportable(key: string): boolean {
  return !EXCLUDED.has(key) && !isManagedSetting(key)
}

/** 我的主题里的壁纸、音乐是这台电脑上的文件，导出时去掉 */
function portableThemes(settings: AppSettings): AppSettings['customThemes'] {
  return settings.customThemes.map((t) => ({
    ...t,
    data: {
      ...t.data,
      backgroundImage: '',
      music: '',
      backgroundMode: t.data.backgroundMode === 'fixed' ? 'off' : t.data.backgroundMode
    }
  }))
}

export async function exportLauncherSettings(
  win: BrowserWindow | null
): Promise<{ path: string; counts: Record<SettingsTransferPart, number> } | null> {
  const settings = await getSettings()
  const picked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) if (exportable(key)) picked[key] = value
  picked.customThemes = portableThemes(settings)
  const servers = (await listServers()).map(({ name, address, versionId, watch }) => ({
    name,
    address,
    versionId,
    watch
  }))
  const seeds = (await listSeedFavorites()).map(({ seed, name, note, version }) => ({ seed, name, note, version }))
  const collections = (await listModCollections()).map(({ name, createdAt, minecraftVersion, loader, mods }) => ({
    name,
    createdAt,
    minecraftVersion,
    loader,
    mods
  }))
  const skins = (await listWardrobe()).map(({ name, model, image }) => ({ name, model, image }))

  const options: Electron.SaveDialogOptions = {
    title: '导出启动器设置',
    defaultPath: join(
      app.getPath('documents'),
      `琉璃启动器设置-${new Date().toISOString().slice(0, 10)}.liulisettings`
    ),
    filters: [{ name: '琉璃启动器设置', extensions: ['liulisettings'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  const file = {
    format: FORMAT,
    version: 1,
    exportedAt: Date.now(),
    launcherVersion: __APP_VERSION__,
    settings: picked,
    servers,
    seeds,
    collections,
    skins
  }
  await writeFile(result.filePath, JSON.stringify(file, null, 1), 'utf-8')
  return {
    path: result.filePath,
    counts: {
      settings: Object.keys(picked).length,
      themes: settings.customThemes.length,
      servers: servers.length,
      seeds: seeds.length,
      collections: collections.length,
      skins: skins.length
    }
  }
}

interface ParsedFile {
  settings: Record<string, unknown>
  servers: unknown[]
  seeds: unknown[]
  collections: unknown[]
  skins: unknown[]
}

/** 读好、还没导入的文件（一次只有一个） */
let pending: { token: string; file: ParsedFile } | null = null

const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : [])

/** 选择设置文件，读出里面有什么（还不导入） */
export async function readSettingsFile(win: BrowserWindow | null): Promise<SettingsImportPreview | null> {
  const options: Electron.OpenDialogOptions = {
    title: '导入启动器设置',
    filters: [{ name: '琉璃启动器设置', extensions: ['liulisettings', 'json'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return previewSettingsFile(result.filePaths[0])
}

export async function previewSettingsFile(path: string): Promise<SettingsImportPreview> {
  if ((await stat(path)).size > MAX_FILE_BYTES) throw new Error('设置文件太大')
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>
  } catch {
    throw new Error('无法读取设置文件，文件可能已损坏')
  }
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) throw new Error('这不是琉璃启动器的设置文件')
  if (Number(raw.version) > 1) throw new Error('这个设置文件来自更新的启动器，请先更新启动器')
  const settings: Record<string, unknown> = {}
  if (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) {
    // 只留下可以导入的设置项（文件被改过时也不会碰账号、路径和密钥）
    for (const [key, value] of Object.entries(raw.settings as Record<string, unknown>)) {
      if (exportable(key)) settings[key] = value
    }
  }
  const file: ParsedFile = {
    settings,
    servers: list(raw.servers, 200),
    seeds: list(raw.seeds, 200),
    collections: list(raw.collections, 50),
    skins: list(raw.skins, 60)
  }
  const token = randomUUID()
  pending = { token, file }
  const themes = Array.isArray(settings.customThemes) ? sanitizeCustomThemes(settings.customThemes).length : 0
  return {
    token,
    exportedAt: Number(raw.exportedAt) || 0,
    launcherVersion: typeof raw.launcherVersion === 'string' ? raw.launcherVersion.slice(0, 20) : '',
    counts: {
      settings: Object.keys(settings).filter((k) => k !== 'customThemes').length,
      themes,
      servers: file.servers.length,
      seeds: file.seeds.length,
      collections: file.collections.length,
      skins: file.skins.length
    }
  }
}

/**
 * 导入选中的部分。设置交给 applySettings（和界面修改设置同一套检查）；
 * 我的主题、服务器、种子、合集、皮肤都是合并：已经有的跳过，不会删除现有的
 */
export async function applySettingsImport(
  token: unknown,
  parts: unknown,
  applySettings: (patch: Record<string, unknown>) => Promise<AppSettings>
): Promise<SettingsImportResult> {
  if (!pending || pending.token !== token) throw new Error('请重新选择设置文件')
  const file = pending.file
  pending = null
  const wanted = new Set(Array.isArray(parts) ? parts.filter((p): p is string => typeof p === 'string') : [])
  const result: SettingsImportResult = { added: {}, skipped: {} }
  const count = (part: SettingsTransferPart, added: number, skipped: number): void => {
    result.added[part] = added
    result.skipped[part] = skipped
  }

  const patch: Record<string, unknown> = {}
  if (wanted.has('settings')) {
    for (const [key, value] of Object.entries(file.settings)) if (key !== 'customThemes') patch[key] = value
  }
  if (wanted.has('themes') && Array.isArray(file.settings.customThemes)) {
    const current = (await getSettings()).customThemes
    const incoming = sanitizeCustomThemes(file.settings.customThemes)
    const fresh = incoming.filter((t) => !current.some((c) => c.id === t.id))
    const room = Math.max(0, MAX_CUSTOM_THEMES - current.length)
    patch.customThemes = [...current, ...fresh.slice(0, room)]
    count('themes', Math.min(fresh.length, room), incoming.length - Math.min(fresh.length, room))
  }
  if (Object.keys(patch).length > 0) {
    const before = await getSettings()
    const after = await applySettings(patch)
    if (wanted.has('settings')) {
      const keys = Object.keys(patch).filter((k) => k !== 'customThemes')
      const changed = keys.filter(
        (k) =>
          JSON.stringify((after as unknown as Record<string, unknown>)[k]) !==
          JSON.stringify((before as unknown as Record<string, unknown>)[k])
      ).length
      count('settings', changed, keys.length - changed)
    }
  }

  if (wanted.has('servers')) {
    let added = 0
    let skipped = 0
    for (const item of file.servers) {
      const s = (item ?? {}) as Record<string, unknown>
      const address = typeof s.address === 'string' ? s.address.trim() : ''
      if (!address || (await listServers()).some((e) => e.address.toLowerCase() === address.toLowerCase())) {
        skipped++
        continue
      }
      try {
        await saveServer({
          name: typeof s.name === 'string' ? s.name.slice(0, 64) : '',
          address,
          versionId: typeof s.versionId === 'string' ? s.versionId.slice(0, 128) : '',
          watch: s.watch === true
        })
        added++
      } catch {
        skipped++
      }
    }
    count('servers', added, skipped)
  }

  if (wanted.has('seeds')) {
    let added = 0
    let skipped = 0
    for (const item of file.seeds) {
      const s = (item ?? {}) as Record<string, unknown>
      try {
        await addSeedFavorite({
          seed: typeof s.seed === 'string' ? s.seed : '',
          name: typeof s.name === 'string' ? s.name : '',
          note: typeof s.note === 'string' ? s.note : '',
          version: typeof s.version === 'string' ? s.version : ''
        })
        added++
      } catch {
        skipped++
      }
    }
    count('seeds', added, skipped)
  }

  if (wanted.has('collections')) {
    const r = await importModCollections(file.collections)
    count('collections', r.added, r.skipped + Math.max(0, file.collections.length - r.added - r.skipped))
  }

  if (wanted.has('skins')) {
    let added = 0
    let skipped = 0
    for (const item of file.skins) {
      const s = (item ?? {}) as Record<string, unknown>
      try {
        await addToWardrobe(s.image, s.name, s.model)
        added++
      } catch {
        skipped++
      }
    }
    count('skins', added, skipped)
  }
  return result
}
