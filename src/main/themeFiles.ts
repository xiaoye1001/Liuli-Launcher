/**
 * 主题导入 / 导出：.liulitheme 文件（JSON）
 * {
 *   "format": "liuli-theme", "version": 1, "name": "主题名称",
 *   "data": { ...ThemeData（不含壁纸文件名）},
 *   "wallpaper": { "ext": "png", "data": "<base64>" } | null
 * }
 * 壁纸不超过 20 MB 时一起打包；导入时按文件头判断类型，不相信文件里声明的扩展名
 */
import { app, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings, updateSettings } from './config'
import { detectMediaType } from './appearance'
import { MAX_CUSTOM_THEMES, sanitizeThemeData, sanitizeThemeName, themeDataFrom, themePatch } from '../shared/theme'
import type { AppSettings, ThemeData } from '../shared/types'

const BACKGROUND_DIR = join(app.getPath('userData'), 'backgrounds')
const FORMAT = 'liuli-theme'
const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024
/** 主题文件最大大小（壁纸 base64 后约大 1/3） */
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_BACKGROUNDS = 50

export interface ThemeExportResult {
  path: string
  /** 壁纸太大或是视频时没有打包，界面上提示 */
  wallpaperSkipped: boolean
}

function safeFileName(name: string): string {
  return name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim() || '主题'
}

/** 导出主题：themeId 为空时导出当前外观 */
export async function exportTheme(win: BrowserWindow | null, themeId?: string): Promise<ThemeExportResult | null> {
  const settings = await getSettings()
  const custom = themeId ? settings.customThemes.find((t) => t.id === themeId) : undefined
  if (themeId && !custom) throw new Error('找不到这个主题')
  const data: ThemeData = custom ? custom.data : themeDataFrom(settings)
  const name = custom ? custom.name : '我的主题'

  // 只有固定壁纸才打包（随机、轮播模式使用整个背景库）
  let wallpaper: { ext: string; data: string } | null = null
  let wallpaperSkipped = false
  if (
    data.backgroundMode === 'fixed' &&
    data.backgroundImage &&
    settings.backgroundImages.includes(data.backgroundImage)
  ) {
    const path = join(BACKGROUND_DIR, data.backgroundImage)
    const size = (await stat(path).catch(() => null))?.size ?? 0
    if (size > 0 && size <= MAX_WALLPAPER_BYTES) {
      const bytes = await readFile(path)
      const ext = detectMediaType(bytes.subarray(0, 16))
      if (ext) wallpaper = { ext, data: bytes.toString('base64') }
      else wallpaperSkipped = true
    } else {
      wallpaperSkipped = true
    }
  }

  const options: Electron.SaveDialogOptions = {
    title: '导出主题',
    defaultPath: join(app.getPath('documents'), `${safeFileName(name)}.liulitheme`),
    filters: [{ name: '琉璃启动器主题', extensions: ['liulitheme'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  const { backgroundImage: _omit, ...rest } = data
  const file = { format: FORMAT, version: 1, name, data: rest, wallpaper }
  await writeFile(result.filePath, JSON.stringify(file))
  return { path: result.filePath, wallpaperSkipped }
}

export interface ThemeImportResult {
  settings: AppSettings
  themeId: string
  name: string
}

/** 导入主题：保存到「我的主题」并立即应用 */
export async function importTheme(win: BrowserWindow | null): Promise<ThemeImportResult | null> {
  const options: Electron.OpenDialogOptions = {
    title: '导入主题',
    filters: [{ name: '琉璃启动器主题', extensions: ['liulitheme', 'json'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  const size = (await stat(path)).size
  if (size > MAX_FILE_BYTES) throw new Error('主题文件太大')

  let file: Record<string, unknown>
  try {
    file = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    throw new Error('无法读取主题文件，文件可能已损坏')
  }
  if (!file || file.format !== FORMAT) throw new Error('这不是琉璃启动器的主题文件')

  const settings = await getSettings()
  if (settings.customThemes.length >= MAX_CUSTOM_THEMES) {
    throw new Error(`「我的主题」最多 ${MAX_CUSTOM_THEMES} 个，请先删除一些`)
  }
  // 主题文件不带音乐，导入后播放全部音乐
  const data = sanitizeThemeData({ ...(file.data as object), backgroundImage: '', music: '' })
  let library = settings.backgroundImages

  // 壁纸：校验大小与类型后放进背景库
  const wallpaper = file.wallpaper as { data?: unknown } | null | undefined
  if (wallpaper && typeof wallpaper.data === 'string') {
    const bytes = Buffer.from(wallpaper.data, 'base64')
    const ext = detectMediaType(bytes.subarray(0, 16))
    if (ext && bytes.length > 0 && bytes.length <= MAX_WALLPAPER_BYTES && library.length < MAX_BACKGROUNDS) {
      await mkdir(BACKGROUND_DIR, { recursive: true })
      const name = `background-${Date.now()}-theme.${ext}`
      await writeFile(join(BACKGROUND_DIR, name), bytes)
      library = [...library, name]
      data.backgroundImage = name
      data.backgroundMode = 'fixed'
    }
  }

  // 没有可用的壁纸时，主题里也不记录「固定壁纸」
  if (data.backgroundMode === 'fixed' && !data.backgroundImage) data.backgroundMode = 'off'

  const id = randomUUID()
  const name = sanitizeThemeName(file.name)
  const next = await updateSettings({
    backgroundImages: library,
    customThemes: [...settings.customThemes, { id, name, createdAt: Date.now(), data }],
    ...themePatch(data, library)
  })
  return { settings: next, themeId: id, name }
}
