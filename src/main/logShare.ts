import { open, stat } from 'fs/promises'
import { homedir, userInfo } from 'os'
import { dirname, join } from 'path'
import { getCrashFiles } from './crashReport'
import { getGameLogs } from './launch'
import { modsContextOf } from './mods'
import type { SharedLog } from '../shared/types'

/**
 * 把日志上传到 mclo.gs（Minecraft 日志分享网站，会自动分析常见问题），返回公开链接。
 * 上传前在本地去掉访问令牌和用户文件夹路径；mclo.gs 自己也会过滤 IP 地址等信息
 */
const API = 'https://api.mclo.gs/1/log'
/** mclo.gs 的限制：最多 10 MiB、25000 行，超出的部分只保留末尾 */
const MAX_LINES = 25_000
const MAX_BYTES = 10 * 1024 * 1024 - 64 * 1024

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 去掉日志里的敏感信息：登录令牌、用户文件夹路径（里面通常有电脑的用户名） */
export function sanitizeLog(text: string): string {
  let result = text
    // 启动参数和各种格式里的访问令牌
    .replace(/(--(?:accessToken|session)\s+)\S+/gi, '$1***')
    .replace(/((?:access_?token|session_?id|client_?token)["']?\s*[:=]\s*["']?)[^"'\s,;}]+/gi, '$1***')
    // 旧版本游戏会打印「Session ID is token:<令牌>:<uuid>」
    .replace(/(token:)[A-Za-z0-9._-]{16,}/g, '$1***')
    // JWT 格式的令牌（微软 / Minecraft 登录令牌）
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '***')
  const home = homedir()
  if (home && home.length > 3) {
    // 同时处理 \ 和 / 两种写法
    const pattern = escapeRegExp(home).replace(/\\\\|\//g, '[\\\\/]')
    result = result.replace(new RegExp(pattern, process.platform === 'win32' ? 'gi' : 'g'), '~')
  }
  const user = (() => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
  })()
  if (user.length >= 3) {
    // 其他位置的用户文件夹，例如 C:\Users\<用户名>、/home/<用户名>
    const name = escapeRegExp(user)
    result = result.replace(new RegExp(`([\\\\/](?:Users|home)[\\\\/])${name}(?=[\\\\/]|$)`, 'gim'), '$1<user>')
  }
  return result
}

/** 只保留末尾的部分，满足 mclo.gs 的大小限制 */
function fitLimits(text: string): string {
  let lines = text.split(/\r?\n/)
  let cut = false
  if (lines.length > MAX_LINES) {
    lines = lines.slice(-MAX_LINES)
    cut = true
  }
  let result = lines.join('\n')
  while (Buffer.byteLength(result) > MAX_BYTES) {
    result = result.slice(Math.floor(result.length / 10))
    cut = true
  }
  return cut ? `[日志太长，只上传了最后的部分]\n${result.slice(result.indexOf('\n') + 1)}` : result
}

async function upload(label: string, content: string): Promise<SharedLog> {
  const body = new URLSearchParams({ content: fitLimits(sanitizeLog(content)) })
  let response: Response
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `LiuliLauncher/${__APP_VERSION__}`
      },
      body,
      signal: AbortSignal.timeout(30_000)
    })
  } catch (e) {
    throw new Error(`无法连接 mclo.gs：${e instanceof Error ? e.message : String(e)}`)
  }
  const result = (await response.json().catch(() => null)) as { success?: boolean; url?: string; error?: string } | null
  if (!response.ok || !result?.success) {
    throw new Error(`mclo.gs 上传失败：${result?.error ?? `HTTP ${response.status}`}`)
  }
  // 只接受 mclo.gs 的 https 链接
  if (!result.url || !/^https:\/\/mclo\.gs\/[A-Za-z0-9]+$/.test(result.url)) {
    throw new Error('mclo.gs 返回的链接无效')
  }
  return { label, url: result.url }
}

/** 读取文件末尾（最多 10 MB） */
async function readTail(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, MAX_BYTES)
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, size - length)
    return buf.toString('utf-8')
  } finally {
    await handle.close()
  }
}

/** 分享启动器收集的游戏输出（日志窗口里显示的内容） */
export async function shareGameLog(): Promise<SharedLog[]> {
  const lines = getGameLogs()
  if (lines.length === 0) throw new Error('还没有日志，启动游戏后再分享')
  return [await upload('游戏日志', lines.join('\n'))]
}

/** 分享最近一次崩溃的游戏输出和崩溃报告 */
export async function shareCrashLogs(): Promise<SharedLog[]> {
  const crash = getCrashFiles()
  if (!crash) throw new Error('没有可以分享的崩溃信息')
  const results: SharedLog[] = []
  if (crash.logs.length > 0) results.push(await upload('游戏日志', crash.logs.join('\n')))
  if (crash.crashReport) results.push(await upload('崩溃报告', await readTail(crash.crashReport)))
  if (results.length === 0) throw new Error('没有可以分享的日志')
  return results
}

/** 分享某个版本最近一次运行的日志（logs/latest.log），启动器重启过也能找到 */
export async function shareLatestLog(versionId: string): Promise<SharedLog[]> {
  const gamePath = dirname((await modsContextOf(versionId)).dir)
  const path = join(gamePath, 'logs', 'latest.log')
  if (!(await stat(path).catch(() => null))?.isFile()) {
    throw new Error(`${versionId} 还没有运行日志，先启动一次游戏`)
  }
  return [await upload(`${versionId} 最近一次运行的日志`, await readTail(path))]
}
