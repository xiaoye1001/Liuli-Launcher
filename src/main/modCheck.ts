import { readFabricMod, readForgeModManifest, readForgeModToml, readQuiltMod } from '@xmcl/mod-parser'
import { openFileSystem, type FileSystem } from '@xmcl/system'
import type { ModIssue, ModLoader } from '../shared/types'
import { versionInRange } from './versionRange'

/** 一个依赖：ids 中任意一个存在即可 */
export interface ModDependency {
  ids: string[]
  /** 要求的版本范围，例如 >=0.92.0、[47,) */
  range: string
}

/** 声明的不兼容模组 */
export interface ModBreak {
  id: string
  /** 哪些版本不兼容 */
  range: string
  /** 范围的写法：Fabric / Quilt 是 semver，Forge / NeoForge 是 maven */
  format: 'semver' | 'maven'
  /** true：一起装会出错（Fabric breaks、Quilt breaks、NeoForge incompatible）；false：可能出问题 */
  hard: boolean
}

/** 一种加载器的描述文件里声明的内容 */
export interface ModMeta {
  /** 这个文件提供的模组 ID：自身、provides 声明的别名、内嵌的模组 */
  ids: string[]
  /** 必需的前置 */
  depends: ModDependency[]
  /** 声明不兼容的模组 */
  breaks?: ModBreak[]
}

