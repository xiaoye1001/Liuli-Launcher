import { app, BrowserWindow } from 'electron'
import { MinecraftFolder, Version, type ResolvedVersion } from '@xmcl/core'
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  DownloadTask,
  getFabricLoaderArtifact,
  getLoaderArtifactListFor,
  installDependenciesTask,
  installFabricByLoaderArtifact,
  InstallJarTask,
  installAssetsTask,
  installForgeTask,
  installResolvedAssetsTask,
  installResolvedLibrariesTask,
  installNeoForgedTask,
  installOptifineTask,
  installTask,
  type Options
} from '@xmcl/installer'
import { task as createTask, TaskState, type Task } from '@xmcl/task'
import { getSettings } from './config'
import { getVersionManifest } from './versions'
import { neoforgeProject } from './neoforge'
import { optiFineInstallerUrl } from './optifine'
import { createJavaInstallTask, javaExecutable, pickJava, requirementOf } from './javaRuntime'
import { isIsolated, versionGameDir } from './isolation'
import { assertSafeId } from './versionManage'
import { isReservedName } from './services/fastDownloader'
import { setVersionConfig } from './versionConfig'
import { closeInstallDispatcher, installDispatcher } from './network'
import type { MissingFiles } from './fileCheck'
import type {
  DownloadSource,
  FabricLoaderVersion,
  InstallKind,
  InstallPhase,
  InstallStep,
  InstallRequest,
  InstallStatus,
  ModLoader,
  OptiFineVersionRef
} from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const FABRIC_META = 'https://meta.fabricmc.net'
const FABRIC_MAVEN = 'https://maven.fabricmc.net/'
const QUILT_META = 'https://meta.quiltmc.org'
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
  const leaf = path.split('.').pop() ?? ''
  if (path.includes('installJava') || path.includes('installJre')) return 'java'
  if (leaf === 'modpackOverrides' || leaf === 'modpackGameFiles') return 'unpack'
  if (leaf === 'modpackFiles' || path.includes('modpack')) return 'modpack'
  if (leaf === 'postProcessing' || path.includes('installOptifine')) return 'processing'
  if (leaf === 'asset' || leaf === 'assets' || leaf === 'assetIndex') return 'assets'
  if (leaf === 'library' || leaf === 'libraries') return 'libraries'
  if (leaf === 'jar' || leaf === 'json') return 'version'
  if (leaf === 'downloadInstaller' || path.includes('downloadOptifine') || path.includes('installForge'))
    return 'loader'
  return path.includes('dependencies') ? 'dependencies' : 'version'
}

type AnyInstallTask = Task<unknown>

/** 实际下载或解压文件的任务（任务组有 children，即使刚开始时还没有子任务也不算） */
function isLeafTask(task: Task<unknown>): boolean {
  return !Array.isArray((task as { children?: unknown[] }).children)
}

let status: InstallStatus | null = null
let currentTask: AnyInstallTask | null = null
/** 正在准备任务（获取版本信息等，还没有开始下载）：这时也不能开始另一个任务 */
let starting = false
let cancelRequested = false
/** 上一次的安装请求，用于「重试」 */
let lastRequest: InstallRequest | null = null
/** 上一次下载的 Java 组件；最近一次任务是下载 Java 时，「重试」重新下载它 */
let lastJavaComponent: string | null = null
/** 上一次安装的附加步骤（整合包），重试时一并执行 */
let lastExtra: InstallExtraStep | null = null

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('install:status', status)
  }
}

/** 进度卡片上的补充说明（例如还剩哪几个文件），下次推送进度时显示 */
export function setInstallDetail(detail: string | undefined): void {
  if (status && status.state === 'running') status.detail = detail
}

export function getInstallStatus(): InstallStatus | null {
  return status
}

export function assertIdle(): void {
  if (starting) throw new Error('正在准备另一个下载或安装任务，请稍候')
  if (status?.state === 'running') {
    throw new Error(`正在${status.kind === 'repair' ? '修复' : '安装'} ${status.versionId}，请等待完成`)
  }
}

