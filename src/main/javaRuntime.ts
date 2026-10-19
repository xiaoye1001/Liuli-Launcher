import { app } from 'electron'
import { installJavaRuntimeTask, type JavaRuntimeManifest, type JavaRuntimes } from '@xmcl/installer'
import { task as createTask, type Task } from '@xmcl/task'
import { chmod, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { resolveJava, scanJava } from './java'
import { installDispatcher } from './network'
import type { JavaInfo, JavaRuntimeInfo } from '../shared/types'

/**
 * 启动器下载的 Java 运行环境：使用 Mojang 官方启动器同款的 Java 运行时（java-runtime-*），
 * 保存在 <用户数据目录>/runtime/<组件名>，选择 BMCLAPI 下载源时走镜像。
 */
export const RUNTIME_DIR = join(app.getPath('userData'), 'runtime')

const RUNTIME_INDEX =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const BMCLAPI_HOST = 'bmclapi2.bangbang93.com'

/** 设置页提供下载的 Java（按主版本号） */
const COMPONENTS: { component: string; majorVersion: number }[] = [
  { component: 'jre-legacy', majorVersion: 8 },
  { component: 'java-runtime-gamma', majorVersion: 17 },
  { component: 'java-runtime-delta', majorVersion: 21 },
  { component: 'java-runtime-epsilon', majorVersion: 25 }
]

/** 没有写明组件的旧版本 json，按主版本号推断 */
export function componentForMajor(major: number): string {
  if (major >= 25) return 'java-runtime-epsilon'
  if (major >= 21) return 'java-runtime-delta'
  if (major >= 17) return 'java-runtime-gamma'
  if (major >= 16) return 'java-runtime-alpha'
  return 'jre-legacy'
}

/** 游戏版本对 Java 的要求 */
export interface JavaRequirement {
  majorVersion: number
  component: string
}

export function requirementOf(version: {
  javaVersion?: { majorVersion?: number; component?: string }
}): JavaRequirement {
  const majorVersion = version.javaVersion?.majorVersion ?? 8
  return { majorVersion, component: version.javaVersion?.component ?? componentForMajor(majorVersion) }
}

/** 当前系统在 Mojang Java 运行时索引中的平台名 */
function platformKey(): keyof JavaRuntimes {
  const { platform, arch } = process
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return arch === 'ia32' ? 'linux-i386' : 'linux'
}

/** 运行时中 java 可执行文件的路径 */
export function javaExecutable(component: string): string {
  if (process.platform === 'win32') return join(RUNTIME_DIR, component, 'bin', 'java.exe')
  if (process.platform === 'darwin')
    return join(RUNTIME_DIR, component, 'jre.bundle', 'Contents', 'Home', 'bin', 'java')
  return join(RUNTIME_DIR, component, 'bin', 'java')
}

/** 下载完成的标记文件：只有完整下载过的运行时才会被使用 */
function markerOf(component: string): string {
  return join(RUNTIME_DIR, component, '.liuli-installed')
}

async function useMirror(): Promise<boolean> {
  return (await getSettings()).downloadSource === 'bmclapi'
}

/** 依次尝试镜像与官方地址 */
async function fetchJson<T>(url: string): Promise<T> {
  const urls = (await useMirror()) ? [url.replace(/^https:\/\/[^/]+/, `https://${BMCLAPI_HOST}`), url] : [url]
  let lastError: unknown
  for (const candidate of urls) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as T
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(`获取 Java 列表失败：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

let indexCache: Promise<JavaRuntimes> | null = null

function fetchIndex(): Promise<JavaRuntimes> {
  if (!indexCache) {
    indexCache = fetchJson<JavaRuntimes>(RUNTIME_INDEX).catch((e) => {
      indexCache = null
      throw e
    })
  }
  return indexCache
}

async function isInstalled(component: string): Promise<boolean> {
  return readFile(markerOf(component), 'utf-8')
    .then(() => true)
    .catch(() => false)
}

/** 设置页显示的可下载 Java 列表（只列出当前系统有提供的版本） */
export async function listJavaRuntimes(): Promise<JavaRuntimeInfo[]> {
  const targets = (await fetchIndex())[platformKey()] ?? {}
  const result: JavaRuntimeInfo[] = []
  for (const { component, majorVersion } of COMPONENTS) {
    const target = targets[component]?.[0]
    if (!target) continue
    result.push({ component, majorVersion, version: target.version.name, installed: await isInstalled(component) })
  }
  return result
}

/**
 * 创建下载某个 Java 运行时的任务。下载完成后补上可执行权限与符号链接
 * （xmcl 只负责下载文件），最后写入完成标记。
 */
export async function createJavaInstallTask(component: string): Promise<Task<string>> {
  const target = (await fetchIndex())[platformKey()]?.[component]?.[0]
  if (!target) throw new Error(`当前系统没有可下载的 ${component}`)
  const files = (await fetchJson<{ files: JavaRuntimeManifest['files'] }>(target.manifest.url)).files
  const manifest: JavaRuntimeManifest = { target: component, files, version: target.version }
  const destination = join(RUNTIME_DIR, component)
  const mirror = await useMirror()

  return createTask('installJava', async function () {
    await rm(markerOf(component), { force: true })
    await mkdir(destination, { recursive: true })
    await this.yield(
      installJavaRuntimeTask({
        destination,
        manifest,
        apiHost: mirror ? [BMCLAPI_HOST] : undefined,
        dispatcher: installDispatcher(),
        throwErrorImmediately: false
      })
    )
    if (process.platform !== 'win32') {
      for (const [file, entry] of Object.entries(files)) {
        const path = join(destination, file)
        if (entry.type === 'file' && entry.executable) await chmod(path, 0o755)
        if (entry.type === 'link') {
          await mkdir(dirname(path), { recursive: true })
          await symlink(entry.target, path).catch(() => undefined)
        }
      }
    }
    const java = javaExecutable(component)
    if (!(await resolveJava(java))) throw new Error('Java 下载完成，但无法运行，请在「设置 → 启动」中重新下载')
    await writeFile(markerOf(component), target.version.name)
    return java
  })
}

/** 已下载的运行时，供扫描 Java 时一并列出 */
export async function downloadedJavaPaths(): Promise<string[]> {
  const paths: string[] = []
  for (const { component } of [
    ...COMPONENTS,
    { component: 'java-runtime-alpha' },
    { component: 'java-runtime-beta' }
  ]) {
    if (await isInstalled(component)) paths.push(javaExecutable(component))
  }
  return paths
}

/**
 * 按版本要求挑选 Java：
 * 1. 优先使用启动器下载的对应运行时；
 * 2. 其次是本机主版本号完全一致的 Java；
 * 3. 要求 Java 8 的老版本只用 Java 8（高版本 Java 会让老版本 Forge 等崩溃），
 *    其他版本可以使用更高的版本，选最接近的一个。
 */
export async function pickJava(requirement: JavaRequirement): Promise<JavaInfo | null> {
  if (await isInstalled(requirement.component)) {
    const own = await resolveJava(javaExecutable(requirement.component))
    if (own) return own
  }
  const all = await scanJava()
  const exact = all.find((j) => j.majorVersion === requirement.majorVersion)
  if (exact) return exact
  if (requirement.majorVersion <= 8) return null
  const newer = all
    .filter((j) => j.majorVersion > requirement.majorVersion)
    .sort((a, b) => a.majorVersion - b.majorVersion)
  return newer[0] ?? null
}
