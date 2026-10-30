import { app } from 'electron'
import { appendFile, mkdir, rename, stat } from 'fs/promises'
import { dirname, join } from 'path'

/** 下载记录（游戏文件下载和高速下载共用），出问题时方便排查 */
export const DOWNLOAD_LOG = join(app.getPath('userData'), 'logs', 'download.log')
/** 超过这个大小就把旧记录改名为 download.old.log，重新开始（最多占 2 个文件的空间） */
const MAX_SIZE = 5 * 1024 * 1024
/** 每写这么多行检查一次大小 */
const CHECK_EVERY = 200

let writes = 0
/** 写入排成一队，换文件时不会和正在写的内容交错 */
let queue: Promise<void> = Promise.resolve()

async function rotateIfLarge(): Promise<void> {
  const size = (await stat(DOWNLOAD_LOG).catch(() => null))?.size ?? 0
  if (size > MAX_SIZE) await rename(DOWNLOAD_LOG, join(dirname(DOWNLOAD_LOG), 'download.old.log'))
}

export function appendDownloadLog(line: string): void {
  const check = writes++ % CHECK_EVERY === 0
  queue = queue
    .then(async () => {
      await mkdir(dirname(DOWNLOAD_LOG), { recursive: true })
      if (check) await rotateIfLarge()
      await appendFile(DOWNLOAD_LOG, `[${new Date().toLocaleString('zh-CN')}] ${line}\n`)
    })
    .catch(() => undefined)
}