/**
 * 准备阶段占住安装：检查空闲后立即标记，准备期间（获取版本信息等）不会有第二个任务同时开始。
 * fn 里调用 runTask 后状态变为运行中，之后由 runTask 的状态保证只有一个任务
 */
async function prepare<T>(fn: () => Promise<T>): Promise<T> {
  assertIdle()
  starting = true
  try {
    return await fn()
  } finally {
    starting = false
  }
}

/** 公共下载参数：镜像 + 共享连接池（每个服务器最多 16 个并发连接，失败自动重试） */
async function downloadOptions(): Promise<Options> {
  const settings = await getSettings()
  return {
    ...mirrorOptions(settings.downloadSource),
    dispatcher: installDispatcher(),
    headers: { 'User-Agent': 'LiuliLauncher/0.1.0' },
    throwErrorImmediately: false
  }
}

/** 运行一个安装任务，并把进度与速度推送到界面。返回的 Promise 在任务结束时完成（成功为 true，不会抛出） */
function runTask(versionId: string, kind: InstallKind, task: AnyInstallTask): Promise<boolean> {
  currentTask = task
  cancelRequested = false
  status = { versionId, kind, state: 'running', phase: 'version', progress: 0, total: 0, speed: 0 }
  broadcast()

  // 实际下载 / 解压文件的任务及其所属步骤，用于显示每个步骤的进度
  const leaves = new Map<AnyInstallTask, InstallPhase>()
  const track = (child: AnyInstallTask): void => {
    if (isLeafTask(child) && !leaves.has(child)) leaves.set(child, phaseOf(child.path))
  }
  const steps = (finished: boolean): InstallStep[] => {
    const result = new Map<InstallPhase, InstallStep>()
    for (const [leaf, phase] of leaves) {
      const step = result.get(phase) ?? { phase, progress: 0, total: 0, done: true }
      const done = finished || leaf.state === TaskState.Succeed
      const total = Math.max(leaf.total, leaf.progress, 0)
      // 已完成的任务按全部完成计算：文件已经存在、校验通过时 xmcl 不会报告下载进度
      step.progress += done ? total : Math.max(0, leaf.progress)
      step.total += total
      step.done = step.done && done
      result.set(phase, step)
    }
    return [...result.values()]
  }

  // 每 250ms 计算一次速度并推送进度，避免过于频繁地发送消息
  let bytesInWindow = 0
  let lastTick = Date.now()
  const timer = setInterval(() => {
    if (!status || status.state !== 'running') return
    const now = Date.now()
    const instant = (bytesInWindow * 1000) / Math.max(1, now - lastTick)
    // 平滑处理，避免速度数字跳动太厉害
    status.speed = status.speed === 0 ? instant : status.speed * 0.6 + instant * 0.4
    // 总进度按各步骤累加（xmcl 不会把已存在、校验通过的文件算进进度，重新安装时进度会一直很低）
    status.steps = steps(false)
    status.progress = status.steps.reduce((sum, step) => sum + step.progress, 0)
    status.total = status.steps.reduce((sum, step) => sum + step.total, 0)
    bytesInWindow = 0
    lastTick = now
    broadcast()
  }, 250)

  return task
    .startAndWait({
      // 补丁、处理程序等步骤没有下载进度，开始时就切换阶段
      onStart(child) {
        track(child)
        if (status) status.phase = phaseOf(child.path)
      },
      onUpdate(child, chunkSize) {
        // 父任务会把子任务的进度再报告一遍（一直报告到最外层），只统计真正在下载的任务，
        // 否则速度会按任务层数被重复计算，阶段也总是显示成最外层任务的「游戏本体」
        if (!isLeafTask(child)) return
        track(child)
        bytesInWindow += chunkSize
        if (status) status.phase = phaseOf(child.path)
      }
    })
    .then(() => {
      const finalSteps = steps(true)
      const total = finalSteps.reduce((sum, step) => sum + step.total, 0)
      status = { ...status!, state: 'success', progress: total, total, speed: 0, steps: finalSteps }
      return true
    })
    .catch((e: unknown) => {
      const cancelled = cancelRequested
      // 同时进行的其他步骤（例如整合包的模组下载）也停下来
      if (!cancelled) {
        closeInstallDispatcher()
        task.cancel().catch(() => undefined)
      }
      status = {
        ...status!,
        state: cancelled ? 'cancelled' : 'failed',
        speed: 0,
        error: cancelled ? undefined : describeError(e)
      }
      if (!cancelled) console.error(`${kind === 'repair' ? '修复' : '安装'}失败：`, e)
      return false
    })
    .finally(() => {
      clearInterval(timer)
      currentTask = null
      closeInstallDispatcher()
      broadcast()
    })
}

