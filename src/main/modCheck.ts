import { readFabricMod, readForgeModManifest, readForgeModToml, readQuiltMod } from '@xmcl/mod-parser'
import { openFileSystem, type FileSystem } from '@xmcl/system'
import type { ModIssue, ModLoader } from '../shared/types'

/** 一个依赖：ids 中任意一个存在即可 */
export interface ModDependency {
  ids: string[]
  /** 要求的版本范围，例如 >=0.92.0、[47,) */
  range: string
}

/** 一种加载器的描述文件里声明的内容 */
export interface ModMeta {
  /** 这个文件提供的模组 ID：自身、provides 声明的别名、内嵌的模组 */
  ids: string[]
  /** 必需的前置 */
  depends: ModDependency[]
}

/** 模组 jar 里各加载器的描述（同一个 jar 可能同时支持多个加载器） */
export type ModRelations = Partial<Record<'fabric' | 'quilt' | 'forge' | 'neoforge', ModMeta>>

/** 不需要检查的依赖：游戏本身、Java、加载器，以及加载器自带的库 */
const BUILTIN = new Set([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-loader',
  'quilt_loader',
  'forge',
  'neoforge',
  'fml',
  'javafml',
  'mixinextras'
])
/** 内嵌 jar 最多读几层、单个内嵌 jar 最大多少 */
const MAX_DEPTH = 3
const MAX_NESTED_BYTES = 64 * 1024 * 1024

/** 压缩包里单个文件解压后最大多少（防止压缩炸弹：几 MB 的压缩包解压出几 GB 把内存占满） */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024

/** 压缩包里某个文件解压后的大小；不是压缩包或找不到这个文件时为 undefined */
export function zipEntrySize(fs: FileSystem, name: string): number | undefined {
  const zip = fs as unknown as {
    entries?: Record<string, { uncompressedSize?: number } | undefined>
    normalizePath?: (name: string) => string
  }
  if (!zip.entries || typeof zip.normalizePath !== 'function') return undefined
  return zip.entries[zip.normalizePath(name)]?.uncompressedSize
}

/** 打开模组、资源包等压缩包：读取其中的文件前先检查解压后的大小，太大的直接报错 */
export async function openLimitedFileSystem(source: string | Uint8Array): Promise<FileSystem> {
  const fs = await openFileSystem(source)
  const readFile = fs.readFile.bind(fs) as (name: string, encoding?: 'utf-8' | 'base64') => Promise<unknown>
  return Object.assign(fs, {
    readFile: (name: string, encoding?: 'utf-8' | 'base64') => {
      const size = zipEntrySize(fs, name)
      if (size !== undefined && size > MAX_ENTRY_BYTES) return Promise.reject(new Error(`压缩包中的文件太大：${name}`))
      return readFile(name, encoding)
    }
  }) as FileSystem
}

/** Quilt 的 ID 可以写成「maven 组:模组 ID」 */
function plainId(id: string): string {
  return id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id
}

function rangeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(' 或 ')
  return typeof value === 'string' ? value : ''
}