/** Fabric 的 breaks / conflicts：值可以是字符串或字符串数组（数组表示任意一个范围） */
function fabricBreaks(map: unknown, hard: boolean): ModBreak[] {
  if (!map || typeof map !== 'object') return []
  const result: ModBreak[] = []
  for (const [id, value] of Object.entries(map as Record<string, unknown>)) {
    if (!id) continue
    const ranges = Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [value]
    const range = ranges.every((r) => typeof r === 'string') ? (ranges as string[]).join(' || ') : '*'
    result.push({ id, range: range || '*', format: 'semver', hard })
  }
  return result
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

/** 每个 jar 最多读取的内嵌 jar 数量 */
const MAX_NESTED_JARS = 64

/** 读取内嵌 jar 提供的模组 ID */
async function nestedIds(fs: FileSystem, paths: string[], depth: number): Promise<string[]> {
  if (depth >= MAX_DEPTH) return []
  const ids: string[] = []
  // 去掉重复的路径并限制数量：同一个大文件被列几千次会让检查卡住很久
  const unique = [...new Set(paths.filter((p) => typeof p === 'string'))].slice(0, MAX_NESTED_JARS)
  for (const raw of unique) {
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
      const breaks = [...fabricBreaks(mod.breaks, true), ...fabricBreaks(mod.conflicts, false)]
      result.fabric = { ids, depends, breaks }
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
      const breaks: ModBreak[] = []
      for (const item of (loader.breaks ?? []) as unknown[]) {
        const entry = (typeof item === 'string' ? { id: item } : item) as { id?: unknown; versions?: unknown }
        if (typeof entry?.id !== 'string' || !entry.id) continue
        const versions = Array.isArray(entry.versions)
          ? entry.versions.filter((v) => typeof v === 'string').join(' || ')
          : typeof entry.versions === 'string'
            ? entry.versions
            : '*'
        breaks.push({ id: plainId(entry.id), range: versions || '*', format: 'semver', hard: true })
      }
      result.quilt = { ids, depends, breaks }
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
      const breaks: ModBreak[] = []
      for (const mod of mods) {
        for (const dep of mod.dependencies ?? []) {
          // 旧格式用 mandatory = true，NeoForge 新格式用 type = "required"；只在服务端需要的不检查
          const type = String((dep as { type?: unknown }).type ?? '').toLowerCase()
          if (String(dep.side ?? 'BOTH').toUpperCase() === 'SERVER' || !dep.modId) continue
          // NeoForge：incompatible 表示不能一起装，discouraged 表示不建议一起装
          if (type === 'incompatible' || type === 'discouraged') {
            breaks.push({
              id: dep.modId,
              range: dep.versionRange ?? '',
              format: 'maven',
              hard: type === 'incompatible'
            })
            continue
          }
          const required = dep.mandatory === true || type === 'required'
          if (!required) continue
          depends.push({ ids: [dep.modId], range: dep.versionRange ?? '' })
        }
      }
      result[kind] = { ids, depends, breaks }
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

/** 启动器内置的常见冲突：同一组里的模组替换的是游戏的同一部分，只能装一个 */
interface KnownMember {
  /** 同一个 key 算同一个东西（例如 OptiFine 本体和 OptiFabric） */
  key: string
  ids: string[]
  /** 没有模组描述文件时按文件名识别（OptiFine 本体） */
  file?: RegExp
}

const OPTIFINE: KnownMember = { key: 'optifine', ids: ['optifabric', 'optiforge'], file: /^(preview_)?optifine[_-]/i }

export const KNOWN_CONFLICT_GROUPS: { reason: string; members: KnownMember[] }[] = [
  {
    reason: '它们都会替换游戏的渲染引擎，同时装通常无法启动或画面出错，只保留一个',
    members: [
      { key: 'sodium', ids: ['sodium'] },
      { key: 'embeddium', ids: ['embeddium'] },
      { key: 'rubidium', ids: ['rubidium'] },
      { key: 'magnesium', ids: ['magnesium'] },
      { key: 'canvas', ids: ['canvas'] },
      { key: 'vulkanmod', ids: ['vulkanmod'] },
      OPTIFINE
    ]
  },
  {
    reason: '它们都是光影加载器，同时装会冲突，只保留一个',
    members: [{ key: 'iris', ids: ['iris'] }, { key: 'oculus', ids: ['oculus'] }, OPTIFINE]
  },
  {
    reason: '它们都会替换游戏的光照引擎，同时装会冲突，只保留一个',
    members: [
      { key: 'starlight', ids: ['starlight'] },
      { key: 'phosphor', ids: ['phosphor'] }
    ]
  }
]

function knownKey(mod: CheckedMod, members: KnownMember[]): string | undefined {
  const id = mod.modId.toLowerCase()
  for (const member of members) {
    if (id && member.ids.includes(id)) return member.key
    if (!id && member.file?.test(mod.fileName)) return member.key
  }
  return undefined
}

type ConflictIssue = Extract<ModIssue, { kind: 'conflict' }>

function brief(mod: CheckedMod): { fileName: string; name: string; version: string } {
  return { fileName: mod.fileName, name: mod.name, version: mod.version }
}

/** 已知冲突和模组自己声明的不兼容 */
function findConflicts(enabled: CheckedMod[], loader: ModLoader): ConflictIssue[] {
  const result: ConflictIssue[] = []
  for (const group of KNOWN_CONFLICT_GROUPS) {
    const hits = enabled
      .map((mod) => ({ mod, key: knownKey(mod, group.members) }))
      .filter((h): h is { mod: CheckedMod; key: string } => !!h.key)
    if (new Set(hits.map((h) => h.key)).size < 2) continue
    result.push({
      kind: 'conflict',
      source: 'known',
      hard: true,
      reason: group.reason,
      mods: hits.map((h) => brief(h.mod))
    })
  }
  const covered = (a: string, b: string): boolean =>
    result.some((issue) => issue.mods.some((m) => m.fileName === a) && issue.mods.some((m) => m.fileName === b))

  const declared = new Map<string, ConflictIssue>()
  for (const mod of enabled) {
    for (const item of metaFor(mod.relations, loader)?.breaks ?? []) {
      for (const other of enabled) {
        if (other === mod) continue
        const ids = metaFor(other.relations, loader)?.ids ?? []
        if (!ids.includes(item.id)) continue
        // 别名或内嵌模组的版本号不一定是这个 jar 的版本号：只有「任意版本」时才算
        const inRange =
          item.id === other.modId
            ? versionInRange(item.range, other.version, item.format)
            : versionInRange(item.range, '', item.format)
        if (inRange !== true) continue
        if (covered(mod.fileName, other.fileName)) continue
        const key = [mod.fileName, other.fileName].sort().join('\u0000')
        const existing = declared.get(key)
        if (existing) {
          if (item.hard && !existing.hard) {
            existing.hard = true
            existing.reason = `${mod.name} 声明不能和 ${other.name} 一起使用`
          }
          continue
        }
        declared.set(key, {
          kind: 'conflict',
          source: 'declared',
          hard: item.hard,
          reason: item.hard
            ? `${mod.name} 声明不能和 ${other.name} 一起使用`
            : `${mod.name} 声明和 ${other.name} 一起使用可能出问题`,
          mods: [brief(mod), brief(other)]
        })
      }
    }
  }
  return [...result, ...declared.values()]
}

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }

/** 不适合这个版本的模组：只有别的加载器的描述文件，或者声明的 Minecraft 版本范围不包括这个版本 */
function findIncompatible(enabled: CheckedMod[], loader: ModLoader, minecraftVersion: string | undefined): ModIssue[] {
  const result: ModIssue[] = []
  // Sinytra Connector 让 Forge / NeoForge 也能加载 Fabric 模组
  const connector = enabled.some((m) => m.modId === 'connector')
  for (const mod of enabled) {
    const kinds = Object.keys(mod.relations) as (keyof ModRelations)[]
    const meta = metaFor(mod.relations, loader)
    if (!meta) {
      // 读不到描述文件的 jar（例如 OptiFine 本体）不算
      if (kinds.length === 0) continue
      if (connector && kinds.some((k) => k === 'fabric' || k === 'quilt')) continue
      result.push({
        kind: 'incompatible',
        reason: 'loader',
        detail: `这是 ${kinds.map((k) => LOADER_NAMES[k]).join(' / ')} 模组，这个版本用的是 ${LOADER_NAMES[loader] ?? loader}`,
        mod: brief(mod)
      })
      continue
    }
    if (!minecraftVersion) continue
    const dep = meta.depends.find((d) => d.ids.includes('minecraft'))
    if (!dep || !dep.range.trim()) continue
    const format = loader === 'forge' || loader === 'neoforge' ? 'maven' : 'semver'
    // Forge 描述文件可能是旧格式（NeoForge 读 mods.toml 时）；判断不了的不报
    if (versionInRange(dep.range, minecraftVersion, format) === false) {
      result.push({
        kind: 'incompatible',
        reason: 'minecraft',
        detail: `需要 Minecraft ${dep.range}，这个版本是 ${minecraftVersion}`,
        mod: brief(mod)
      })
    }
  }
  return result
}

/** 更新后留下的旧版本：已禁用、和某个启用的模组 ID 相同 */
function findLeftovers(mods: CheckedMod[], loader: ModLoader): ModIssue[] {
  const result: ModIssue[] = []
  for (const current of mods) {
    if (!current.enabled || !current.modId || !metaFor(current.relations, loader)) continue
    const old = mods.filter((m) => !m.enabled && m.modId === current.modId)
    if (old.length > 0) {
      result.push({ kind: 'leftover', modId: current.modId, current: brief(current), old: old.map(brief) })
    }
  }
  return result
}

/** 检查模组之间的问题：缺少前置模组（或前置被禁用了）、同一个模组装了多个、互相冲突 */
export function findModIssues(
  mods: CheckedMod[],
  loader: ModLoader | undefined,
  minecraftVersion?: string
): ModIssue[] {
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

  return [
    ...missing.values(),
    ...duplicates,
    ...findConflicts(enabled, loader),
    ...findIncompatible(enabled, loader, minecraftVersion),
    ...findLeftovers(mods, loader)
  ]
}
