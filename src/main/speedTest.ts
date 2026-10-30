/**
 * 百宝箱：下载源测速。分别测试官方源与国内镜像（与「下载源」设置的两个选项对应）：
 * - 游戏文件：Mojang 官方（piston-meta / piston-data） 对比 BMCLAPI
 * - 模组：Modrinth 官方（api / cdn.modrinth.com） 对比 MCIM 镜像
 * 延迟取两次小请求中较快的一次；速度为下载同一个文件前 4 MB（最多 8 秒）的平均速度。
 * 依次测试，避免互相抢带宽；请求走与下载相同的代理设置。
 */
import { getSettings } from './config'
import type { DownloadSource, SpeedTestReport, SpeedTestResult } from '../shared/types'
import { discardBody } from './network'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const MIRROR_MANIFEST = `${BMCLAPI}/mc/game/version_manifest_v2.json`
const MODRINTH_API = 'https://api.modrinth.com/v2'
const MCIM_API = 'https://mod.mcimirror.top/modrinth/v2'
const MODRINTH_CDN = 'https://cdn.modrinth.com/'
const MCIM_CDN = 'https://mod.mcimirror.top/'
/** 用来测速的模组：Fabric API（文件约 2 MB，两个源都有） */
const TEST_PROJECT = 'fabric-api'

const SAMPLE_BYTES = 4 * 1024 * 1024
const DOWNLOAD_TIMEOUT = 8000
const REQUEST_TIMEOUT = 8000
const HEADERS = { 'User-Agent': `LiuliLauncher/${__APP_VERSION__}` }

function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return '超时'
  const code = (e.cause as { code?: string } | undefined)?.code ?? ''
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '找不到服务器'
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return '连接失败'
  return e.message.slice(0, 80)
}

/** 收到响应头的时间（毫秒），取两次中较快的一次 */
async function latencyOf(url: string): Promise<number> {
  let best = Infinity
  let lastError: unknown
  for (let i = 0; i < 2; i++) {
    const start = performance.now()
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT) })
      best = Math.min(best, performance.now() - start)
      await response.body?.cancel().catch(() => undefined)
    } catch (e) {
      lastError = e
    }
  }
  if (best === Infinity) throw lastError
  return Math.round(best)
}

/** 下载文件开头的一部分，返回平均速度（字节/秒） */
async function speedOf(url: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
  let bytes = 0
  let firstByte = 0
  try {
    const response = await fetch(url, {
      headers: { ...HEADERS, Range: `bytes=0-${SAMPLE_BYTES - 1}` },
      signal: controller.signal
    })
    if (!response.ok || !response.body) throw new Error(`服务器返回 ${response.status}`)
    const reader = response.body.getReader()
    try {
      while (bytes < SAMPLE_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        if (!firstByte) firstByte = performance.now()
        bytes += value.byteLength
      }
    } catch (e) {
      // 超时：用已经收到的数据计算
      if (!controller.signal.aborted) throw e
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  const seconds = firstByte ? (performance.now() - firstByte) / 1000 : 0
  if (bytes < 64 * 1024 || seconds <= 0) throw new Error('下载太慢或没有数据')
  return Math.round(bytes / seconds)
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT) })
  if (!response.ok) {
    await discardBody(response)
    throw new Error(`服务器返回 ${response.status}`)
  }
  return (await response.json()) as T
}

/** 测一项：先测延迟，再测速度；任何一步失败都记下原因 */
async function measure(
  source: DownloadSource,
  target: SpeedTestResult['target'],
  latencyUrl: string,
  fileUrl: () => Promise<string>
): Promise<SpeedTestResult> {
  const result: SpeedTestResult = { source, target, host: new URL(latencyUrl).host, latency: null, speed: null }
  try {
    result.latency = await latencyOf(latencyUrl)
    result.speed = await speedOf(await fileUrl())
  } catch (e) {
    result.error = describeError(e)
  }
  return result
}

interface Manifest {
  latest?: { release?: string }
  versions?: { id?: string; url?: string }[]
}

