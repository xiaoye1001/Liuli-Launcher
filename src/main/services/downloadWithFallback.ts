/**
 * 双保险下载：先用高速多线程引擎（FastDownloadEngine）下载，
 * 引擎出现任何问题（连不上、不支持分块后单线程也失败、分块重试 3 次仍失败、校验不通过……）时，
 * 自动、静默地改用原来的下载方式（@xmcl/file-transfer 的 download，参数原样传入），保证下载稳定。
 * 只有用户主动取消时不回退。
 */
import { app } from 'electron'
import { download, type DownloadOptions } from '@xmcl/file-transfer'
import { appendFile, mkdir } from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  DownloadCancelledError,
  markFallbackFinished,
  markFallbackStarted,
  reportFallbackProgress,
  startFastDownload
} from './fastDownloader'
import type { FastDownloadSource } from '../../shared/types'

const LOG = join(app.getPath('userData'), 'logs', 'download.log')

function log(line: string): void {
  void mkdir(dirname(LOG), { recursive: true })
    .then(() => appendFile(LOG, `[${new Date().toLocaleString('zh-CN')}] ${line}\n`))
    .catch(() => undefined)
}

/** 从原下载参数里取出 SHA1（只有用校验值形式传入时才有） */
function sha1Of(options: DownloadOptions): string | undefined {
  const validator = options.validator as { algorithm?: unknown; hash?: unknown } | undefined
  if (validator && validator.algorithm === 'sha1' && typeof validator.hash === 'string') return validator.hash
  return undefined
}

/** 请求头只保留字符串值 */
function stringHeaders(headers: DownloadOptions['headers']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/**
 * 下载文件：参数与原来的 download() 完全相同，额外标明来源。
 * 原调用处只需把 download(options) 换成 downloadWithFallback(options, 'mod')。
 */
export async function downloadWithFallback(options: DownloadOptions, source: FastDownloadSource): Promise<void> {
  const urls = Array.isArray(options.url) ? options.url : [options.url]
  let taskId: string | undefined
  try {
    // 第一重：高速多线程引擎
    const started = startFastDownload({
      urls,
      destination: options.destination,
      source,
      sha1: sha1Of(options),
      headers: stringHeaders(options.headers)
    })
    taskId = started.taskId
    await started.promise
    return
  } catch (e) {
    // 用户取消：直接结束，不回退
    if (e instanceof DownloadCancelledError) throw e
    const reason = e instanceof Error ? e.message : String(e)
    log(`高速下载失败，改用原下载方式：${basename(options.destination)}（${reason}）`)
    if (taskId) markFallbackStarted(taskId, reason)
  }

  // 第二重：原来的下载方式，参数原样传入
  try {
    const original = options.progressController
    await download({
      ...options,
      progressController: (url, chunk, written, total) => {
        if (taskId) reportFallbackProgress(taskId, written, total)
        original?.(url, chunk, written, total)
      }
    })
    if (taskId) markFallbackFinished(taskId)
  } catch (e) {
    if (taskId) markFallbackFinished(taskId, e)
    throw e
  }
}