/**
 * 检查并修复已安装的版本。下载前会先校验本地文件，完好的文件会直接跳过，
 * 只重新下载缺失或损坏的文件。
 * 官方版本会连同版本 json 和游戏本体一起检查；不在官方列表中的版本（如模组加载器）只检查依赖库与资源文件。
 */
export async function startRepair(versionId: string): Promise<void> {
  assertSafeId(versionId)
  return prepare(() => repair(versionId))
}

async function repair(versionId: string): Promise<void> {
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

/**
 * 启动前补全缺失的文件：只下载检查出有问题的文件，进度显示在「下载」页。
 * 完成后返回，失败或取消时抛出错误。
 */
export async function completeMissingFiles(
  versionId: string,
  version: ResolvedVersion,
  missing: MissingFiles
): Promise<void> {
  const options = await prepare(() => downloadOptions())
  const folder = MinecraftFolder.from(version.minecraftDirectory)
  // 本体放在没有继承的版本自己的文件夹里，有继承时放在原版的文件夹里（与 xmcl 的检查一致）
  const jarId = version.inheritances.length === 1 ? version.id : version.minecraftVersion
  const task = createTask('dependencies', async function () {
    if (missing.jar && version.downloads.client) {
      await this.yield(
        new InstallJarTask(
          { ...version, id: jarId, downloads: version.downloads as Required<ResolvedVersion>['downloads'] },
          folder,
          options
        )
      )
    }
    if (missing.assetIndex) {
      await this.yield(installAssetsTask(version, options))
    } else if (missing.assets.length > 0) {
      await this.yield(installResolvedAssetsTask(missing.assets, folder, options))
    }
    if (missing.libraries.length > 0) {
      await this.yield(installResolvedLibrariesTask(missing.libraries, folder, options))
    }
  })
  const ok = await runTask(versionId, 'repair', task as AnyInstallTask)
  if (!ok) {
    throw new Error(
      status?.state === 'cancelled'
        ? '已取消补全游戏文件'
        : `补全游戏文件失败，请检查网络或切换下载源后重试（${status?.error ?? '未知错误'}）`
    )
  }
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

/** 获取某个 Minecraft 版本可用的 Quilt 加载器版本（新版本在前）；不支持的版本返回空列表 */
export async function getQuiltLoaders(minecraftVersion: string): Promise<FabricLoaderVersion[]> {
  const response = await fetch(`${QUILT_META}/v3/versions/loader/${encodeURIComponent(minecraftVersion)}`, {
    signal: AbortSignal.timeout(15000)
  })
  if (response.status === 404 || response.status === 400) return []
  if (!response.ok) throw new Error(`HTTP ${response.status}：Quilt 版本列表`)
  const list = (await response.json()) as { loader?: { version?: unknown } }[]
  if (!Array.isArray(list)) return []
  return list
    .map((item) => item?.loader?.version)
    .filter((version): version is string => typeof version === 'string')
    .map((version) => ({ version, stable: !/-(beta|alpha|pre|rc)/i.test(version) }))
}

/** Quilt 的版本配置（继承原版，列出 Quilt 需要的依赖库） */
async function getQuiltProfile(minecraftVersion: string, loader: string): Promise<Record<string, unknown>> {
  const url = `${QUILT_META}/v3/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loader)}/profile/json`
  const response = await fetchChecked(url).catch((e) => {
    throw new Error(`获取 Quilt ${loader} 失败：${e instanceof Error ? e.message : String(e)}`)
  })
  const json = (await response.json()) as Record<string, unknown>
  if (typeof json?.mainClass !== 'string' || !Array.isArray(json.libraries)) {
    throw new Error(`Quilt ${loader} 的版本配置无效`)
  }
  return json
}

/** 检查版本名是否可用作 versions 下的文件夹名 */
function validateName(name: string): void {
  if (!name) throw new Error('版本名不能为空')
  if (name.length > 64) throw new Error('版本名不能超过 64 个字符')
  // & ^ %：版本名会作为 INST_NAME 等变量交给启动前 / 退出后命令，Windows 命令行会把它们当成命令符号
  if (/[\\/:*?"<>|&^%\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..' || name !== name.trim()) {
    throw new Error('版本名不能包含 \\ / : * ? " < > | & ^ % 等字符，且首尾不能有空格')
  }
  if (name.endsWith('.') || isReservedName(name)) throw new Error('版本名不能以 . 结尾，也不能是 CON、NUL 等系统保留名')
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
/**
 * 安装完成后的附加步骤（例如整合包：下载模组、解压配置），在同一个任务中运行，进度与取消一并处理。
 * gameDir 为该版本实际使用的游戏目录（遵循版本隔离设置）
 */
export type InstallExtraStep = ((context: TaskContext, gameDir: string) => Promise<void>) & {
  /** 在安装原版之前执行（例如解压整合包自带的游戏资源，让之后的下载直接跳过） */
  before?: (context: TaskContext) => Promise<void>
}

/** 附加步骤中可以 yield 子任务，让进度计入总进度 */
export interface TaskContext {
  yield<T>(task: Task<T>): Promise<T>
}

export async function startCustomInstall(
  request: InstallRequest,
  allowExisting = false,
  extra?: InstallExtraStep
): Promise<void> {
  return prepare(() => customInstall(request, allowExisting, extra))
}

/** OptiFine 的类型和补丁名来自镜像服务器，会拼进文件名，只允许字母、数字、下划线、点和横线 */
const OPTIFINE_PART = /^[A-Za-z0-9_.-]{1,64}$/

/**
 * 游戏和加载器的版本号会拼进下载地址和依赖库的文件路径（例如 forge-<版本>-installer.jar），
 * 整合包里写的版本号也会走到这里：只允许普通的版本号字符，防止 ../、# 等让下载地址或文件路径跑到别处
 */
const VERSION_PART = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/

function checkVersionPart(label: string, value: string | undefined): void {
  if (value !== undefined && !VERSION_PART.test(value)) throw new Error(`${label}版本号格式不对：${value.slice(0, 80)}`)
}

/** Forge 安装器在 Maven 上的版本名（与 @xmcl/installer 的规则相同） */
function forgeArtifactVersion(mc: string, forge: string): string {
  const minor = Number.parseInt(mc.split('.')[1] ?? '', 10)
  if (minor >= 7 && minor <= 8) return `${mc}-${forge}-${mc}`
  if (forge.startsWith(mc)) return forge
  return `${mc}-${forge}`
}

/**
 * 通过 HTTPS 取得 Forge 安装器的官方 SHA-1。安装库内部会把明文 HTTP 的旧 Forge 地址作为最后的备用地址，
 * 有了校验值，即使下载被换成别的文件也会被发现（安装器会在安装时运行，必须保证是官方文件）
 */
async function forgeInstallerSha1(mc: string, forge: string): Promise<{ path: string; sha1: string } | undefined> {
  if (mc.startsWith('1.4.')) return undefined
  const artifact = forgeArtifactVersion(mc, forge)
  const path = `net/minecraftforge/forge/${artifact}/forge-${artifact}-installer.jar`
  for (const host of [FORGE_MAVEN.replace(/\/$/, ''), `${BMCLAPI}/maven`]) {
    try {
      const response = await fetch(`${host}/${path}.sha1`, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) continue
      const sha1 = (await response.text()).trim().slice(0, 40).toLowerCase()
      if (/^[0-9a-f]{40}$/.test(sha1)) return { path, sha1 }
    } catch {
      // 换下一个地址
    }
  }
  console.warn(`无法取得 Forge ${artifact} 安装器的校验值，只检查文件格式`)
  return undefined
}

async function customInstall(request: InstallRequest, allowExisting: boolean, extra?: InstallExtraStep): Promise<void> {
  const { minecraftVersion, fabricLoader, quiltLoader, forgeVersion, neoforgeVersion, optifine } = request
  const name = request.name
  validateName(name)
  if ([fabricLoader, quiltLoader, forgeVersion, neoforgeVersion].filter(Boolean).length > 1) {
    throw new Error('Fabric、Quilt、Forge、NeoForge 只能选择其中一个')
  }
  if (optifine && (fabricLoader || quiltLoader || neoforgeVersion)) {
    throw new Error('OptiFine 只能单独安装或与 Forge 一起安装')
  }
  if (optifine && !(OPTIFINE_PART.test(optifine.type) && OPTIFINE_PART.test(optifine.patch))) {
    throw new Error('OptiFine 版本信息无效')
  }
  checkVersionPart('Minecraft ', minecraftVersion)
  checkVersionPart('Fabric ', fabricLoader)
  checkVersionPart('Quilt ', quiltLoader)
  checkVersionPart('Forge ', forgeVersion)
  checkVersionPart('NeoForge ', neoforgeVersion)

  const settings = await getSettings()
  /**
   * 版本实际使用的游戏目录。整合包始终使用独立的文件夹（versions/<版本名>），
   * 不会把整合包的存档、配置解压到公共目录覆盖已有的文件
   */
  const gameDirFor = (loader: ModLoader | undefined): string =>
    versionGameDir(settings.gameDir, name, extra ? true : isIsolated(settings.versionIsolation, loader))
  const javaUser = forgeVersion ? 'Forge' : neoforgeVersion ? 'NeoForge' : optifine ? 'OptiFine' : ''
  if (javaUser && !settings.javaAuto && !settings.javaPath) {
    throw new Error(`安装 ${javaUser} 需要运行 Java，请先到「设置」页选择 Java，或开启「自动选择 Java」`)
  }
  const isPlainVanilla =
    !extra &&
    !fabricLoader &&
    !quiltLoader &&
    !forgeVersion &&
    !neoforgeVersion &&
    !optifine &&
    name === minecraftVersion
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
  const quiltProfile = quiltLoader ? await getQuiltProfile(minecraftVersion, quiltLoader) : null

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
  lastExtra = extra ?? null
  lastJavaComponent = null
  const installAll = createTask('custom', async function () {
    if (extra?.before) await extra.before(this)
    const loader = forgeVersion
      ? 'forge'
      : neoforgeVersion
        ? 'neoforge'
        : fabricLoader
          ? 'fabric'
          : quiltLoader
            ? 'quilt'
            : undefined
    // 安装游戏本体与模组加载器（箭头函数里的 this 仍是这个任务）
    const installGame = async (): Promise<void> => {
      await this.yield(installTask(meta, settings.gameDir, options))
      if (isPlainVanilla) return

      // 运行安装程序用的 Java：自动模式下按该 Minecraft 版本的要求挑选，没有合适的就先下载
      let javaPath = settings.javaPath
      if (javaUser && settings.javaAuto) {
        const requirement = requirementOf(await Version.parse(settings.gameDir, minecraftVersion))
        const found = await pickJava(requirement)
        if (found) {
          javaPath = found.path
        } else {
          await this.yield(await createJavaInstallTask(requirement.component))
          javaPath = javaExecutable(requirement.component)
        }
      }

      if (forgeVersion || neoforgeVersion) {
        // 安装器会自己下载依赖库并运行处理程序。它内部按默认版本名读取版本配置，
        // 所以先用默认名安装，完成后再复制成用户指定的名字
        const versionsDir = join(settings.gameDir, 'versions')
        const before = new Set(await readdir(versionsDir).catch(() => [] as string[]))
        const installerOptions = { ...options, java: javaPath }
        const forgeInstaller = forgeVersion ? await forgeInstallerSha1(minecraftVersion, forgeVersion) : undefined
        const loaderTask = forgeVersion
          ? installForgeTask(
              { mcversion: minecraftVersion, version: forgeVersion, installer: forgeInstaller },
              settings.gameDir,
              {
                ...installerOptions,
                mavenHost: forgeMavenHosts(settings.downloadSource)
              }
            )
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
          const modsDir = join(gameDirFor('forge'), 'mods')
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
            java: javaPath
          })
        )
      } else if (fabricArtifact) {
        await installFabricByLoaderArtifact(fabricArtifact, settings.gameDir, { versionId: name })
      } else if (quiltProfile) {
        const dir = join(settings.gameDir, 'versions', name)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, `${name}.json`), JSON.stringify({ ...quiltProfile, id: name }, null, 2))
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
      // 资源文件与原版相同，安装原版时已经下载并校验过；这里只补充加载器自己的依赖库。
      // 如果再检查一遍全部依赖，几千个资源文件会被重复计算进总大小，也会再算一遍哈希
      const vanilla = await Version.parse(settings.gameDir, minecraftVersion)
      if (resolved.assets !== vanilla.assets) {
        await this.yield(installDependenciesTask(resolved, options))
      } else {
        const vanillaLibs = new Set(vanilla.libraries.map((l) => l.download.path))
        const loaderLibs = resolved.libraries.filter((l) => !vanillaLibs.has(l.download.path))
        if (loaderLibs.length > 0) {
          await this.yield(installResolvedLibrariesTask(loaderLibs, settings.gameDir, options))
        }
      }
    }
    // 整合包的文件与游戏本体、模组加载器同时下载（与 PCL 等启动器相同），不用等前面全部装完
    await Promise.all([installGame(), extra ? extra(this, gameDirFor(loader)) : null])
    // 整合包：记录为独立文件夹，以后修改全局的版本隔离设置也不影响它
    if (extra) await setVersionConfig(name, { isolation: 'on' })
  })
  runTask(name, 'install', installAll)
}

