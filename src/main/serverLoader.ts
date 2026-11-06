/**
 * 一键开服的服务端类型：默认是原版 server.jar；装了 Fabric 后用 Fabric 的服务端启动器
 * （fabric-server-launch.jar，它会用同一个文件夹里校验过的 server.jar 启动）
 */
import { readFile, stat } from 'fs/promises'
import { join } from 'path'

export const FABRIC_JAR = 'fabric-server-launch.jar'
export const LOADER_FILE = 'liuli-loader.json'

export interface ServerLoaderInfo {
  loader: 'fabric'
  version: string
}

export async function serverLoaderOf(dir: string): Promise<ServerLoaderInfo | null> {
  try {
    const raw = JSON.parse(await readFile(join(dir, LOADER_FILE), 'utf-8')) as { loader?: unknown; version?: unknown }
    if (raw.loader !== 'fabric' || typeof raw.version !== 'string') return null
    const jar = await stat(join(dir, FABRIC_JAR)).catch(() => null)
    return jar?.isFile() && jar.size > 0 ? { loader: 'fabric', version: raw.version.slice(0, 64) } : null
  } catch {
    return null
  }
}

/** 启动服务器时用哪个 jar */
export async function launchJarOf(dir: string): Promise<string> {
  return (await serverLoaderOf(dir)) ? FABRIC_JAR : 'server.jar'
}
