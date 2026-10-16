import { app, BrowserWindow } from 'electron'
import { Version } from '@xmcl/core'
import { getDefaultAgent } from '@xmcl/file-transfer'
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  DownloadTask,
  getFabricLoaderArtifact,
  getLoaderArtifactListFor,
  installDependenciesTask,
  installFabricByLoaderArtifact,
  installForgeTask,
  installNeoForgedTask,
  installOptifineTask,
  installTask,
  type Options
} from '@xmcl/installer'
import { task as createTask, type Task } from '@xmcl/task'
import { getSettings } from './config'
import { getVersionManifest } from './versions'
import { neoforgeProject } from './neoforge'
import { optiFineInstallerUrl } from './optifine'
import { isIsolated, versionGameDir } from './isolation'
import type {
  DownloadSource,
  FabricLoaderVersion,
  InstallKind,
  InstallPhase,
  InstallRequest,
  InstallStatus,
  OptiFineVersionRef
} from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const FABRIC_META = 'https://meta.fabricmc.net'
const FABRIC_MAVEN = 'https://maven.fabricmc.net/'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/'

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
      if (url.startsWith(FORGE_MAVEN)) {
        return url.replace(FORGE_MAVEN, `${BMCLAPI}/maven/`)
      }
      if (url.startsWith(NEOFORGE_MAVEN)) {
        return url.replace(NEOFORGE_MAVEN, `${BMCLAPI}/maven/`)
      }
      return undefined
    }
  }
}

/** Forge 安装器的下载地址（按顺序尝试，xmcl 最后还会回退到 Forge 旧版地址） */
function forgeMavenHosts(source: DownloadSource): string[] {
  const official = FORGE_MAVEN.replace(/\/$/, '')
  return source === 'bmclapi' ? [`${BMCLAPI}/maven`, official] : [official, `${BMCLAPI}/maven`]
}

/** 根据任务路径判断当前阶段，例如 install.version.jar、install.dependencies.assets.asset */
function phaseOf(path: string): InstallPhase {
  if (path.includes('postProcessing') || path.includes('installOptifine')) return 'processing'
  return path.includes('dependencies') || path.includes('installForge') || path.includes('downloadOptifine')
    ? 'dependencies'
    : 'version'
}

type AnyInstallTask = Task<unknown>

let status: InstallStatus | null = null
let currentTask: AnyInstallTask | null = null
let cancelRequested = false
/** 上一次的安装请求，用于「重试」 */
let lastRequest: InstallRequest | null = null

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
    headers: { 'User-Agent': 'LiuliLauncher/0.1.0' },
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
      // 补丁、处理程序等步骤没有下载进度，开始时就切换阶段
      onStart(child) {
        if (status) status.phase = phaseOf(child.path)
      },
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

/** 检查版本名是否可用作 versions 下的文件夹名 */
function validateName(name: string): void {
  if (!name) throw new Error('版本名不能为空')
  if (name.length > 64) throw new Error('版本名不能超过 64 个字符')
  if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..' || name !== name.trim()) {
    throw new Error('版本名不能包含 \\ / : * ? " < > | 等字符，且首尾不能有空格')
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false)
}

/**
 * 按安装页的选择安装游戏：
 * 1. 安装（或校验）原版；
 * 2. 选择了 Fabric 时，写入 Fabric 版本配置并下载其依赖库；
 * 3. 选择了 Forge / NeoForge 时，下载安装器，解包并用 Java 运行其中的处理程序；
 * 4. 单独选择 OptiFine 时，从 BMCLAPI 下载安装器，用 Java 运行它的补丁程序生成 OptiFine 库；
 *    与 Forge 一起选择时，安装完 Forge 后把 OptiFine 作为模组放进该版本的 mods 文件夹；
 * 5. 只改了版本名时，创建一个继承原版的版本配置。
 * 所有步骤合并为一个任务，进度与取消都和普通安装一样。
 * allowExisting 为 true 时（重试）允许覆盖上次失败留下的同名版本。
 */