/**
 * 下载 Java 运行时（设置页手动下载，或启动、安装时自动下载）。
 * 返回下载好的 java 路径；失败或取消时抛出错误。
 */
export async function startJavaInstall(component: string): Promise<string> {
  const label = `Java ${JAVA_MAJOR[component] ?? component}`
  const javaTask = await prepare(() => createJavaInstallTask(component))
  // 任务真正开始后才记录，准备失败时不影响「重试」上一次的安装
  lastJavaComponent = component
  const ok = await runTask(label, 'java', javaTask as AnyInstallTask)
  if (!ok)
    throw new Error(status?.state === 'cancelled' ? `已取消下载 ${label}` : `${label} 下载失败：${status?.error ?? ''}`)
  return javaExecutable(component)
}

const JAVA_MAJOR: Record<string, number> = {
  'jre-legacy': 8,
  'java-runtime-alpha': 16,
  'java-runtime-beta': 17,
  'java-runtime-gamma': 17,
  'java-runtime-delta': 21,
  'java-runtime-epsilon': 25
}

/** 重试上一次的安装请求 */
export async function retryLastInstall(): Promise<void> {
  if (lastJavaComponent) {
    // 下载在后台进行，进度通过 install:status 推送，这里不等待完成
    startJavaInstall(lastJavaComponent).catch(() => undefined)
    return
  }
  if (!lastRequest) throw new Error('没有可以重试的安装')
  await startCustomInstall(lastRequest, true, lastExtra ?? undefined)
}

/** 取消当前安装 */
export async function cancelInstall(): Promise<void> {
  if (!currentTask) return
  cancelRequested = true
  // 先关闭这次安装的连接池：所有正在进行的下载立即中断，
  // 即使某个下载任务没有及时响应取消，也不会在后台继续下载
  closeInstallDispatcher()
  // 最多等待 3 秒让任务结束
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
