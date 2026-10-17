import { BrowserWindow, dialog, shell } from 'electron'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { getGameStatus } from './launch'
import { modsContextOf } from './mods'
import { parseNbt, type NbtCompound } from './nbt'
import { readPackMeta } from './resources'
import { zipDirectory } from './zipWriter'
import type { WorldDatapack, WorldGameMode, WorldInfo, WorldList } from '../shared/types'

const GAME_MODES: WorldGameMode[] = ['survival', 'creative', 'adventure', 'spectator']
const MAX_ICON_BYTES = 256 * 1024

/** 版本使用的游戏目录（考虑版本隔离） */
async function gameDirOf(versionId: string): Promise<string> {
  return dirname((await modsContextOf(versionId)).dir)
}

function assertGameStopped(versionId: string): void {
  const game = getGameStatus()
  if ((game.state === 'launching' || game.state === 'running') && game.versionId === versionId) {
    throw new Error('游戏正在运行，请退出游戏后再操作存档')
  }
}

/** 存档文件夹名、数据包文件名只能是普通名字，防止通过 ../ 访问其他文件 */
function assertSafeName(name: string, what: string): void {
  if (!name || name !== basename(name) || name === '.' || name === '..') throw new Error(`无效的${what}：${name}`)
}

async function worldDir(versionId: string, folder: string): Promise<string> {
  assertSafeName(folder, '存档名')
  const dir = join(await gameDirOf(versionId), 'saves', folder)
  if (!(await stat(join(dir, 'level.dat')).catch(() => null))) throw new Error(`找不到存档：${folder}`)
  return dir
}

async function readLevel(dir: string): Promise<NbtCompound | null> {
  try {
    const root = parseNbt(await readFile(join(dir, 'level.dat')))
    const data = root.Data
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as NbtCompound) : null
  } catch {
    return null
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 列出版本的所有存档（按最后游玩时间排序） */
export async function listWorldInfos(versionId: string): Promise<WorldList> {
  const dir = join(await gameDirOf(versionId), 'saves')
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const worlds: WorldInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    const levelStat = await stat(join(path, 'level.dat')).catch(() => null)
    if (!levelStat) continue
    const data = await readLevel(path)
    const version = data?.Version as NbtCompound | undefined
    const gameType = typeof data?.GameType === 'number' ? data.GameType : -1
    let icon: string | undefined
    const iconData = await readFile(join(path, 'icon.png')).catch(() => null)
    if (iconData && iconData.length <= MAX_ICON_BYTES) icon = `data:image/png;base64,${iconData.toString('base64')}`
    worlds.push({
      folder: entry.name,
      name: str(data?.LevelName) || entry.name,
      gameMode: GAME_MODES[gameType] ?? 'unknown',
      hardcore: data?.hardcore === 1,
      cheats: data?.allowCommands === 1,
      version: str(version?.Name),
      // 旧存档没有 LastPlayed 时用 level.dat 的修改时间
      lastPlayed: typeof data?.LastPlayed === 'number' && data.LastPlayed > 0 ? data.LastPlayed : levelStat.mtimeMs,
      icon,
      damaged: !data
    })
  }
  worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
  return { versionId, dir, worlds }
}

/** 删除存档：移到系统回收站 */
export async function deleteWorld(versionId: string, folder: string): Promise<void> {
  assertGameStopped(versionId)
  await shell.trashItem(await worldDir(versionId, folder))
}

function timestamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/** 备份存档：打包成 zip 放在游戏目录的 backups 文件夹，返回 zip 路径与大小 */
export async function backupWorld(versionId: string, folder: string): Promise<{ path: string; size: number }> {
  assertGameStopped(versionId)
  const dir = await worldDir(versionId, folder)
  const backups = join(await gameDirOf(versionId), 'backups')
  await mkdir(backups, { recursive: true })
  const path = join(backups, `${folder}_${timestamp()}.zip`)
  // session.lock 是游戏运行时的锁文件，不需要备份
  const { size } = await zipDirectory(dir, path, folder, (rel) => rel === 'session.lock')
  return { path, size }
}

/** 打开存档文件夹（folder 为空时打开 saves） */
export async function openWorldDir(versionId: string, folder?: string): Promise<void> {
  const dir = folder ? await worldDir(versionId, folder) : join(await gameDirOf(versionId), 'saves')
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

export async function openBackupsDir(versionId: string): Promise<void> {
  const dir = join(await gameDirOf(versionId), 'backups')
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

/** zip 里的路径必须在存档文件夹内部 */
function safeJoin(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-zA-Z]:/.test(path) ||
    path.split(/[\\/]/).includes('..') ||
    rel.startsWith('..')
  ) {
    throw new Error(`存档压缩包中包含不安全的文件路径：${path}`)
  }
  return target
}

/** 不能用作文件夹名的字符换成下划线 */
function folderName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  return clean && clean !== '.' && clean !== '..' ? clean.slice(0, 80) : 'world'
}

