import { BrowserWindow } from 'electron'
import { Version } from '@xmcl/core'
import { getDefaultAgent } from '@xmcl/file-transfer'
import {
  getLoaderArtifactListFor,
  installDependenciesTask,
  installFabric,
  installTask,
  type Options
} from '@xmcl/installer'
import { task as createTask, type Task } from '@xmcl/task'
import { getSettings } from './config'
import { getVersionManifest } from './versions'
import type { DownloadSource, FabricLoaderVersion, InstallKind, InstallPhase, InstallStatus } from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const FABRIC_META = 'https://meta.fabricmc.net'
const FABRIC_MAVEN = 'https://maven.fabricmc.net/'

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
      if (url.startsWith('https://libraries.minecraft.net/')) {
        return url.replace('https://libraries.minecraft.net', `${BMCLAPI}/maven`)
      }
      if (url.startsWith(FABRIC_MAVEN)) {
        return url.replace(FABRIC_MAVEN, `${BMCLAPI}/maven/`)
      }
      return undefined
    }
  }
}

/** 根据任务路径判断当前阶段，例如 install.version.jar、install.dependencies.assets.asset */
function phaseOf(path: string): InstallPhase {
  return path.includes('dependencies') ? 'dependencies' : 'version'
}

type AnyInstallTask = Task<unknown>

let status: InstallStatus | null = null
let currentTask: AnyInstallTask | null = null
let cancelRequested = false

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('install:status', status)
  }
}

export function getInstallStatus(): InstallStatus | null {
  return status
}

function assertIdle(): void {
  if (status?.state === 'running') {
    throw new Error(`正在${status.kind === 'repair' ? '修复' : '安装'} ${status.versionId}，请等待完成`)
  }
}

/** 公共下载参数：镜像 + 共享连接池（每个服务器最多 16 个并发连接，失败自动重试） */
async function downloadOptions(): Promise<Options> {
  const settings = await getSettings()
  return {
    ...mirrorOptions(settings.downloadSource),
    dispatcher: getDefaultAgent({ maxRetries: 3 }),
    headers: { 'User-Agent': 'mc_launcher/0.1.0' },
    throwErrorImmediately: false
  }
}

/** 运行一个安装任务，并把进度与速度推送到界面 */
function runTask(versionId: string, kind: InstallKind, task: AnyInstallTask): void {
  currentTask = task
  cancelRequested = false
  status = { versionId, kind, state: 'running', phase: 'version', progress: 0, total: 0, speed: 0 }
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
      if (!cancelled) console.error(`${kind === 'repair' ? '修复' : '安装'}失败：`, e)
    })
    .finally(() => {
      clearInterval(timer)
      currentTask = null
      broadcast()
    })
}

/** 开始安装指定版本（同一时间只允许一个安装任务） */
export async function startInstall(versionId: string): Promise<void> {
  assertIdle()
  const settings = await getSettings()
  const manifest = await getVersionManifest(settings.downloadSource)
  const meta = manifest.versions.find((v) => v.id === versionId)
  if (!meta) {
    throw new Error(`版本列表中找不到 ${versionId}`)
  }
  runTask(versionId, 'install', installTask(meta, settings.gameDir, await downloadOptions()))
}

/**
 * 检查并修复已安装的版本。下载前会先校验本地文件，完好的文件会直接跳过，
 * 只重新下载缺失或损坏的文件。
 * 官方版本会连同版本 json 和游戏本体一起检查；不在官方列表中的版本（如模组加载器）只检查依赖库与资源文件。
 */
export async function startRepair(versionId: string): Promise<void> {
  assertIdle()
  const settings = await getSettings()
  const options = await downloadOptions()

  const manifest = await getVersionManifest(settings.downloadSource).catch(() => null)
  const meta = manifest?.versions.find((v) => v.id === versionId)
  if (meta) {
    runTask(versionId, 'repair', installTask(meta, settings.gameDir, options))
    return
  }

  let resolved: Awaited<ReturnType<typeof Version.parse>>
  try {
    resolved = await Version.parse(settings.gameDir, versionId)
  } catch {
    throw new Error(`无法解析 ${versionId} 的版本文件，请删除后重新安装`)
  }
  runTask(versionId, 'repair', installDependenciesTask(resolved, options))
}

/** 带超时与状态码检查的 fetch */
async function fetchChecked(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`)
  return response
}

/** Fabric 元数据请求：选择 BMCLAPI 时优先走镜像，失败再回退到官方地址 */
async function fabricFetch(url: string, init?: RequestInit): Promise<Response> {
  const { downloadSource } = await getSettings()
  if (downloadSource === 'bmclapi' && url.startsWith(FABRIC_META)) {
    try {
      return await fetchChecked(url.replace(FABRIC_META, `${BMCLAPI}/fabric-meta`), init)
    } catch {
      // 镜像失败，回退到官方地址
    }
  }
  return fetchChecked(url, init)
}

/** 获取某个 Minecraft 版本可用的 Fabric 加载器版本（新版本在前） */
export async function getFabricLoaders(minecraftVersion: string): Promise<FabricLoaderVersion[]> {
  const list = await getLoaderArtifactListFor(minecraftVersion, { fetch: fabricFetch })
  if (!Array.isArray(list)) return []
  return list.map((item) => ({ version: item.loader.version, stable: item.loader.stable }))
}

/**
 * 安装 Fabric：先安装（或校验）原版，再写入 Fabric 版本配置，最后下载 Fabric 的依赖库。
 * 三步合并为一个任务，进度与取消都和普通安装一样。
 */
export async function startFabricInstall(minecraftVersion: string, loaderVersion: string): Promise<void> {
  assertIdle()
  const settings = await getSettings()
  const manifest = await getVersionManifest(settings.downloadSource)
  const meta = manifest.versions.find((v) => v.id === minecraftVersion)
  if (!meta) {
    throw new Error(`版本列表中找不到 ${minecraftVersion}`)
  }
  const options = await downloadOptions()
  const versionId = `${minecraftVersion}-fabric${loaderVersion}`

  const fabricTask = createTask('fabric', async function () {
    await this.yield(installTask(meta, settings.gameDir, options))
    const id = await installFabric({
      minecraftVersion,
      version: loaderVersion,
      minecraft: settings.gameDir,
      fetch: fabricFetch
    })
    const resolved = await Version.parse(settings.gameDir, id)
    await this.yield(installDependenciesTask(resolved, options))
  })
  runTask(versionId, 'install', fabricTask)
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
