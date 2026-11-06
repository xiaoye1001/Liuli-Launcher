/**
 * 版本差异对比：比较两个版本（例如整合包更新前后复制出来的版本）的模组和配置文件。
 * 模组按模组 ID 对应（读不到 ID 的按文件名），配置文件按内容的 SHA-1 比较
 */
import { createHash } from 'crypto'
import { lstat, readdir, readFile } from 'fs/promises'
import { dirname, join, relative, sep } from 'path'
import { listMods, modsContextOf } from './mods'
import { assertSafeId } from './versionManage'
import type { ModInfo, VersionDiff, VersionDiffMod } from '../shared/types'

/** 比较的配置文件夹和文件 */
const CONFIG_ITEMS = ['config', 'defaultconfigs', 'kubejs', 'options.txt', 'optionsof.txt', 'optionsshaders.txt']
const MAX_FILES = 4000
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_DEPTH = 8

function keyOf(mod: ModInfo): string {
  return mod.modId ? `id:${mod.modId.toLowerCase()}` : `file:${mod.fileName.replace(/\.disabled$/, '').toLowerCase()}`
}

function brief(mod: ModInfo): VersionDiffMod {
  return {
    fileName: mod.fileName,
    name: mod.zhName ? `${mod.name}（${mod.zhName}）` : mod.name,
    version: mod.version,
    enabled: mod.enabled
  }
}

/** 文件相对路径 → 内容哈希（太大的文件用大小代替） */
async function hashTree(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const walk = async (path: string, depth: number): Promise<void> => {
    if (result.size >= MAX_FILES || depth > MAX_DEPTH) return
    const info = await lstat(path).catch(() => null)
    if (!info || info.isSymbolicLink()) return
    if (info.isDirectory()) {
      for (const name of await readdir(path).catch(() => [] as string[])) await walk(join(path, name), depth + 1)
      return
    }
    if (!info.isFile()) return
    const rel = relative(root, path).split(sep).join('/')
    if (info.size > MAX_FILE_BYTES) {
      result.set(rel, `size:${info.size}`)
      return
    }
    result.set(
      rel,
      createHash('sha1')
        .update(await readFile(path))
        .digest('hex')
    )
  }
  for (const item of CONFIG_ITEMS) await walk(join(root, item), 0)
  return result
}

export async function compareVersions(a: unknown, b: unknown): Promise<VersionDiff> {
  if (typeof a !== 'string' || typeof b !== 'string') throw new Error('请选择两个版本')
  assertSafeId(a)
  assertSafeId(b)
  if (a === b) throw new Error('请选择两个不同的版本')
  const [ctxA, ctxB] = await Promise.all([modsContextOf(a), modsContextOf(b)])
  const sameFolder = ctxA.dir === ctxB.dir
  const [listA, listB] = await Promise.all([listMods(a), listMods(b)])
  const mapA = new Map(listA.mods.map((m) => [keyOf(m), m]))
  const mapB = new Map(listB.mods.map((m) => [keyOf(m), m]))

  const added: VersionDiffMod[] = []
  const removed: VersionDiffMod[] = []
  const changed: { from: VersionDiffMod; to: VersionDiffMod }[] = []
  let same = 0
  for (const [key, mod] of mapB) {
    const old = mapA.get(key)
    if (!old) added.push(brief(mod))
    else if (old.version !== mod.version || old.enabled !== mod.enabled || old.size !== mod.size) {
      changed.push({ from: brief(old), to: brief(mod) })
    } else same++
  }
  for (const [key, mod] of mapA) if (!mapB.has(key)) removed.push(brief(mod))

  const [filesA, filesB] = await Promise.all([hashTree(dirname(ctxA.dir)), hashTree(dirname(ctxB.dir))])
  const configAdded: string[] = []
  const configRemoved: string[] = []
  const configChanged: string[] = []
  for (const [path, hash] of filesB) {
    const old = filesA.get(path)
    if (old === undefined) configAdded.push(path)
    else if (old !== hash) configChanged.push(path)
  }
  for (const path of filesA.keys()) if (!filesB.has(path)) configRemoved.push(path)
  const byName = (x: VersionDiffMod, y: VersionDiffMod): number => x.name.localeCompare(y.name, 'zh-CN')

  return {
    a: { id: a, minecraftVersion: listA.minecraftVersion, loader: listA.loader ?? null, mods: listA.mods.length },
    b: { id: b, minecraftVersion: listB.minecraftVersion, loader: listB.loader ?? null, mods: listB.mods.length },
    sameFolder,
    mods: {
      added: added.sort(byName),
      removed: removed.sort(byName),
      changed: changed.sort((x, y) => byName(x.to, y.to)),
      same
    },
    configs: { added: configAdded.sort(), removed: configRemoved.sort(), changed: configChanged.sort() },
    truncated: filesA.size >= MAX_FILES || filesB.size >= MAX_FILES
  }
}
