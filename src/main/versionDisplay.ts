import { BrowserWindow, dialog, nativeImage } from 'electron'
import { readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings } from './config'
import { assertSafeId } from './versionManage'
import type { VersionDisplay } from '../shared/types'

/** 版本的收藏与图标，保存在 versions/<版本名>/liuli-display.json（不算作版本设置） */
const DISPLAY_FILE = 'liuli-display.json'
/** 自定义图标图片 */
const ICON_FILE = 'liuli-icon.png'
const ICON_SIZE = 64
/** 选择的图片最大多大 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
/** 内置图标的名字（与界面上的图标对应） */
const PRESET_PATTERN = /^[a-z]{1,24}$/

function versionDir(gameDir: string, versionId: string): string {
  assertSafeId(versionId)
  return join(gameDir, 'versions', versionId)
}

async function readRaw(dir: string): Promise<{ favorite?: unknown; icon?: unknown }> {
  try {
    const raw = JSON.parse(await readFile(join(dir, DISPLAY_FILE), 'utf-8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** 读取版本的收藏与图标 */
export async function readVersionDisplay(gameDir: string, versionId: string): Promise<VersionDisplay> {
  const dir = versionDir(gameDir, versionId)
  const raw = await readRaw(dir)
  const result: VersionDisplay = { favorite: raw.favorite === true }
  if (raw.icon === 'custom') {
    const data = await readFile(join(dir, ICON_FILE)).catch(() => null)
    // 图标文件被删掉时用默认图标
    if (data && data.byteLength < 1024 * 1024) {
      result.icon = 'custom'
      result.iconUrl = `data:image/png;base64,${data.toString('base64')}`
    }
  } else if (typeof raw.icon === 'string' && PRESET_PATTERN.test(raw.icon)) {
    result.icon = raw.icon
  }
  return result
}

async function writeDisplay(dir: string, patch: { favorite?: boolean; icon?: string | null }): Promise<void> {
  if (!(await stat(dir).catch(() => null))?.isDirectory()) throw new Error('找不到这个版本')
  const raw = await readRaw(dir)
  const next: { favorite?: boolean; icon?: string } = {}
  const favorite = patch.favorite ?? raw.favorite === true
  if (favorite) next.favorite = true
  const icon = patch.icon === undefined ? raw.icon : patch.icon
  if (typeof icon === 'string' && (icon === 'custom' || PRESET_PATTERN.test(icon))) next.icon = icon
  const path = join(dir, DISPLAY_FILE)
  if (Object.keys(next).length === 0) {
    await rm(path, { force: true })
    return
  }
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
  await rename(tmp, path)
}

/** 收藏或取消收藏版本 */
export async function setVersionFavorite(versionId: string, favorite: boolean): Promise<VersionDisplay> {
  const { gameDir } = await getSettings()
  await writeDisplay(versionDir(gameDir, versionId), { favorite })
  return readVersionDisplay(gameDir, versionId)
}

/** 使用内置图标；icon 为 null 时恢复默认图标 */
export async function setVersionIcon(versionId: string, icon: string | null): Promise<VersionDisplay> {
  if (icon !== null && !PRESET_PATTERN.test(icon)) throw new Error('无效的图标')
  const { gameDir } = await getSettings()
  const dir = versionDir(gameDir, versionId)
  await writeDisplay(dir, { icon })
  await rm(join(dir, ICON_FILE), { force: true })
  return readVersionDisplay(gameDir, versionId)
}

/** 选择一张图片作为版本图标：裁成正方形、缩小到 64×64 后保存为 PNG。取消时返回 null */
export async function pickVersionIcon(versionId: string, win: BrowserWindow | null): Promise<VersionDisplay | null> {
  const { gameDir } = await getSettings()
  const dir = versionDir(gameDir, versionId)
  const options: Electron.OpenDialogOptions = {
    title: `选择 ${versionId} 的图标`,
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  if (((await stat(path).catch(() => null))?.size ?? 0) > MAX_IMAGE_BYTES) throw new Error('图片太大（超过 20 MB）')
  let image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('无法读取这张图片，请换一张 PNG 或 JPG 图片')
  // 居中裁成正方形
  const { width, height } = image.getSize()
  const side = Math.min(width, height)
  if (width !== height) {
    image = image.crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side,
      height: side
    })
  }
  // 小图（像素风图标）放大时保持清晰，大图缩小时平滑
  if (side !== ICON_SIZE) {
    image = image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: side < ICON_SIZE ? 'good' : 'best' })
  }
  const tmp = join(dir, `${ICON_FILE}.tmp`)
  await writeFile(tmp, image.toPNG())
  await rename(tmp, join(dir, ICON_FILE))
  await writeDisplay(dir, { icon: 'custom' })
  return readVersionDisplay(gameDir, versionId)
}