export async function startCustomInstall(request: InstallRequest, allowExisting = false): Promise<void> {
  assertIdle()
  const { minecraftVersion, fabricLoader, forgeVersion, neoforgeVersion, optifine } = request
  const name = request.name
  validateName(name)
  if ([fabricLoader, forgeVersion, neoforgeVersion].filter(Boolean).length > 1) {
    throw new Error('Fabric、Forge、NeoForge 只能选择其中一个')
  }
  if (optifine && (fabricLoader || neoforgeVersion)) {
    throw new Error('OptiFine 只能单独安装或与 Forge 一起安装')
  }

  const settings = await getSettings()
  const javaUser = forgeVersion ? 'Forge' : neoforgeVersion ? 'NeoForge' : optifine ? 'OptiFine' : ''
  if (javaUser && !settings.javaPath) {
    throw new Error(`安装 ${javaUser} 需要运行 Java，请先到「设置」页选择 Java`)
  }
  const isPlainVanilla = !fabricLoader && !forgeVersion && !neoforgeVersion && !optifine && name === minecraftVersion
  if (!isPlainVanilla) {
    if (name === minecraftVersion) {
      throw new Error('安装模组加载器时，版本名不能与原版相同')
    }
    if (!allowExisting && (await exists(join(settings.gameDir, 'versions', name)))) {
      throw new Error(`已存在名为「${name}」的版本，请换一个名字`)
    }
  }

  const manifest = await getVersionManifest(settings.downloadSource)
  const meta = manifest.versions.find((v) => v.id === minecraftVersion)
  if (!meta) {
    throw new Error(`版本列表中找不到 ${minecraftVersion}`)
  }
  const options = await downloadOptions()
  // 提前获取 Fabric 信息，网络有问题时在开始下载前就能报错
  const fabricArtifact = fabricLoader
    ? await getFabricLoaderArtifact(minecraftVersion, fabricLoader, { fetch: fabricFetch })
    : null

  /** 下载 OptiFine 安装器（缓存在启动器数据目录），返回文件路径与下载任务 */
  const optiFineDownload = (ref: OptiFineVersionRef): { path: string; task: AnyInstallTask } => {
    const path = join(
      app.getPath('userData'),
      'cache',
      'optifine',
      `OptiFine_${minecraftVersion}_${ref.type}_${ref.patch}.jar`
    )
    const task = new DownloadTask({
      url: optiFineInstallerUrl(minecraftVersion, ref.type, ref.patch),
      destination: path,
      dispatcher: options.dispatcher,
      headers: options.headers
    }).setName('downloadOptifine')
    return { path, task }
  }

  lastRequest = request
  const installAll = createTask('custom', async function () {
    await this.yield(installTask(meta, settings.gameDir, options))
    if (isPlainVanilla) return

    if (forgeVersion || neoforgeVersion) {
      // 安装器会自己下载依赖库并运行处理程序。它内部按默认版本名读取版本配置，
      // 所以先用默认名安装，完成后再复制成用户指定的名字
      const versionsDir = join(settings.gameDir, 'versions')
      const before = new Set(await readdir(versionsDir).catch(() => [] as string[]))
      const installerOptions = { ...options, java: settings.javaPath }
      const loaderTask = forgeVersion
        ? installForgeTask({ mcversion: minecraftVersion, version: forgeVersion }, settings.gameDir, {
            ...installerOptions,
            mavenHost: forgeMavenHosts(settings.downloadSource)
          })
        : installNeoForgedTask(neoforgeProject(neoforgeVersion!), neoforgeVersion!, settings.gameDir, {
            ...installerOptions,
            mavenHost: settings.downloadSource === 'bmclapi' ? [`${BMCLAPI}/maven`] : []
          })
      const loaderId = await this.yield(loaderTask)
      if (loaderId !== name) {
        const json = JSON.parse(await readFile(join(versionsDir, loaderId, `${loaderId}.json`), 'utf-8'))
        json.id = name
        await mkdir(join(versionsDir, name), { recursive: true })
        await writeFile(join(versionsDir, name, `${name}.json`), JSON.stringify(json, null, 2))
        // 默认名的版本是这次安装临时产生的，删除以免列表里出现两个相同的版本
        if (!before.has(loaderId)) {
          await rm(join(versionsDir, loaderId), { recursive: true, force: true })
        }
      }
      if (optifine) {
        // OptiFine 的安装器本身就是一个 Forge 模组，直接放进该版本使用的 mods 文件夹
        const download = optiFineDownload(optifine)
        await mkdir(dirname(download.path), { recursive: true })
        await this.yield(download.task)
        const modsDir = join(
          versionGameDir(settings.gameDir, name, isIsolated(settings.versionIsolation, 'forge')),
          'mods'
        )
        await mkdir(modsDir, { recursive: true })
        await copyFile(download.path, join(modsDir, basename(download.path)))
      }
    } else if (optifine) {
      // 用 OptiFine 安装器的补丁程序把原版本体打成 OptiFine 库
      const download = optiFineDownload(optifine)
      await mkdir(dirname(download.path), { recursive: true })
      await this.yield(download.task)
      await this.yield(
        installOptifineTask(download.path, settings.gameDir, {
          versionId: name,
          inheritsFrom: minecraftVersion,
          java: settings.javaPath
        })
      )
    } else if (fabricArtifact) {
      await installFabricByLoaderArtifact(fabricArtifact, settings.gameDir, { versionId: name })
    } else {
      // 只改名：写一个继承原版的版本配置，游戏文件与原版共用
      const now = new Date().toJSON()
      const dir = join(settings.gameDir, 'versions', name)
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, `${name}.json`),
        JSON.stringify(
          { id: name, inheritsFrom: minecraftVersion, type: meta.type, releaseTime: now, time: now, libraries: [] },
          null,
          2
        )
      )
    }
    const resolved = await Version.parse(settings.gameDir, name)
    await this.yield(installDependenciesTask(resolved, options))
  })
  runTask(name, 'install', installAll)
}

/** 重试上一次的安装请求 */
export async function retryLastInstall(): Promise<void> {
  if (!lastRequest) throw new Error('没有可以重试的安装')
  await startCustomInstall(lastRequest, true)
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
