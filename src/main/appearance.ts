import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { copyFile, mkdir, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { getSettings, updateSettings } from './config'
import { screenshotResponse } from './screenshots'
import { musicResponse } from './music'
import type { AppSettings } from '../shared/types'

/** 自定义背景图片存放在用户数据目录下 */
const BACKGROUND_DIR = join(app.getPath('userData'), 'backgrounds')
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
/** 动态视频壁纸（循环静音播放） */
const VIDEO_EXTENSIONS = ['mp4', 'webm']
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]

// 界面通过 liuli://background/<文件名> 读取背景图片，liuli://screenshot/<版本>/<文件名> 读取游戏截图，
// liuli://music/<文件名> 播放背景音乐（stream 让音频可以边读边播、拖动进度）。
// 自定义协议必须在程序就绪前注册（本模块在 index.ts 中被导入时执行）
protocol.registerSchemesAsPrivileged([{ scheme: 'liuli', privileges: { standard: true, secure: true, stream: true } }])

/** 程序就绪后调用：只允许读取 backgrounds 文件夹中的文件 */
export function registerBackgroundProtocol(): void {
  protocol.handle('liuli', (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'screenshot') return screenshotResponse(url)
    if (url.hostname === 'music') return musicResponse(url, request)
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
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

function maxBytesFor(ext: string): number {
  return VIDEO_EXTENSIONS.includes(ext) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

/** 添加背景图片（可以一次选多张）：复制到 backgrounds 文件夹，放进背景库 */
export async function addBackgrounds(win: BrowserWindow | null): Promise<AppSettings> {
  const options: Electron.OpenDialogOptions = {
    title: '添加背景图片或视频（可以多选）',
    filters: [
      { name: '图片或视频', extensions: MEDIA_EXTENSIONS },
      { name: '图片', extensions: IMAGE_EXTENSIONS },
      { name: '视频（MP4 / WebM）', extensions: VIDEO_EXTENSIONS }
    ],
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
    if (!MEDIA_EXTENSIONS.includes(ext) || size === 0 || size > maxBytesFor(ext)) {
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
      skipped.length
        ? `这些文件无法使用（格式不支持，或图片超过 30 MB、视频超过 200 MB）：${skipped.join('、')}`
        : '没有添加图片'
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

// ---------- 从网络添加背景 ----------

/** 根据文件开头的内容判断类型，不相信服务器声明的类型和地址里的扩展名 */
export function detectMediaType(head: Buffer): string | null {
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (head.subarray(0, 6).toString('latin1') === 'GIF87a' || head.subarray(0, 6).toString('latin1') === 'GIF89a')
    return 'gif'
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'webp'
  if (head[0] === 0x42 && head[1] === 0x4d) return 'bmp'
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4'
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm'
  return null
}

/** 下载网络图片（或视频）放进背景库，并设为当前背景 */
export async function addBackgroundFromUrl(text: unknown): Promise<AppSettings> {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入图片地址')
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('图片地址格式不对，需要以 http:// 或 https:// 开头')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('只支持 http:// 或 https:// 开头的图片地址')
  const settings = await getSettings()
  if (settings.backgroundImages.length >= MAX_BACKGROUNDS) {
    throw new Error(`背景库最多 ${MAX_BACKGROUNDS} 张，请先删除一些`)
  }

  const response = await net.fetch(url.href, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error(`无法下载图片（HTTP ${response.status}）`)
  const declared = Number(response.headers.get('content-length')) || 0
  if (declared > MAX_VIDEO_BYTES) throw new Error('文件太大（图片最大 30 MB，视频最大 200 MB）')

  // 边下载边计算大小，超过上限立即停止
  const parts: Buffer[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error('文件太大（图片最大 30 MB，视频最大 200 MB）')
    }
    parts.push(Buffer.from(value))
  }
  const data = Buffer.concat(parts)
  const ext = detectMediaType(data.subarray(0, 16))
  if (!ext) throw new Error('这个地址不是图片或视频（支持 PNG、JPG、WebP、GIF、BMP、MP4、WebM）')
  if (data.length > maxBytesFor(ext)) throw new Error('文件太大（图片最大 30 MB，视频最大 200 MB）')

  await mkdir(BACKGROUND_DIR, { recursive: true })
  const name = `background-${Date.now()}-web.${ext}`
  await writeFile(join(BACKGROUND_DIR, name), data)
  const latest = await getSettings()
  return updateSettings({
    backgroundImages: [...latest.backgroundImages, name],
    backgroundImage: name,
    backgroundMode: 'fixed'
  })
}
