import { clipboard, nativeImage, net, shell } from 'electron'
import { mkdir, readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { modsContextOf } from './mods'
import { assertSafeId } from './versionManage'
import type { ScreenshotList } from '../shared/types'

const IMAGE = /\.(png|jpe?g)$/i
const THUMB_WIDTH = 384
/** 缩略图缓存：路径 + 修改时间 → JPEG 数据，最多保留 300 张 */
const thumbCache = new Map<string, Buffer>()
const MAX_CACHE = 300

/** 版本的截图文件夹（考虑版本隔离） */
async function dirOf(versionId: string): Promise<string> {
  return join(dirname((await modsContextOf(versionId)).dir), 'screenshots')
}

function assertImageName(fileName: string): void {
  if (!fileName || fileName !== basename(fileName) || !IMAGE.test(fileName))
    throw new Error(`无效的截图文件：${fileName}`)
}

async function pathOf(versionId: string, fileName: string): Promise<string> {
  assertSafeId(versionId)
  assertImageName(fileName)
  return join(await dirOf(versionId), fileName)
}

/** 列出截图（最新的在前） */
export async function listScreenshots(versionId: string): Promise<ScreenshotList> {
  const dir = await dirOf(versionId)
  const items: ScreenshotList['items'] = []
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!IMAGE.test(name)) continue
    const info = await stat(join(dir, name)).catch(() => null)
    if (info?.isFile()) items.push({ fileName: name, size: info.size, time: info.mtimeMs })
  }
  items.sort((a, b) => b.time - a.time)
  return { versionId, dir, items }
}

/**
 * 处理 liuli://screenshot/<版本名>/<文件名> 请求；带 ?thumb=1 时返回缩小的 JPEG（缓存在内存里），
 * 避免截图列表一次加载很多张大图
 */
export async function screenshotResponse(url: URL): Promise<Response> {
  try {
    const [versionId, fileName] = url.pathname.replace(/^\//, '').split('/').map(decodeURIComponent)
    const path = await pathOf(versionId, fileName)
    if (url.searchParams.get('thumb') !== '1') return net.fetch(pathToFileURL(path).toString())
    const info = await stat(path)
    const key = `${path}:${info.mtimeMs}`
    let data = thumbCache.get(key)
    if (!data) {
      const image = nativeImage.createFromPath(path)
      if (image.isEmpty()) return new Response('Not found', { status: 404 })
      const size = image.getSize()
      data = (size.width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH, quality: 'good' }) : image).toJPEG(80)
      if (thumbCache.size >= MAX_CACHE) thumbCache.delete(thumbCache.keys().next().value!)
      thumbCache.set(key, data)
    }
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/jpeg' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

/** 删除截图：移到回收站 */
export async function deleteScreenshot(versionId: string, fileName: string): Promise<void> {
  await shell.trashItem(await pathOf(versionId, fileName))
}

/** 复制图片到剪贴板，可以直接粘贴到聊天软件里 */
export async function copyScreenshot(versionId: string, fileName: string): Promise<void> {
  const image = nativeImage.createFromPath(await pathOf(versionId, fileName))
  if (image.isEmpty()) throw new Error('无法读取这张截图')
  clipboard.writeImage(image)
}

/** 在文件管理器中显示截图 */
export async function showScreenshot(versionId: string, fileName: string): Promise<void> {
  shell.showItemInFolder(await pathOf(versionId, fileName))
}

export async function openScreenshotsDir(versionId: string): Promise<void> {
  const dir = await dirOf(versionId)
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}
