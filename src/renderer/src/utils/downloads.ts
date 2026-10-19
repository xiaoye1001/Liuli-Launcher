import { useEffect, useState } from 'react'
import type { FastDownloadSource, FastDownloadStatus, FastDownloadTask } from '../../../shared/types'

/** 所有下载任务（主进程每 250 毫秒推送一次），最新的在前 */
export function useDownloads(): FastDownloadTask[] {
  const [tasks, setTasks] = useState<FastDownloadTask[]>([])
  useEffect(() => {
    let alive = true
    void window.api.listDownloads().then((list) => {
      if (alive) setTasks(list)
    })
    const off = window.api.onDownloadProgress((list) => setTasks(list))
    return () => {
      alive = false
      off()
    }
  }, [])
  return tasks
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`
  return `${(bytesPerSecond / 1024).toFixed(bytesPerSecond >= 100 * 1024 ? 0 : 1)} KB/s`
}

export const SOURCE_LABELS: Record<FastDownloadSource, string> = {
  toolbox: '百宝箱直链',
  mod: 'Mod',
  modpack: '整合包',
  resource: '资源',
  fallback: '兼容模式'
}

/** 来源标签的颜色 */
export const SOURCE_STYLES: Record<FastDownloadSource, string> = {
  toolbox: 'bg-emerald-500/15 text-emerald-300',
  mod: 'bg-sky-500/15 text-sky-300',
  modpack: 'bg-fuchsia-500/15 text-fuchsia-300',
  resource: 'bg-amber-500/15 text-amber-300',
  fallback: 'bg-orange-500/15 text-orange-300'
}

/** 从下载地址里取文件名（解析失败时返回空字符串） */
export function fileNameFromUrl(text: string): string {
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    const last = url.pathname.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

export const STATUS_LABELS: Record<FastDownloadStatus, string> = {
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  error: '失败',
  cancelled: '已取消',
  fallback_retrying: '兼容模式下载中'
}

export function isActiveDownload(task: FastDownloadTask): boolean {
  return task.status === 'downloading' || task.status === 'paused' || task.status === 'fallback_retrying'
}

/** 去掉 Electron IPC 错误前缀 */
export function cleanIpcError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
