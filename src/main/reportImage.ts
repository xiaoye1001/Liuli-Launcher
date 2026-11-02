import { app, BrowserWindow, clipboard, dialog, nativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

/** 年度报告等界面生成的图片：保存成文件或复制到剪贴板。只接受 PNG */
const PREFIX = 'data:image/png;base64,'
const MAX_LENGTH = 30 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function decode(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX) || dataUrl.length > MAX_LENGTH) {
    throw new Error('图片无效')
  }
  const buffer = Buffer.from(dataUrl.slice(PREFIX.length), 'base64')
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('图片无效')
  return buffer
}

function defaultDir(): string {
  try {
    return app.getPath('pictures')
  } catch {
    return app.getPath('home')
  }
}

/** 选择位置保存图片，返回保存的路径（取消时返回 null） */
export async function saveReportImage(
  win: BrowserWindow | null,
  dataUrl: unknown,
  name: unknown
): Promise<string | null> {
  const buffer = decode(dataUrl)
  const fileName =
    (typeof name === 'string' ? name : '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 60) || '游玩报告'
  const options: Electron.SaveDialogOptions = {
    title: '保存图片',
    defaultPath: join(defaultDir(), `${fileName.replace(/\.png$/i, '')}.png`),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  const path = /\.png$/i.test(result.filePath) ? result.filePath : `${result.filePath}.png`
  await writeFile(path, buffer)
  return path
}

export function copyReportImage(dataUrl: unknown): void {
  const image = nativeImage.createFromBuffer(decode(dataUrl))
  if (image.isEmpty()) throw new Error('图片无效')
  clipboard.writeImage(image)
}
