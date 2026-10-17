import { app } from 'electron'
import { createHash } from 'crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'

/** authlib-injector：让游戏使用外置登录服务器。BMCLAPI 镜像优先，失败时使用官方地址 */
const SOURCES = [
  'https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/latest.json',
  'https://authlib-injector.yushi.moe/artifact/latest.json'
]
const DIR = join(app.getPath('userData'), 'authlib-injector')

interface Artifact {
  version: string
  download_url: string
  checksums?: { sha256?: string }
}

async function fetchJson(url: string): Promise<Artifact> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`${response.status}`)
  return (await response.json()) as Artifact
}

/** 已下载的最新版本 */
async function cachedJar(): Promise<string | undefined> {
  const names = (await readdir(DIR).catch(() => [] as string[])).filter((n) => /^authlib-injector-.+\.jar$/.test(n))
  names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return names.length ? join(DIR, names[names.length - 1]) : undefined
}

/** 返回 authlib-injector 的路径，没有或有新版本时自动下载 */
export async function ensureAuthlibInjector(log: (message: string) => void): Promise<string> {
  let lastError: unknown
  for (const source of SOURCES) {
    try {
      const artifact = await fetchJson(source)
      if (!/^[\w.-]+$/.test(artifact.version)) throw new Error('版本号格式不正确')
      const path = join(DIR, `authlib-injector-${artifact.version}.jar`)
      if (await stat(path).catch(() => null)) return path
      log(`正在下载 authlib-injector ${artifact.version}`)
      const response = await fetch(artifact.download_url, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error(`下载失败（${response.status}）`)
      const data = Buffer.from(await response.arrayBuffer())
      const expected = artifact.checksums?.sha256
      if (expected && createHash('sha256').update(data).digest('hex') !== expected.toLowerCase()) {
        throw new Error('文件校验失败')
      }
      await mkdir(DIR, { recursive: true })
      await writeFile(`${path}.tmp`, data)
      await rename(`${path}.tmp`, path)
      return path
    } catch (e) {
      lastError = e
    }
  }
  // 联网失败时使用之前下载的版本
  const cached = await cachedJar()
  if (
    cached &&
    (await readFile(cached)
      .then((b) => b.length > 0)
      .catch(() => false))
  )
    return cached
  throw new Error(
    `无法下载外置登录需要的 authlib-injector：${lastError instanceof Error ? lastError.message : lastError}`
  )
}