/** 从 zip 导入存档（zip 里可以直接是存档内容，也可以多一层文件夹），返回导入后的文件夹名 */
export async function importWorld(versionId: string, win: BrowserWindow | null): Promise<string | null> {
  assertGameStopped(versionId)
  const options: Electron.OpenDialogOptions = {
    title: `导入存档到 ${versionId}`,
    filters: [{ name: '存档压缩包', extensions: ['zip'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return importWorldFile(versionId, result.filePaths[0])
}

export async function importWorldFile(versionId: string, file: string): Promise<string> {
  assertGameStopped(versionId)
  const zip = await open(file).catch(() => {
    throw new Error('无法打开压缩包，请确认是 zip 格式的存档')
  })
  try {
    const entries = await readAllEntries(zip).catch((e: Error) => {
      // 解压库会拒绝 ../ 之类的路径，这里换成中文提示
      if (/invalid (relative )?path|absolute path/i.test(e.message)) {
        throw new Error('存档压缩包中包含不安全的文件路径，已拒绝导入')
      }
      throw e
    })
    // 找到最浅的 level.dat，它所在的文件夹就是存档根目录
    const level = entries
      .filter((e) => e.fileName === 'level.dat' || e.fileName.endsWith('/level.dat'))
      .sort((a, b) => a.fileName.split('/').length - b.fileName.split('/').length)[0]
    if (!level) throw new Error('压缩包里没有找到存档（缺少 level.dat）')
    const prefix = level.fileName.slice(0, -'level.dat'.length)
    const saves = join(await gameDirOf(versionId), 'saves')
    const base = folderName(prefix ? basename(prefix.replace(/\/$/, '')) : basename(file).replace(/\.zip$/i, ''))
    let folder = base
    for (let i = 2; await stat(join(saves, folder)).catch(() => null); i++) folder = `${base} (${i})`
    const target = join(saves, folder)

    // 先检查所有路径，避免解压到一半才发现不安全的文件
    const files = entries.filter((e) => e.fileName.startsWith(prefix) && !e.fileName.endsWith('/'))
    const targets = files.map((e) => safeJoin(target, e.fileName.slice(prefix.length)))
    await mkdir(target, { recursive: true })
    try {
      for (let i = 0; i < files.length; i++) {
        await mkdir(dirname(targets[i]), { recursive: true })
        await writeFile(targets[i], await readEntry(zip, files[i]))
      }
    } catch (e) {
      await rm(target, { recursive: true, force: true })
      throw e
    }
    return folder
  } finally {
    zip.close()
  }
}

// ---------- 数据包 ----------

/** 列出存档中的数据包，并根据 level.dat 中的 DataPacks 判断启用状态 */
export async function listWorldDatapacks(versionId: string, folder: string): Promise<WorldDatapack[]> {
  const dir = await worldDir(versionId, folder)
  const packsDir = join(dir, 'datapacks')
  const data = await readLevel(dir)
  const packs = (data?.DataPacks ?? {}) as NbtCompound
  const enabled = Array.isArray(packs.Enabled) ? (packs.Enabled as unknown[]) : []
  const disabled = Array.isArray(packs.Disabled) ? (packs.Disabled as unknown[]) : []
  const result: WorldDatapack[] = []
  for (const entry of await readdir(packsDir, { withFileTypes: true }).catch(() => [])) {
    const isDirectory = entry.isDirectory()
    if (!isDirectory && !(entry.isFile() && entry.name.toLowerCase().endsWith('.zip'))) continue
    const path = join(packsDir, entry.name)
    const id = `file/${entry.name}`
    result.push({
      fileName: entry.name,
      isDirectory,
      size: isDirectory ? 0 : (await stat(path)).size,
      description: (await readPackMeta(path)).description,
      state: disabled.includes(id) ? 'disabled' : enabled.includes(id) ? 'enabled' : 'new'
    })
  }
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'))
}

export async function deleteWorldDatapack(versionId: string, folder: string, fileName: string): Promise<void> {
  assertGameStopped(versionId)
  assertSafeName(fileName, '数据包')
  await shell.trashItem(join(await worldDir(versionId, folder), 'datapacks', fileName))
}

export async function addWorldDatapacks(versionId: string, folder: string, win: BrowserWindow | null): Promise<number> {
  assertGameStopped(versionId)
  const dir = join(await worldDir(versionId, folder), 'datapacks')
  const options: Electron.OpenDialogOptions = {
    title: `添加数据包到存档「${folder}」`,
    filters: [{ name: '数据包', extensions: ['zip'] }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return 0
  await mkdir(dir, { recursive: true })
  for (const file of result.filePaths) await copyFile(file, join(dir, basename(file)))
  return result.filePaths.length
}

export async function openWorldDatapacksDir(versionId: string, folder: string): Promise<void> {
  const dir = join(await worldDir(versionId, folder), 'datapacks')
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}
