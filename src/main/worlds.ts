import { BrowserWindow, dialog, shell } from 'electron'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { randomUUID } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { getGameStatus } from './launch'
import { modsContextOf } from './mods'
import { parseNbt, type NbtCompound } from './nbt'
import { readPackMeta } from './resources'
import { zipDirectory } from './zipWriter'
import type { WorldBackup, WorldDatapack, WorldGameMode, WorldInfo, WorldList } from '../shared/types'

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
  const stamp = timestamp()
  let path = join(backups, `${folder}_${stamp}.zip`)
  // 同一秒内备份两次时加上序号，避免覆盖
  for (let i = 2; await stat(path).catch(() => null); i++) path = join(backups, `${folder}_${stamp} (${i}).zip`)
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

/**
 * 打开存档压缩包，找到存档根目录（最浅的 level.dat 所在的文件夹），交给 fn 处理。
 * extract 会先检查所有路径再解压，失败时删除解压了一半的文件夹。
 */
async function withWorldZip<T>(
  file: string,
  fn: (zip: { prefix: string; extract: (target: string) => Promise<void> }) => Promise<T>
): Promise<T> {
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
    const level = entries
      .filter((e) => e.fileName === 'level.dat' || e.fileName.endsWith('/level.dat'))
      .sort((a, b) => a.fileName.split('/').length - b.fileName.split('/').length)[0]
    if (!level) throw new Error('压缩包里没有找到存档（缺少 level.dat）')
    const prefix = level.fileName.slice(0, -'level.dat'.length)
    const extract = async (target: string): Promise<void> => {
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
    }
    return await fn({ prefix, extract })
  } finally {
    zip.close()
  }
}

export async function importWorldFile(versionId: string, file: string): Promise<string> {
  assertGameStopped(versionId)
  return withWorldZip(file, async ({ prefix, extract }) => {
    const saves = join(await gameDirOf(versionId), 'saves')
    const base = folderName(prefix ? basename(prefix.replace(/\/$/, '')) : basename(file).replace(/\.zip$/i, ''))
    let folder = base
    for (let i = 2; await stat(join(saves, folder)).catch(() => null); i++) folder = `${base} (${i})`
    await extract(join(saves, folder))
    return folder
  })
}

// ---------- 备份还原 ----------

/** 备份文件名：<存档文件夹>_<年-月-日_时-分-秒>[ (序号)].zip */
const BACKUP_NAME = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?: \(\d+\))?\.zip$/i

function parseBackupName(file: string): { world: string; createdAt: number } | null {
  const m = BACKUP_NAME.exec(file)
  if (!m) return null
  const [, world, y, mo, d, h, mi, sec] = m
  return { world, createdAt: new Date(+y, +mo - 1, +d, +h, +mi, +sec).getTime() }
}

async function backupFile(versionId: string, file: string): Promise<string> {
  assertSafeName(file, '备份文件名')
  if (!/\.zip$/i.test(file)) throw new Error(`不是备份文件：${file}`)
  const path = join(await gameDirOf(versionId), 'backups', file)
  if (!(await stat(path).catch(() => null))?.isFile()) throw new Error(`找不到备份：${file}`)
  return path
}

/** 列出备份文件夹里的存档备份（新的在前） */
export async function listWorldBackups(versionId: string): Promise<WorldBackup[]> {
  const root = await gameDirOf(versionId)
  const entries = await readdir(join(root, 'backups'), { withFileTypes: true }).catch(() => [])
  const backups: WorldBackup[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue
    const info = await stat(join(root, 'backups', entry.name)).catch(() => null)
    if (!info) continue
    const parsed = parseBackupName(entry.name)
    const world = parsed?.world ?? entry.name.replace(/\.zip$/i, '')
    backups.push({
      file: entry.name,
      world,
      createdAt: parsed?.createdAt ?? info.mtimeMs,
      size: info.size,
      worldExists: !!(await stat(join(root, 'saves', world, 'level.dat')).catch(() => null))
    })
  }
  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 还原备份。asNew 为 true 时还原成一个新存档（不影响现有存档）；
 * 否则覆盖原存档，覆盖前会先把当前存档备份一次，返回这次备份的文件名。
 */
export async function restoreWorldBackup(
  versionId: string,
  file: string,
  asNew: boolean
): Promise<{ folder: string; safetyBackup?: string }> {
  assertGameStopped(versionId)
  const path = await backupFile(versionId, file)
  if (asNew) return { folder: await importWorldFile(versionId, path) }

  return withWorldZip(path, async ({ prefix, extract }) => {
    const world =
      parseBackupName(file)?.world ??
      folderName(prefix ? basename(prefix.replace(/\/$/, '')) : file.replace(/\.zip$/i, ''))
    assertSafeName(world, '存档名')
    const saves = join(await gameDirOf(versionId), 'saves')
    const target = join(saves, world)
    const id = randomUUID().slice(0, 8)
    // 先解压到临时文件夹，成功后再替换，避免解压失败时原存档已经没了
    const temp = join(saves, `.liuli-restore-${id}`)
    await extract(temp)

    let safetyBackup: string | undefined
    const existing = await stat(target).catch(() => null)
    if (existing) {
      if (await stat(join(target, 'level.dat')).catch(() => null)) {
        try {
          safetyBackup = basename((await backupWorld(versionId, world)).path)
        } catch (e) {
          await rm(temp, { recursive: true, force: true })
          throw new Error(`还原前备份当前存档失败，已取消还原：${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const old = join(saves, `.liuli-old-${id}`)
      await rename(target, old)
      try {
        await rename(temp, target)
      } catch (e) {
        await rename(old, target).catch(() => undefined)
        await rm(temp, { recursive: true, force: true })
        throw e
      }
      await rm(old, { recursive: true, force: true })
    } else {
      await rename(temp, target)
    }
    return { folder: world, safetyBackup }
  })
}

/** 删除备份：移到系统回收站 */
export async function deleteWorldBackup(versionId: string, file: string): Promise<void> {
  await shell.trashItem(await backupFile(versionId, file))
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
