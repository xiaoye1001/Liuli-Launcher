import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { copyFile, mkdir, rm, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { getSettings, updateSettings } from './config'
import { screenshotResponse } from './screenshots'
import type { AppSettings } from '../shared/types'

/** 自定义背景图片存放在用户数据目录下 */
const BACKGROUND_DIR = join(app.getPath('userData'), 'backgrounds')
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

// 界面通过 liuli://background/<文件名> 读取背景图片，liuli://screenshot/<版本>/<文件名> 读取游戏截图。
// 自定义协议必须在程序就绪前注册（本模块在 index.ts 中被导入时执行）
protocol.registerSchemesAsPrivileged([{ scheme: 'liuli', privileges: { standard: true, secure: true } }])

/** 程序就绪后调用：只允许读取 backgrounds 文件夹中的文件 */
export function registerBackgroundProtocol(): void {
  protocol.handle('liuli', (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'screenshot') return screenshotResponse(url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.hostname !== 'background' || !name || name !== basename(name)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(BACKGROUND_DIR, name)).toString())
  })
}

/** 背景库最多保存多少张图片、单张最大多少 */
const MAX_BACKGROUNDS = 50
const MAX_IMAGE_BYTES = 30 * 1024 * 1024

/** 添加背景图片（可以一次选多张）：复制到 backgrounds 文件夹，放进背景库 */
export async function addBackgrounds(win: BrowserWindow | null): Promise<AppSettings> {
  const options: Electron.OpenDialogOptions = {
    title: '添加背景图片（可以多选）',
    filters: [{ name: '图片', extensions: IMAGE_EXTENSIONS }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return getSettings()

  const settings = await getSettings()
  const list = [...settings.backgroundImages]
  const room = MAX_BACKGROUNDS - list.length
  if (room <= 0) throw new Error(`背景库最多 ${MAX_BACKGROUNDS} 张，请先删除一些`)
  await mkdir(BACKGROUND_DIR, { recursive: true })
  const added: string[] = []
  const skipped: string[] = []
  for (const [i, source] of result.filePaths.slice(0, room).entries()) {
    const ext = extname(source).toLowerCase().replace('.', '')
    const size = (await stat(source).catch(() => null))?.size ?? 0
    if (!IMAGE_EXTENSIONS.includes(ext) || size === 0 || size > MAX_IMAGE_BYTES) {
      skipped.push(basename(source))
      continue
    }
    // 每张图片用新的文件名，界面不会读到缓存里的旧图片
    const name = `background-${Date.now()}-${i}.${ext}`
    await copyFile(source, join(BACKGROUND_DIR, name))
    added.push(name)
  }
  if (added.length === 0) {
    throw new Error(
      skipped.length ? `这些图片无法使用（格式不支持或超过 30 MB）：${skipped.join('、')}` : '没有添加图片'
    )
  }
  return updateSettings({
    backgroundImages: [...list, ...added],
    // 第一次添加时直接用上
    backgroundImage: settings.backgroundImage || added[0],
    backgroundMode: settings.backgroundMode === 'off' ? 'fixed' : settings.backgroundMode
  })
}

/** 从背景库删除一张图片（同时删除文件） */
export async function removeBackground(name: string): Promise<AppSettings> {
  const settings = await getSettings()
  const file = basename(name)
  if (!settings.backgroundImages.includes(file)) return settings
  const list = settings.backgroundImages.filter((n) => n !== file)
  const next = await updateSettings({
    backgroundImages: list,
    backgroundImage: settings.backgroundImage === file ? (list[0] ?? '') : settings.backgroundImage,
    backgroundMode: list.length === 0 ? 'off' : settings.backgroundMode
  })
  await rm(join(BACKGROUND_DIR, file), { force: true })
  return next
}

/** 选择一张图片作为背景（兼容旧接口：添加后固定使用这一张） */
export async function pickBackground(win: BrowserWindow | null): Promise<AppSettings> {
  const before = (await getSettings()).backgroundImages
  const settings = await addBackgrounds(win)
  const added = settings.backgroundImages.filter((n) => !before.includes(n))
  return added.length ? updateSettings({ backgroundImage: added[0], backgroundMode: 'fixed' }) : settings
}

/** 不使用背景图片（背景库保留） */
export async function clearBackground(): Promise<AppSettings> {
  return updateSettings({ backgroundMode: 'off' })
}
