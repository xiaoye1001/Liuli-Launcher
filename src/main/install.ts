import { BrowserWindow } from 'electron'
import { getDefaultAgent } from '@xmcl/file-transfer'
import { installTask, type Options } from '@xmcl/installer'
import { getSettings } from './config'
import { getVersionManifest } from './versions'
import type { DownloadSource, InstallPhase, InstallStatus } from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'

/** 根据下载源生成 @xmcl/installer 的镜像参数（镜像失败时会自动回退到官方地址） */
function mirrorOptions(source: DownloadSource): Options {
  if (source !== 'bmclapi') return {}
  const replaceMojangHost = (url: string): string =>
    url.replace(/^https?:\/\/(launchermeta|piston-meta|launcher|piston-data)\.mojang\.com/, BMCLAPI)
  return {
    json: (version) => `${BMCLAPI}/version/${version.id}/json`,
    client: (version) => `${BMCLAPI}/version/${version.id}/client`,
    assetsIndexUrl: (version) => (version.assetIndex ? replaceMojangHost(version.assetIndex.url) : []),
    assetsHost: `${BMCLAPI}/assets`,
    libraryHost: (library) => {
      const url = library.download.url
      return url.startsWith('https://libraries.minecraft.net/')
        ? url.replace('https://libraries.minecraft.net', `${BMCLAPI}/maven`)
        : undefined
    }
  }
}

/** 根据任务路径判断当前阶段，例如 install.version.jar、install.dependencies.assets.asset */
function phaseOf(path: string): InstallPhase {
  return path.includes('dependencies') ? 'dependencies' : 'version'
}

let status: InstallStatus | null = null
let currentTask: ReturnType<typeof installTask> | null = null
let cancelRequested = false

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('install:status', status)
  }
}

export function getInstallStatus(): InstallStatus | null {
  return status
}

/** 开始安装指定版本（同一时间只允许一个安装任务） */
export async function startInstall(versionId: string): Promise<void> {
  if (status?.state === 'running') {
    throw new Error(`正在安装 ${status.versionId}，请等待完成`)
  }

  const settings = await getSettings()
  const manifest = await getVersionManifest(settings.downloadSource)
  const meta = manifest.versions.find((v) => v.id === versionId)
  if (!meta) {
    throw new Error(`版本列表中找不到 ${versionId}`)
  }

  const task = installTask(meta, settings.gameDir, {
    ...mirrorOptions(settings.downloadSource),
    // 所有文件共用一个连接池：每个服务器最多 16 个并发连接，失败自动重试
    dispatcher: getDefaultAgent({ maxRetries: 3 }),
    headers: { 'User-Agent': 'mc_launcher/0.1.0' },
    throwErrorImmediately: false
  })
  currentTask = task
  cancelRequested = false
  status = { versionId, state: 'running', phase: 'version', progress: 0, total: 0, speed: 0 }
  broadcast()

  // 每 250ms 计算一次速度并推送进度，避免过于频繁地发送消息
  let bytesInWindow = 0
  let lastTick = Date.now()
  const timer = setInterval(() => {
    if (!status || status.state !== 'running') return
    const now = Date.now()
    const instant = (bytesInWindow * 1000) / Math.max(1, now - lastTick)
    // 平滑处理，避免速度数字跳动太厉害
    status.speed = status.speed === 0 ? instant : status.speed * 0.6 + instant * 0.4
    status.progress = task.progress
    status.total = task.total
    bytesInWindow = 0
    lastTick = now
    broadcast()
  }, 250)

  task
    .startAndWait({
      onUpdate(child, chunkSize) {
        bytesInWindow += chunkSize
        if (status) status.phase = phaseOf(child.path)
      }
    })
    .then(() => {
      status = { ...status!, state: 'success', progress: task.total, total: task.total, speed: 0 }
    })
    .catch((e: unknown) => {
      const cancelled = cancelRequested
      status = {
        ...status!,
        state: cancelled ? 'cancelled' : 'failed',
        speed: 0,
        error: cancelled ? undefined : describeError(e)
      }
      if (!cancelled) console.error('安装失败：', e)
    })
    .finally(() => {
      clearInterval(timer)
      currentTask = null
      broadcast()
    })
}

/** 取消当前安装 */
export async function cancelInstall(): Promise<void> {
  if (!currentTask) return
  cancelRequested = true
  // 最多等待 3 秒让正在进行的下载中止
  await currentTask.cancel(3000)
}

/** 把错误（可能是包含很多子错误的 AggregateError）整理成简短的提示 */
function describeError(e: unknown): string {
  if (e instanceof AggregateError) {
    const first = e.errors[0]
    const detail = first instanceof Error ? first.message : String(first)
    return `${e.errors.length} 个文件下载失败，例如：${detail}`
  }
  return e instanceof Error ? e.message : String(e)
}
