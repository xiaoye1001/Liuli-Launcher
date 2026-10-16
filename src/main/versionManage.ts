import { readdir, readFile, rm } from 'fs/promises'
import { basename, join } from 'path'
import { BrowserWindow, dialog, shell } from 'electron'
import { getSettings } from './config'
import { getInstallStatus } from './install'
import { getGameStatus } from './launch'

/** 防止版本名里带有 ../ 之类的路径，误删其他目录 */
export function assertSafeId(versionId: string): void {
  if (!versionId || versionId !== basename(versionId) || versionId === '.' || versionId === '..') {
    throw new Error(`无效的版本名：${versionId}`)
  }
}

/** 版本隔离时游戏在版本文件夹里产生的玩家数据 */
const USER_DATA: [string, string][] = [
  ['saves', '存档'],
  ['mods', '模组'],
  ['config', '模组配置'],
  ['resourcepacks', '资源包'],
  ['shaderpacks', '光影包'],
  ['screenshots', '截图']
]

/** 找出版本文件夹里存在的玩家数据（显示名称） */
async function findUserData(versionDir: string): Promise<string[]> {
  const names = new Set(await readdir(versionDir).catch(() => [] as string[]))
  return USER_DATA.filter(([dir]) => names.has(dir)).map(([, label]) => label)
}

/** 找出依赖于该版本的其他版本（例如 Fabric、Forge 版本会通过 inheritsFrom 继承原版） */
async function findDependents(versionsDir: string, versionId: string): Promise<string[]> {
  const dependents: string[] = []
  const names = await readdir(versionsDir).catch(() => [] as string[])
  for (const name of names) {
    if (name === versionId) continue
    try {
      const json = JSON.parse(await readFile(join(versionsDir, name, `${name}.json`), 'utf-8'))
      if (json.inheritsFrom === versionId) dependents.push(name)
    } catch {
      // 忽略无效的版本目录
    }
  }
  return dependents
}

/**
 * 删除已安装的版本（弹出确认框）。只删除 versions/<版本名> 文件夹，
 * 依赖库与资源文件可能被其他版本共用，所以保留；存档、资源包等也不受影响。
 * 返回 true 表示已删除，false 表示用户取消。
 */
export async function deleteVersion(win: BrowserWindow | null, versionId: string): Promise<boolean> {
  assertSafeId(versionId)

  const install = getInstallStatus()
  if (install?.state === 'running') {
    throw new Error(`正在${install.kind === 'repair' ? '修复' : '安装'} ${install.versionId}，请等待完成后再删除`)
  }
  const game = getGameStatus()
  if (game.state === 'launching' || game.state === 'running') {
    throw new Error('游戏正在运行，请退出游戏后再删除版本')
  }

  const { gameDir } = await getSettings()
  const versionsDir = join(gameDir, 'versions')
  const dependents = await findDependents(versionsDir, versionId)
  if (dependents.length > 0) {
    throw new Error(`以下版本依赖于 ${versionId}，请先删除它们：${dependents.join('、')}`)
  }

  // 开启过版本隔离的版本，文件夹里还有存档、模组等玩家数据，需要特别提醒
  const userData = await findUserData(join(versionsDir, versionId))
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: '删除版本',
    message: `确定要删除 ${versionId} 吗？`,
    detail:
      userData.length > 0
        ? `该版本使用了版本隔离，文件夹中的 ${userData.join('、')} 也会一起删除，且无法恢复！如需保留存档，请先点「打开文件夹」备份。`
        : '将删除该版本的游戏本体与版本配置。存档、资源包、截图等不受影响，依赖库与资源文件会保留给其他版本使用。',
    buttons: ['删除', '取消'],
    defaultId: 1,
    cancelId: 1
  }
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (response !== 0) return false

  await rm(join(versionsDir, versionId), { recursive: true, force: true })
  return true
}

/** 在系统文件管理器中打开版本文件夹 */
export async function openVersionDir(versionId: string): Promise<void> {
  assertSafeId(versionId)
  const { gameDir } = await getSettings()
  const error = await shell.openPath(join(gameDir, 'versions', versionId))
  if (error) throw new Error(error)
}
