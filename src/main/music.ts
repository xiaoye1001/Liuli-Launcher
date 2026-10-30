import { app, BrowserWindow, dialog, net, shell } from 'electron'
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'

/** 背景音乐存放在用户数据目录下的 music 文件夹，也可以直接把文件放进去 */
export const MUSIC_DIR = join(app.getPath('userData'), 'music')
const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm']
const MAX_TRACKS = 500
const MAX_TRACK_BYTES = 200 * 1024 * 1024

function isAudio(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(name).toLowerCase().replace('.', ''))
}

/** 文件名必须是 music 文件夹里的音频文件（不能带路径） */
function safeName(name: unknown): string | null {
  if (typeof name !== 'string' || !name || name !== basename(name) || !isAudio(name)) return null
  return name
}

/** 音乐列表（按文件名排序） */
export async function listMusic(): Promise<string[]> {
  const entries = await readdir(MUSIC_DIR, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((e) => e.isFile() && isAudio(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .slice(0, MAX_TRACKS)
}

/** 同名时在后面加上 (2)、(3)… */
function uniqueName(name: string, taken: Set<string>): string {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = name
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`
  return candidate
}

/** 添加音乐（可以多选）：复制到 music 文件夹 */
export async function addMusic(win: BrowserWindow | null): Promise<string[]> {
  const options: Electron.OpenDialogOptions = {
    title: '添加背景音乐（可以多选）',
    filters: [{ name: '音频', extensions: AUDIO_EXTENSIONS }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return listMusic()

  const existing = await listMusic()
  const room = MAX_TRACKS - existing.length
  if (room <= 0) throw new Error(`最多 ${MAX_TRACKS} 首音乐，请先删除一些`)
  await mkdir(MUSIC_DIR, { recursive: true })
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  let added = 0
  const skipped: string[] = []
  for (const source of result.filePaths.slice(0, room)) {
    const size = (await stat(source).catch(() => null))?.size ?? 0
    if (!isAudio(source) || size === 0 || size > MAX_TRACK_BYTES) {
      skipped.push(basename(source))
      continue
    }
    const name = uniqueName(basename(source), taken)
    await copyFile(source, join(MUSIC_DIR, name))
    taken.add(name.toLowerCase())
    added++
  }
  if (added === 0) {
    throw new Error(
      skipped.length ? `这些文件无法使用（格式不支持或超过 200 MB）：${skipped.join('、')}` : '没有添加音乐'
    )
  }
  return listMusic()
}

/** 删除一首音乐（删除文件） */
export async function removeMusic(name: unknown): Promise<string[]> {
  const file = safeName(name)
  if (file) {
    // 移到回收站（音乐文件夹里可能是唯一的一份），回收站不可用时才直接删除
    const path = join(MUSIC_DIR, file)
    await shell.trashItem(path).catch(() => rm(path, { force: true }))
  }
  return listMusic()
}

/** 在文件管理器中打开音乐文件夹 */
export async function openMusicDir(): Promise<void> {
  await mkdir(MUSIC_DIR, { recursive: true })
  const error = await shell.openPath(MUSIC_DIR)
  if (error) throw new Error(error)
}

/** liuli://music/<文件名>：只允许读取 music 文件夹里的音频文件 */
export function musicResponse(url: URL, request: Request): Promise<Response> | Response {
  const name = safeName(decodeURIComponent(url.pathname.replace(/^\//, '')))
  if (!name) return new Response('Not found', { status: 404 })
  // 转发 Range 请求头，播放器才能拖动进度、单曲循环
  return net.fetch(pathToFileURL(join(MUSIC_DIR, name)).toString(), { headers: request.headers })
}
