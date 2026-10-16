import { constants } from 'fs'
import { access, mkdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import { defaultGameDir, getSettings, updateSettings } from './config'
import { getInstallStatus } from './install'
import { getGameStatus, listInstalledVersions } from './launch'
import type { GameDirInfo } from '../shared/types'

/** 官方启动器的 .minecraft 目录 */
function officialGameDir(): string {
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? homedir(), '.minecraft')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'minecraft')
  return join(homedir(), '.minecraft')
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path)
    .then((s) => s.isDirectory())
    .catch(() => false)
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  return norm(a) === norm(b)
}

export async function getGameDirInfo(): Promise<GameDirInfo> {
  const { gameDir } = await getSettings()
  const officialDir = officialGameDir()
  return {
    path: gameDir,
    versionCount: (await listInstalledVersions()).length,
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

/** 切换游戏目录：安装或游戏运行期间不允许切换，并检查目录是否可写 */
export async function setGameDir(dir: string): Promise<GameDirInfo> {
  if (getInstallStatus()?.state === 'running') {
    throw new Error('正在安装游戏，请等待安装完成后再切换目录')
  }
  const game = getGameStatus().state
  if (game === 'launching' || game === 'running') {
    throw new Error('游戏正在运行，请退出游戏后再切换目录')
  }

  const target = resolve(dir)
  try {
    await mkdir(target, { recursive: true })
    await access(target, constants.W_OK)
  } catch {
    throw new Error(`无法写入该目录，请换一个位置：${target}`)
  }

  await updateSettings({ gameDir: target })
  return getGameDirInfo()
}

/** 在系统文件管理器中打开游戏目录 */
export async function openGameDir(): Promise<void> {
  const { gameDir } = await getSettings()
  await mkdir(gameDir, { recursive: true })
  const error = await shell.openPath(gameDir)
  if (error) throw new Error(error)
}
