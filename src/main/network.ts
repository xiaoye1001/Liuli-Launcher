import { session } from 'electron'
import { Agent, interceptors, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici'
import { getSettings } from './config'
import type { NetworkCheck } from '../shared/types'

export const DEFAULT_THREADS = 16
const MAX_THREADS = 64

/** 检查代理地址：只支持 HTTP / HTTPS 代理，例如 http://127.0.0.1:7890 */
export function validateProxyUrl(text: string): string {
  const value = text.trim()
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`)
  } catch {
    throw new Error('代理地址格式不对，例如 http://127.0.0.1:7890')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 HTTP 代理（地址以 http:// 开头），SOCKS 代理请改用代理软件提供的 HTTP 端口')
  }
  if (!url.hostname) throw new Error('代理地址缺少主机名，例如 http://127.0.0.1:7890')
  return url.href.replace(/\/$/, '')
}

function clampThreads(value: number): number {
  return Number.isInteger(value) ? Math.min(MAX_THREADS, Math.max(1, value)) : DEFAULT_THREADS
}

/** 系统代理：用 Chromium 解析（支持 PAC），只取 HTTP 代理，SOCKS 或直连时返回 null */
async function systemProxy(): Promise<string | null> {
  const rule = await session.defaultSession.resolveProxy('https://piston-meta.mojang.com/').catch(() => 'DIRECT')
  for (const part of rule.split(';')) {
    const match = /^\s*(PROXY|HTTPS)\s+(\S+)/i.exec(part)
    if (match) return `${match[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${match[2]}`
  }
  return null
}

function withRetry(base: Dispatcher): Dispatcher {
  return base.compose(interceptors.retry({ maxRetries: 3 }), interceptors.redirect({ maxRedirections: 5 }))
}

let downloads: Dispatcher = withRetry(
  new Agent({ connections: DEFAULT_THREADS, headersTimeout: 15_000, bodyTimeout: 20_000 })
)
/** 新建连接池用的设置（应用网络设置时更新） */
let downloadConfig: { uri: string | null; connections: number } = { uri: null, connections: DEFAULT_THREADS }
/** 当前安装任务专用的连接池；取消安装时整体关闭，正在进行的下载会立即停止 */
let installPool: { base: Agent | ProxyAgent; dispatcher: Dispatcher } | null = null

/**
 * 下载连接的超时：服务器 15 秒没有响应、或者 20 秒没有传来任何数据，就算失败，
 * 换下一个下载地址（例如镜像卡住时换官方地址）。默认要等 5 分钟，镜像限速时下载会长时间停在 0 B/s
 */
const DOWNLOAD_TIMEOUTS = { headersTimeout: 15_000, bodyTimeout: 20_000 }

function newPool(): { base: Agent | ProxyAgent; dispatcher: Dispatcher } {
  const { uri, connections } = downloadConfig
  const base = uri
    ? new ProxyAgent({ uri, connections, ...DOWNLOAD_TIMEOUTS })
    : new Agent({ connections, ...DOWNLOAD_TIMEOUTS })
  return { base, dispatcher: withRetry(base) }
}

/**
 * 高速下载引擎专用的连接池：保留代理、重定向和超时，但不自动重试。
 * 引擎自己控制重试次数；自动重试会按服务器要求等待（例如 429 时等 30 秒）再重试三次，
 * 遇到限流的镜像时会让下载看起来卡住很久才改用原下载方式
 */
function newFastPool(): Dispatcher {
  const { uri, connections } = downloadConfig
  const base = uri
    ? new ProxyAgent({ uri, connections, ...DOWNLOAD_TIMEOUTS })
    : new Agent({ connections, ...DOWNLOAD_TIMEOUTS })
  return base.compose(interceptors.redirect({ maxRedirections: 5 }))
}
let fastPool: Dispatcher = newFastPool()

export function fastDownloadDispatcher(): Dispatcher {
  return fastPool
}

/** 安装任务（安装版本、整合包、修复、下载 Java）使用的连接池 */
export function installDispatcher(): Dispatcher {
  if (!installPool) installPool = newPool()
  return installPool.dispatcher
}

/** 关闭安装任务的连接池：取消时调用，所有还在进行的下载立即中断；任务结束后也会调用以释放连接 */
export function closeInstallDispatcher(): void {
  const pool = installPool
  installPool = null
  pool?.base.destroy().catch(() => undefined)
}
/** 当前使用的代理（用于界面显示），null 为直连 */
let activeProxy: string | null = null

/** 下载文件用的连接池：每个服务器的同时连接数按设置，失败自动重试 */
export function downloadDispatcher(): Dispatcher {
  return downloads
}

export function currentProxy(): string | null {
  return activeProxy
}

/** Chromium 的代理规则不支持用户名密码，只保留协议、主机和端口 */
function chromiumProxyRule(uri: string): string {
  const url = new URL(uri)
  return `${url.protocol}//${url.host}`
}

/**
 * 按设置应用下载线程数与代理：
 * 下载文件、主进程的 fetch（版本列表、Modrinth 等）和界面（图片等）都走同一个代理。
 * 启动时和修改相关设置后调用。
 */
export async function applyNetworkSettings(): Promise<void> {
  const settings = await getSettings()
  let custom: string | null = null
  if (settings.proxyMode === 'custom' && settings.proxyUrl.trim()) {
    try {
      custom = validateProxyUrl(settings.proxyUrl)
    } catch (e) {
      console.error('代理设置无效，改为直连：', e)
    }
  }
  // 先设置界面（Chromium）的代理；系统代理要在切换到 system 模式之后才能解析出来
  await session.defaultSession
    .setProxy(
      settings.proxyMode === 'system'
        ? { mode: 'system' }
        : custom
          ? { proxyRules: chromiumProxyRule(custom) }
          : { mode: 'direct' }
    )
    .catch((e) => console.error('设置界面代理失败：', e))
  const uri = settings.proxyMode === 'system' ? await systemProxy() : custom
  const connections = clampThreads(settings.downloadThreads)
  // 已经在进行的下载继续使用旧的连接池，不主动关闭
  downloadConfig = { uri, connections }
  downloads = newPool().dispatcher
  fastPool = newFastPool()
  setGlobalDispatcher(uri ? new ProxyAgent({ uri }) : new Agent())
  activeProxy = uri
}

const CHECK_TARGETS: { name: string; url: string }[] = [
  { name: 'BMCLAPI 镜像', url: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json' },
  { name: 'Mojang 官方', url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json' },
  { name: 'Modrinth', url: 'https://api.modrinth.com/v2/' },
  { name: '微软登录', url: 'https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration' }
]

/** 把常见的网络错误转成中文 */
function describeNetworkError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  if (e.name === 'TimeoutError') return '超时'
  const cause = e.cause as (Error & { code?: string }) | undefined
  const code = cause?.code ?? ''
  const message = cause?.message || e.message
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '找不到服务器（域名解析失败）'
  if (code === 'ECONNREFUSED') return activeProxy ? '无法连接代理，请确认代理软件已打开' : '连接被拒绝'
  if (code === 'ECONNRESET') return '连接被中断'
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return '连接超时'
  if (/cancel|aborted/i.test(message) && activeProxy) return '代理无法连接到这个服务器'
  if (/certificate|self.signed/i.test(message)) return '证书错误'
  return message
}

/** 测试几个常用服务器能否连接（收到任何 HTTP 响应都算连通） */
export async function checkNetwork(): Promise<NetworkCheck> {
  const results = await Promise.all(
    CHECK_TARGETS.map(async ({ name, url }) => {
      const start = Date.now()
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
        await response.body?.cancel().catch(() => undefined)
        return { name, ok: true, ms: Date.now() - start, status: response.status }
      } catch (e) {
        const error = describeNetworkError(e)
        return { name, ok: false, ms: Date.now() - start, error }
      }
    })
  )
  return { proxy: activeProxy ? activeProxy.replace(/\/\/[^@/]*@/, '//***@') : null, results }
}
