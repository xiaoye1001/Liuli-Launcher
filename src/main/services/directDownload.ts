/**
 * 百宝箱：手动输入 HTTP / HTTPS 直链，用高速多线程引擎下载到指定文件夹
 */
import { app, BrowserWindow, dialog, shell } from 'electron'
import { stat } from 'fs/promises'
import { dirname, isAbsolute } from 'path'
import { getFastDownload, startFastDownload } from './fastDownloader'
import type { DirectDownloadOptions } from '../../shared/types'

/** 检查直链：只接受 http:// 和 https:// 地址 */
export function validateDirectUrl(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入下载地址')
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('下载地址格式不对，需要以 http:// 或 https:// 开头')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http:// 或 https:// 开头的下载地址')
  }
  if (!url.hostname) throw new Error('下载地址缺少域名')
  return url.href
}

/** 保存文件夹：必须是已存在的文件夹，不填时用系统的「下载」文件夹 */
async function resolveDirectory(directory: unknown): Promise<string> {
  if (directory === undefined || directory === null || directory === '') return app.getPath('downloads')
  if (typeof directory !== 'string' || !isAbsolute(directory)) throw new Error('保存位置无效')
  const info = await stat(directory).catch(() => null)
  if (!info?.isDirectory()) throw new Error('保存位置不存在，请重新选择文件夹')
  return directory
}

/** 新建直链下载，立即返回任务 ID；进度通过 download:progress 推送 */
export async function createDirectDownload(url: unknown, options: DirectDownloadOptions = {}): Promise<string> {
  const href = validateDirectUrl(url)
  const directory = await resolveDirectory(options.directory)
  const started = startFastDownload({
    urls: [href],
    directory,
    source: 'toolbox',
    threads: options.threads
  })
  // 结果（完成、失败、取消）已记录在任务状态里，这里只避免未处理的异常
  started.promise.catch(() => undefined)
  return started.taskId
}

/** 选择保存文件夹，取消时返回 null */
export async function pickDownloadDirectory(win: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: '选择下载保存位置',
    defaultPath: app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/** 打开任务所在的文件夹：已下载完成时选中文件 */
export async function openDownloadFolder(taskId: string): Promise<void> {
  const task = getFastDownload(taskId)
  if (!task?.destination) throw new Error('找不到这个下载任务的保存位置')
  if (task.status === 'completed' && (await stat(task.destination).catch(() => null))) {
    shell.showItemInFolder(task.destination)
    return
  }
  const error = await shell.openPath(dirname(task.destination))
  if (error) throw new Error(error)
}
