import { constants } from 'fs'
import { access, mkdir, readdir, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import { defaultGameDir, gameDirDisplayName, getSettings, officialGameDir, samePath, updateSettings } from './config'
import { getInstallStatus } from './install'
import { getGameStatus } from './launch'
import type { GameDirInfo, GameDirSummary } from '../shared/types'

async function isDirectory(path: string): Promise<boolean> {
  return stat(path)
    .then((s) => s.isDirectory())
    .catch(() => false)
}

/** 目录里安装了几个版本（versions/<id>/<id>.json 存在的才算） */
async function countVersions(gameDir: string): Promise<number> {
  const names = await readdir(join(gameDir, 'versions')).catch(() => [] as string[])
  const found = await Promise.all(
    names.map((id) =>
      stat(join(gameDir, 'versions', id, `${id}.json`))
        .then((s) => s.isFile())
        .catch(() => false)
    )
  )
  return found.filter(Boolean).length
}

export async function getGameDirInfo(): Promise<GameDirInfo> {
  const { gameDir, gameDirs } = await getSettings()
  const officialDir = officialGameDir()
  const dirs = await Promise.all(
    gameDirs.map(
      async (entry): Promise<GameDirSummary> => ({
        path: entry.path,
        name: entry.name,
        current: samePath(entry.path, gameDir),
        // 默认目录用到时会自动创建，不算「找不到」
        exists: samePath(entry.path, defaultGameDir()) || (await isDirectory(entry.path)),
        versionCount: await countVersions(entry.path),
        isDefault: samePath(entry.path, defaultGameDir()),
        isOfficial: samePath(entry.path, officialDir)
      })
    )
  )
  return {
    dirs,
    path: gameDir,
    versionCount: dirs.find((d) => d.current)?.versionCount ?? 0,
    isDefault: samePath(gameDir, defaultGameDir()),
    isOfficial: samePath(gameDir, officialDir),
    defaultDir: defaultGameDir(),
    officialDir,
    officialExists: await isDirectory(officialDir)
  }
}

/** 弹出系统文件夹选择框，返回选中的路径（取消时返回空字符串） */
export async function pickGameDir(win: BrowserWindow | null): Promise<string> {
  const { gameDir } = await getSettings()
  const options: Electron.OpenDialogOptions = {
    title: '选择游戏目录（.minecraft 文件夹）',
    defaultPath: gameDir,
    properties: ['openDirectory', 'createDirectory']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
}

function assertIdle(): void {
  if (getInstallStatus()?.state === 'running') {
    throw new Error('正在安装游戏，请等待安装完成后再切换目录')
  }
  const game = getGameStatus().state
  if (game === 'launching' || game === 'running') {
    throw new Error('游戏正在运行，请退出游戏后再切换目录')
  }
}

/**
 * 切换游戏目录（不在列表中时自动添加）：安装或游戏运行期间不允许切换，并检查目录是否可写。
 * 记住旧目录选中的版本，切换回来时恢复
 */
export async function setGameDir(dir: string): Promise<GameDirInfo> {
  assertIdle()
  const target = resolve(dir)
  try {
    await mkdir(target, { recursive: true })
    await access(target, constants.W_OK)
  } catch {
    throw new Error(`无法写入该目录，请换一个位置：${target}`)
  }

  const settings = await getSettings()
  const list = settings.gameDirs.map((e) =>
    samePath(e.path, settings.gameDir) ? { ...e, selectedVersion: settings.selectedVersion } : e
  )
  let entry = list.find((e) => samePath(e.path, target))
  if (!entry) {
    entry = { path: target, name: gameDirDisplayName(target) }
    list.push(entry)
  }
  await updateSettings({ gameDir: entry.path, gameDirs: list, selectedVersion: entry.selectedVersion ?? '' })
  return getGameDirInfo()
}

/** 修改游戏目录在列表中显示的名字 */
export async function renameGameDir(dir: string, name: string): Promise<GameDirInfo> {
  const value = name.trim()
  if (!value) throw new Error('名字不能为空')
  if (value.length > 32) throw new Error('名字最多 32 个字')
  const { gameDirs } = await getSettings()
  if (!gameDirs.some((e) => samePath(e.path, dir))) throw new Error('列表中没有这个游戏目录')
  await updateSettings({ gameDirs: gameDirs.map((e) => (samePath(e.path, dir) ? { ...e, name: value } : e)) })
  return getGameDirInfo()
}

/** 从列表中移除游戏目录（不会删除文件夹里的任何文件）。当前目录和默认目录不能移除 */
export async function removeGameDir(dir: string): Promise<GameDirInfo> {
  const { gameDir, gameDirs } = await getSettings()
  if (samePath(dir, gameDir)) throw new Error('不能移除正在使用的游戏目录，请先切换到其他目录')
  if (samePath(dir, defaultGameDir())) throw new Error('默认目录不能移除')
  await updateSettings({ gameDirs: gameDirs.filter((e) => !samePath(e.path, dir)) })
  return getGameDirInfo()
}

/** 在系统文件管理器中打开游戏目录 */
export async function openGameDir(dir?: string): Promise<void> {
  const { gameDir, gameDirs } = await getSettings()
  // 只能打开列表中的目录
  const target = dir ? gameDirs.find((e) => samePath(e.path, dir))?.path : gameDir
  if (!target) throw new Error('列表中没有这个游戏目录')
  if (!dir || samePath(target, defaultGameDir())) await mkdir(target, { recursive: true })
  if (!(await isDirectory(target))) throw new Error(`找不到文件夹：${target}`)
  const error = await shell.openPath(target)
  if (error) throw new Error(error)
}
