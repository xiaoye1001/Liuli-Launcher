import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { copyFile, mkdir, rm } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { getSettings, updateSettings } from './config'
import type { AppSettings } from '../shared/types'

/** 自定义背景图片存放在用户数据目录下 */
const BACKGROUND_DIR = join(app.getPath('userData'), 'backgrounds')
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

// 界面通过 liuli://background/<文件名> 读取背景图片。
// 自定义协议必须在程序就绪前注册（本模块在 index.ts 中被导入时执行）
protocol.registerSchemesAsPrivileged([{ scheme: 'liuli', privileges: { standard: true, secure: true } }])

/** 程序就绪后调用：只允许读取 backgrounds 文件夹中的文件 */
export function registerBackgroundProtocol(): void {
  protocol.handle('liuli', (request) => {
    const url = new URL(request.url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.hostname !== 'background' || !name || name !== basename(name)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(BACKGROUND_DIR, name)).toString())
  })
}

/** 选择一张图片作为背景：复制到 backgrounds 文件夹并删除旧图片 */
export async function pickBackground(win: BrowserWindow | null): Promise<AppSettings> {
  const options: Electron.OpenDialogOptions = {
    title: '选择背景图片',
    filters: [{ name: '图片', extensions: IMAGE_EXTENSIONS }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const source = result.filePaths[0]
  if (result.canceled || !source) return getSettings()

  const ext = extname(source).toLowerCase().replace('.', '')
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error('不支持的图片格式')
  // 每次使用新文件名，界面不会读到浏览器缓存里的旧图片
  const name = `background-${Date.now()}.${ext}`
  await mkdir(BACKGROUND_DIR, { recursive: true })
  await copyFile(source, join(BACKGROUND_DIR, name))

  const old = (await getSettings()).backgroundImage
  const settings = await updateSettings({ backgroundImage: name })
  if (old && old !== name) await rm(join(BACKGROUND_DIR, basename(old)), { force: true })
  return settings
}

/** 恢复默认背景 */
export async function clearBackground(): Promise<AppSettings> {
  const old = (await getSettings()).backgroundImage
  const settings = await updateSettings({ backgroundImage: '' })
  if (old) await rm(join(BACKGROUND_DIR, basename(old)), { force: true })
  return settings
}
