import { download } from '@xmcl/file-transfer'
import { AbortableTask } from '@xmcl/task'
import { basename } from 'path'
import { setInstallDetail } from './install'
import { installDispatcher } from './network'
import { appendDownloadLog, DOWNLOAD_LOG } from './downloadLog'

/** 要下载的文件 */
export interface DownloadItem {
  /** 下载地址，按顺序尝试 */
  urls: string[]
  destination: string
  sha1?: string
  /** 预期大小（字节），用于一开始就计算总大小 */
  size?: number
}

/** 同时下载的文件数 */
const CONCURRENCY = 16
/** 一个文件 30 秒内收到的数据不到 16 KB（包括只零星传来几个字节），就放弃这个地址换下一个 */
const STALL_TIMEOUT = 30_000
const STALL_MIN_BYTES = 16 * 1024
/** 所有地址都试过后，再从头试一轮 */
const ROUNDS = 2
/** 剩下几个文件时在界面上显示文件名 */
const SHOW_NAMES_BELOW = 5

export { DOWNLOAD_LOG }

class StallError extends Error {}

/** 任务被中止（取消）时抛出的错误 */
export class AbortedError extends Error {
  constructor() {
    super('已中止')
  }
}

/**
 * 取消任务时，xmcl 会反复重新执行任务，直到任务状态变为「已取消」。
 * 中止后再次执行时先等一小会儿再报告中止：如果立即返回，会形成一直不让出的循环，卡住主进程
 */
export async function abortedPause(): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, 50))
  throw new AbortedError()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 下载一批文件：每个文件有自己的「卡住检测」，一段时间没有进展就换下一个地址，
 * 剩下少量文件时在进度卡片上显示文件名，过程记录在 download.log 中。
 * （xmcl 的批量下载只在完全没有数据时超时，连接零星传数据时会一直卡着，也看不出卡在哪个文件）
 */
export class WatchedDownloadTask extends AbortableTask<void> {
  private aborted = false
  private readonly controllers = new Set<AbortController>()
  private readonly written: number[]
  private readonly sizes: number[]
  private readonly active = new Set<number>()
  private remaining: number

  constructor(
    private readonly items: DownloadItem[],
    private readonly headers: Record<string, string> = {}
  ) {
    super()
    this.written = items.map(() => 0)
    this.sizes = items.map((i) => i.size ?? 0)
    this.remaining = items.length
    this._total = this.sizes.reduce((a, b) => a + b, 0)
  }

  private log(line: string): void {
    appendDownloadLog(line)
  }

  /** 进度卡片上的说明：剩下少量文件时列出文件名 */
  private showDetail(): void {
    if (this.remaining === 0) {
      setInstallDetail(undefined)
      return
    }
    const names = [...this.active].map((i) => basename(this.items[i].destination))
    setInstallDetail(
      this.remaining <= SHOW_NAMES_BELOW && names.length > 0
        ? `还剩 ${this.remaining} 个文件：${names.join('、')}`
        : `还剩 ${this.remaining} 个文件`
    )
  }

  private report(index: number, written: number, total: number, chunk: number): void {
    this.written[index] = written
    if (total > 0) this.sizes[index] = Math.max(this.sizes[index], total)
    this._progress = this.written.reduce((a, b) => a + b, 0)
    this._total = Math.max(
      this.sizes.reduce((a, b) => a + b, 0),
      this._progress
    )
    this.update(chunk)
  }

  /** 下载一个文件：依次尝试每个地址，卡住或失败就换下一个 */
  private async downloadOne(index: number): Promise<void> {
    const item = this.items[index]
    const name = basename(item.destination)
    const errors: string[] = []
    for (let round = 0; round < ROUNDS; round++) {
      for (const url of item.urls) {
        if (this.aborted) throw new AbortedError()
        const controller = new AbortController()
        this.controllers.add(controller)
        let windowStart = Date.now()
        let windowBytes = 0
        let stalled = false
        const watchdog = setInterval(() => {
          if (Date.now() - windowStart < STALL_TIMEOUT) return
          if (windowBytes < STALL_MIN_BYTES) {
            stalled = true
            controller.abort(new StallError())
          }
          windowStart = Date.now()
          windowBytes = 0
        }, 2000)
        try {
          await download({
            url,
            destination: item.destination,
            headers: this.headers,
            dispatcher: installDispatcher(),
            validator: item.sha1 ? { algorithm: 'sha1', hash: item.sha1 } : undefined,
            abortSignal: controller.signal,
            progressController: (_url, chunk, written, total) => {
              windowBytes += chunk
              this.report(index, written, total, chunk)
            }
          })
          if (round > 0 || item.urls.indexOf(url) > 0) this.log(`完成 ${name}（来自 ${hostOf(url)}）`)
          return
        } catch (e) {
          if (this.aborted) throw new AbortedError()
          const reason = stalled
            ? `${STALL_TIMEOUT / 1000} 秒内几乎没有收到数据`
            : e instanceof Error
              ? e.message.slice(0, 200)
              : String(e)
          errors.push(`${hostOf(url)}：${reason}`)
          this.log(`失败 ${name}（${hostOf(url)}）：${reason}，换下一个地址`)
          this.report(index, 0, 0, 0)
        } finally {
          clearInterval(watchdog)
          this.controllers.delete(controller)
        }
      }
    }
    throw new Error(`${name} 下载失败（${errors.slice(-2).join('；')}）`)
  }

  protected async process(): Promise<void> {
    if (this.aborted) return abortedPause()
    this.log(`开始下载 ${this.items.length} 个文件`)
    const failed: string[] = []
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < this.items.length) {
        const index = next++
        this.active.add(index)
        this.showDetail()
        try {
          await this.downloadOne(index)
        } catch (e) {
          if (e instanceof AbortedError) throw e
          failed.push(e instanceof Error ? e.message : String(e))
        } finally {
          this.active.delete(index)
          this.remaining--
          this.showDetail()
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, this.items.length) }, worker))
    } finally {
      setInstallDetail(undefined)
    }
    if (failed.length > 0) {
      this.log(`有 ${failed.length} 个文件下载失败`)
      throw new Error(
        `${failed.length} 个文件下载失败，例如：${failed.slice(0, 3).join('；')}。详细记录见 ${DOWNLOAD_LOG}`
      )
    }
    this.log('全部下载完成')
  }

  protected abort(): void {
    this.aborted = true
    for (const controller of this.controllers) controller.abort()
  }

  protected isAbortedError(e: unknown): boolean {
    // 只有中止造成的错误才算；不能把 CancelledError 也算进去，否则 xmcl 会一直重新执行任务
    return e instanceof AbortedError
  }
}