/** 最新正式版的客户端 jar（官方地址）和版本号 */
async function latestClient(): Promise<{ id: string; officialUrl: string | null }> {
  let manifest: Manifest
  try {
    manifest = await getJson<Manifest>(MOJANG_MANIFEST)
  } catch {
    // 官方连不上时从镜像拿版本号，镜像测速仍然可以进行
    manifest = await getJson<Manifest>(MIRROR_MANIFEST)
    const id = manifest.latest?.release
    if (!id) throw new Error('无法读取版本列表')
    return { id, officialUrl: null }
  }
  const id = manifest.latest?.release
  const entry = manifest.versions?.find((v) => v.id === id)
  if (!id || !entry?.url) throw new Error('无法读取版本列表')
  const json = await getJson<{ downloads?: { client?: { url?: string } } }>(entry.url)
  return { id, officialUrl: json.downloads?.client?.url ?? null }
}

/** 测速用的模组文件路径（相对于 CDN） */
async function modFilePath(): Promise<string> {
  type Versions = { files?: { url?: string; primary?: boolean }[] }[]
  let versions: Versions
  try {
    versions = await getJson<Versions>(`${MODRINTH_API}/project/${TEST_PROJECT}/version`)
  } catch {
    versions = await getJson<Versions>(`${MCIM_API}/project/${TEST_PROJECT}/version`)
  }
  const files = versions[0]?.files ?? []
  const url = (files.find((f) => f.primary) ?? files[0])?.url ?? ''
  const path = url.replace(MODRINTH_CDN, '').replace(MCIM_CDN, '')
  if (!path || /^https?:/.test(path)) throw new Error('无法获取测速文件')
  return path
}

let running: Promise<SpeedTestReport> | null = null

/** 对比官方源与国内镜像的延迟和下载速度，并给出推荐 */
export function runSpeedTest(): Promise<SpeedTestReport> {
  // 测速进行中再次点击时返回同一次的结果
  running ??= (async () => {
    const { downloadSource } = await getSettings()
    const client = latestClient()
    const mod = modFilePath()
    // 先挂上处理，避免测延迟失败、没用到它们时出现未处理的异常
    client.catch(() => undefined)
    mod.catch(() => undefined)
    const fromClient = async (official: boolean): Promise<string> => {
      const info = await client
      if (official) {
        if (!info.officialUrl) throw new Error('无法连接官方源')
        return info.officialUrl
      }
      return `${BMCLAPI}/version/${encodeURIComponent(info.id)}/client`
    }
    // 依次测试，避免同时下载互相影响
    const results: SpeedTestResult[] = []
    results.push(await measure('mojang', 'game', MOJANG_MANIFEST, () => fromClient(true)))
    results.push(await measure('bmclapi', 'game', MIRROR_MANIFEST, () => fromClient(false)))
    results.push(await measure('mojang', 'mods', `${MODRINTH_API}/`, async () => MODRINTH_CDN + (await mod)))
    results.push(await measure('bmclapi', 'mods', `${MCIM_API}/`, async () => MCIM_CDN + (await mod)))
    return { results, recommended: recommend(results), current: downloadSource }
  })().finally(() => {
    running = null
  })
  return running
}

/** 游戏文件的速度权重更高（下载量大）；速度相差不到 15% 时选延迟低的 */
function recommend(results: SpeedTestResult[]): DownloadSource | null {
  const score = (source: DownloadSource): number | null => {
    const game = results.find((r) => r.source === source && r.target === 'game')?.speed ?? null
    const mods = results.find((r) => r.source === source && r.target === 'mods')?.speed ?? null
    if (game === null && mods === null) return null
    return (game ?? 0) * 2 + (mods ?? 0)
  }
  const latency = (source: DownloadSource): number =>
    results.find((r) => r.source === source && r.target === 'game')?.latency ?? Infinity
  const official = score('mojang')
  const mirror = score('bmclapi')
  if (official === null && mirror === null) return null
  if (official === null) return 'bmclapi'
  if (mirror === null) return 'mojang'
  if (Math.abs(official - mirror) <= Math.max(official, mirror) * 0.15) {
    return latency('bmclapi') <= latency('mojang') ? 'bmclapi' : 'mojang'
  }
  return official > mirror ? 'mojang' : 'bmclapi'
}
