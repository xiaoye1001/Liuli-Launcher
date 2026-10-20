import { readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { InstalledModpack, ModpackInfo, ModpackSource } from '../shared/types'

/**
 * 整合包的安装记录：保存在 versions/<版本名>/liuli-modpack.json（整合包自己不能写入 liuli-* 文件）。
 * 记下整合包的名称、版本、来源，以及整合包放进游戏目录的每个文件和它的 SHA-1，
 * 更新整合包时据此判断哪些文件是整合包的、哪些被玩家改过
 */
export const RECORD_FILE = 'liuli-modpack.json'

export interface ModpackRecord extends InstalledModpack {
  format: 1
  /** 整合包放进游戏目录的文件：相对路径 → SHA-1（小写） */
  files: Record<string, string>
  /** 安装或更新的时间 */
  installedAt: string
}

const LOADERS: ModpackInfo['loader'][] = ['fabric', 'forge', 'neoforge', 'quilt', null]
/** 版本 ID 会拼进下载地址：只接受接口返回的格式（Modrinth 为字母数字，CurseForge 为 cf:<数字>[:<数字>]） */
const MODRINTH_ID = /^[A-Za-z0-9]{1,32}$/
const CURSEFORGE_PROJECT = /^cf:\d{1,10}$/
const CURSEFORGE_VERSION = /^cf:\d{1,10}:\d{1,12}$/

function recordPath(gameDir: string, versionId: string): string {
  return join(gameDir, 'versions', versionId, RECORD_FILE)
}

function validSource(value: unknown): ModpackSource | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { platform, projectId, versionId } = value as Record<string, unknown>
  if (typeof projectId !== 'string' || typeof versionId !== 'string') return undefined
  if (platform === 'modrinth' && MODRINTH_ID.test(projectId) && (versionId === '' || MODRINTH_ID.test(versionId)))
    return { platform, projectId, versionId }
  if (
    platform === 'curseforge' &&
    CURSEFORGE_PROJECT.test(projectId) &&
    (versionId === '' || CURSEFORGE_VERSION.test(versionId))
  )
    return { platform, projectId, versionId }
  return undefined
}

/** 读取整合包的安装记录；没有记录或格式不对时返回 null */
export async function readModpackRecord(gameDir: string, versionId: string): Promise<ModpackRecord | null> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(recordPath(gameDir, versionId), 'utf-8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.format !== 1 || typeof r.name !== 'string' || !r.files || typeof r.files !== 'object') return null
  const files: Record<string, string> = {}
  for (const [rel, sha1] of Object.entries(r.files as Record<string, unknown>)) {
    if (typeof sha1 === 'string' && /^[0-9a-f]{40}$/.test(sha1)) files[rel] = sha1
  }
  return {
    format: 1,
    name: r.name.slice(0, 200),
    version: typeof r.version === 'string' ? r.version.slice(0, 100) : '',
    minecraftVersion: typeof r.minecraftVersion === 'string' ? r.minecraftVersion : '',
    loader: LOADERS.includes(r.loader as ModpackInfo['loader']) ? (r.loader as ModpackInfo['loader']) : null,
    loaderVersion: typeof r.loaderVersion === 'string' ? r.loaderVersion : '',
    source: validSource(r.source),
    files,
    installedAt: typeof r.installedAt === 'string' ? r.installedAt : ''
  }
}

/** 保存安装记录（先写临时文件再改名，写到一半退出也不会留下损坏的记录） */
export async function writeModpackRecord(gameDir: string, versionId: string, record: ModpackRecord): Promise<void> {
  const path = recordPath(gameDir, versionId)
  const temp = `${path}.tmp`
  try {
    await writeFile(temp, JSON.stringify(record, null, 2))
    await rename(temp, path)
  } catch (e) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw e
  }
}

/** 版本列表里显示的整合包信息（不含文件清单） */
export function installedModpackOf(record: ModpackRecord): InstalledModpack {
  const { name, version, minecraftVersion, loader, loaderVersion, source } = record
  return { name, version, minecraftVersion, loader, loaderVersion, source }
}