/** 读取内嵌 jar 提供的模组 ID */
async function nestedIds(fs: FileSystem, paths: string[], depth: number): Promise<string[]> {
  if (depth >= MAX_DEPTH) return []
  const ids: string[] = []
  for (const raw of paths) {
    const path = raw.replace(/^\.?\//, '')
    if (!path || !(await fs.existsFile(path).catch(() => false))) continue
    let nested: FileSystem | undefined
    try {
      const size = zipEntrySize(fs, path)
      if (size !== undefined && size > MAX_NESTED_BYTES) continue
      const data = await fs.readFile(path)
      if (data.byteLength > MAX_NESTED_BYTES) continue
      nested = await openLimitedFileSystem(data)
      const relations = await readRelations(nested, depth + 1)
      for (const meta of Object.values(relations)) ids.push(...meta.ids)
    } catch {
      // 内嵌 jar 损坏时忽略
    } finally {
      nested?.close()
    }
  }
  return ids
}

/** Forge / NeoForge 的 jarjar 内嵌 jar 列表 */
async function jarJarPaths(fs: FileSystem): Promise<string[]> {
  if (!(await fs.existsFile('META-INF/jarjar/metadata.json').catch(() => false))) return []
  try {
    const json = JSON.parse(new TextDecoder().decode(await fs.readFile('META-INF/jarjar/metadata.json')))
    return Array.isArray(json?.jars) ? json.jars.map((j: { path?: string }) => j?.path).filter(Boolean) : []
  } catch {
    return []
  }
}

/** 读取模组 jar 的依赖关系：每种加载器的描述文件分别读取 */
export async function readRelations(fs: FileSystem, depth = 0): Promise<ModRelations> {
  const result: ModRelations = {}
  if (await fs.existsFile('fabric.mod.json').catch(() => false)) {
    try {
      const mod = await readFabricMod(fs)
      const ids = [mod.id, ...(mod.provides ?? [])].filter(Boolean)
      ids.push(
        ...(await nestedIds(
          fs,
          (mod.jars ?? []).map((j) => j.file),
          depth
        ))
      )
      const depends = Object.entries(mod.depends ?? {}).map(([id, range]) => ({ ids: [id], range: rangeText(range) }))
      result.fabric = { ids, depends }
    } catch {
      // 描述文件损坏
    }
  }
  if (await fs.existsFile('quilt.mod.json').catch(() => false)) {
    try {
      const loader = (await readQuiltMod(fs)).quilt_loader
      const ids = [
        loader.id,
        ...(loader.provides ?? []).map((p) => (typeof p === 'string' ? p : (p as { id: string }).id))
      ]
        .filter(Boolean)
        .map(plainId)
      ids.push(...(await nestedIds(fs, loader.jars ?? [], depth)))
      const depends: ModDependency[] = []
      for (const dep of (loader.depends ?? []) as unknown[]) {
        // 数组表示其中任意一个即可
        const options = (Array.isArray(dep) ? dep : [dep]) as (
          | string
          | { id: string; versions?: unknown; optional?: boolean }
        )[]
        const required = options.filter((o) => typeof o === 'string' || !o.optional)
        if (required.length === 0) continue
        depends.push({
          ids: required.map((o) => plainId(typeof o === 'string' ? o : o.id)),
          range: typeof required[0] === 'string' ? '' : rangeText(required[0].versions)
        })
      }
      result.quilt = { ids, depends }
    } catch {
      // 描述文件损坏
    }
  }
  const manifest: Record<string, string> = {}
  let nested: string[] | undefined
  for (const [file, kind] of [
    ['neoforge.mods.toml', 'neoforge'],
    ['mods.toml', 'forge']
  ] as const) {
    if (!(await fs.existsFile(`META-INF/${file}`).catch(() => false))) continue
    try {
      if (Object.keys(manifest).length === 0) await readForgeModManifest(fs, manifest).catch(() => undefined)
      const mods = await readForgeModToml(fs, manifest, file)
      if (mods.length === 0) continue
      nested ??= await nestedIds(fs, await jarJarPaths(fs), depth)
      const ids = [...mods.flatMap((m) => [m.modid, ...(m.provides ?? [])]), ...nested].filter(Boolean)
      const depends: ModDependency[] = []
      for (const mod of mods) {
        for (const dep of mod.dependencies ?? []) {
          // 旧格式用 mandatory = true，NeoForge 新格式用 type = "required"；只在服务端需要的不检查
          const type = String((dep as { type?: unknown }).type ?? '').toLowerCase()
          const required = dep.mandatory === true || type === 'required'
          if (!required || String(dep.side ?? 'BOTH').toUpperCase() === 'SERVER' || !dep.modId) continue
          depends.push({ ids: [dep.modId], range: dep.versionRange ?? '' })
        }
      }
      result[kind] = { ids, depends }
    } catch {
      // 描述文件损坏
    }
  }
  return result
}

/** 按版本的加载器选用 jar 里对应的描述（Quilt 也能加载 Fabric 模组，NeoForge 也能读旧的 mods.toml） */
function metaFor(relations: ModRelations, loader: ModLoader | undefined): ModMeta | undefined {
  if (loader === 'fabric') return relations.fabric
  if (loader === 'quilt') return relations.quilt ?? relations.fabric
  if (loader === 'forge') return relations.forge
  if (loader === 'neoforge') return relations.neoforge ?? relations.forge
  return undefined
}

export interface CheckedMod {
  fileName: string
  name: string
  modId: string
  version: string
  enabled: boolean
  relations: ModRelations
}

/** 检查模组之间的问题：缺少前置模组（或前置被禁用了）、同一个模组装了多个 */
export function findModIssues(mods: CheckedMod[], loader: ModLoader | undefined): ModIssue[] {
  if (!loader || loader === 'optifine') return []
  const enabled = mods.filter((m) => m.enabled)
  const provided = new Set<string>()
  for (const mod of enabled) for (const id of metaFor(mod.relations, loader)?.ids ?? []) provided.add(id)
  /** 被禁用的模组提供的 ID → 模组（用于提示「启用它」） */
  const disabledProviders = new Map<string, CheckedMod>()
  for (const mod of mods) {
    if (mod.enabled) continue
    for (const id of metaFor(mod.relations, loader)?.ids ?? [])
      if (!disabledProviders.has(id)) disabledProviders.set(id, mod)
  }

  const missing = new Map<string, Extract<ModIssue, { kind: 'missing' }>>()
  for (const mod of enabled) {
    for (const dep of metaFor(mod.relations, loader)?.depends ?? []) {
      if (dep.ids.some((id) => BUILTIN.has(id) || provided.has(id))) continue
      const disabled = dep.ids.map((id) => disabledProviders.get(id)).find(Boolean)
      // 同一个被禁用的模组提供的多个前置合并成一条提示
      const key = disabled ? `disabled:${disabled.fileName}` : dep.ids.join('|')
      let issue = missing.get(key)
      if (!issue) {
        issue = {
          kind: 'missing',
          dependency: dep.ids[0],
          alternatives: dep.ids.slice(1),
          requiredBy: [],
          disabled: disabled && { fileName: disabled.fileName, name: disabled.name }
        }
        missing.set(key, issue)
      }
      if (!issue.requiredBy.some((r) => r.fileName === mod.fileName)) {
        issue.requiredBy.push({ fileName: mod.fileName, name: mod.name, range: dep.range })
      }
    }
  }

  const byId = new Map<string, CheckedMod[]>()
  for (const mod of enabled) {
    if (!mod.modId || !metaFor(mod.relations, loader)) continue
    byId.set(mod.modId, [...(byId.get(mod.modId) ?? []), mod])
  }
  const duplicates: ModIssue[] = [...byId.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([modId, list]) => ({
      kind: 'duplicate',
      modId,
      mods: list.map((m) => ({ fileName: m.fileName, name: m.name, version: m.version }))
    }))

  return [...missing.values(), ...duplicates]
}
