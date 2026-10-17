import { app, shell } from 'electron'
import type { UpdateInfo } from '../shared/types'

const REPO = 'xiaoye1001/Liuli-Launcher'
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
const TIMEOUT = 10000

interface GithubRelease {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
  assets?: { name?: string; size?: number; browser_download_url?: string }[]
}

/** 最近一次检查到的下载地址（打开链接时只使用这里记录的地址） */
let lastLinks: { page: string; asset: string } | null = null

/** 版本号比较：1.2.10 > 1.2.9；忽略开头的 v 和 - 之后的预发布标记 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/** 从发布的文件中挑出适合本机的安装包 */
export function pickAsset(
  names: string[],
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  portable = !!process.env.PORTABLE_EXECUTABLE_DIR
): string | undefined {
  const find = (re: RegExp): string | undefined => names.find((n) => re.test(n))
  if (platform === 'win32') return portable ? find(/Portable.*\.exe$/i) : find(/Setup.*\.exe$/i)
  if (platform === 'darwin') return find(arch === 'arm64' ? /-arm64\.dmg$/i : /-x64\.dmg$/i) ?? find(/\.dmg$/i)
  if (platform === 'linux') return find(/\.AppImage$/i)
  return undefined
}

/** 只允许打开 GitHub 上的地址 */
function isGithubUrl(url: string | undefined): url is string {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'github.com' || hostname.endsWith('.github.com'))
  } catch {
    return false
  }
}

/** 查询 GitHub 上的最新正式版 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  let release: GithubRelease
  try {
    const response = await fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `LiuliLauncher/${__APP_VERSION__}` },
      signal: controller.signal
    })
    if (response.status === 404) throw new Error('还没有发布过正式版本')
    if (response.status === 403 || response.status === 429) throw new Error('检查太频繁，请稍后再试')
    if (!response.ok) throw new Error(`GitHub 返回错误（${response.status}）`)
    release = (await response.json()) as GithubRelease
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('连接 GitHub 超时，请检查网络')
    if (e instanceof TypeError) throw new Error('无法连接 GitHub，请检查网络')
    throw e
  } finally {
    clearTimeout(timer)
  }

  const current = __APP_VERSION__
  const latest = (release.tag_name ?? '').replace(/^v/i, '')
  if (!latest) throw new Error('无法读取最新版本信息')
  const assets = (release.assets ?? []).filter((a) => a.name && isGithubUrl(a.browser_download_url))
  const assetName = pickAsset(assets.map((a) => a.name!)) ?? ''
  const asset = assets.find((a) => a.name === assetName)
  const page = isGithubUrl(release.html_url) ? release.html_url : `https://github.com/${REPO}/releases/latest`
  lastLinks = { page, asset: asset?.browser_download_url ?? page }
  return {
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    name: (release.name ?? '').slice(0, 100) || `v${latest}`,
    notes: (release.body ?? '').slice(0, 20000),
    publishedAt: release.published_at ?? '',
    assetName,
    assetSize: asset?.size ?? 0
  }
}

/** 在浏览器中打开下载地址或发布页面 */
export async function openUpdateLink(kind: 'asset' | 'page'): Promise<void> {
  const url = kind === 'asset' ? lastLinks?.asset : lastLinks?.page
  await shell.openExternal(url ?? `https://github.com/${REPO}/releases/latest`)
}
