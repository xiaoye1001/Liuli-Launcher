import { BrowserWindow, dialog, shell } from 'electron'
import { Version } from '@xmcl/core'
import { readFabricMod, readForgeModJson, readForgeModManifest, readForgeModToml, readQuiltMod } from '@xmcl/mod-parser'
import { type FileSystem } from '@xmcl/system'
import { createHash } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rename, stat } from 'fs/promises'
import { basename, join } from 'path'
import { getSettings } from './config'
import { getVersionConfig, isolatedWith } from './versionConfig'
import { versionGameDir } from './isolation'
import { detectLoader, getGameStatus } from './launch'
import { assertSafeId } from './versionManage'
import { findModIssues, openLimitedFileSystem, readRelations, zipEntrySize, type ModRelations } from './modCheck'
import type { ModInfo, ModIssue, ModKind, ModList, ModLoader } from '../shared/types'

const DISABLED_SUFFIX = '.disabled'
/** 图标超过这个大小就不显示，避免列表过大 */
const MAX_ICON_BYTES = 256 * 1024

/** 解析结果缓存：文件路径 → 修改时间 + 大小 + 解析结果，刷新列表时不用重新解压 */
type ParsedMod = Omit<ModInfo, 'fileName' | 'enabled'> & { relations: ModRelations }
const cache = new Map<string, { key: string; meta: ParsedMod }>()

export interface ModsContext {
  /** mods 文件夹 */
  dir: string
  isolated: boolean
  /** 原版 Minecraft 版本号 */
  minecraftVersion: string
  loader?: ModLoader
}

/** 某个版本实际使用的 mods 文件夹（遵循版本隔离设置），以及它的 Minecraft 版本与加载器 */
export async function modsContextOf(versionId: string): Promise<ModsContext> {
  assertSafeId(versionId)
  const { gameDir, versionIsolation } = await getSettings()
  let loader: ModLoader | undefined
  let minecraftVersion = ''
  try {
    const version = await Version.parse(gameDir, versionId)
    loader = detectLoader(version)
    minecraftVersion = version.minecraftVersion
    // 改过名的原版：版本名不再是游戏版本号，使用记录下来的版本号
    const json = JSON.parse(await readFile(join(gameDir, 'versions', versionId, `${versionId}.json`), 'utf-8'))
    if (!json.inheritsFrom && json.liuliMinecraftVersion) minecraftVersion = json.liuliMinecraftVersion
  } catch {
    // 版本文件损坏时按原始 json 判断
    const json = JSON.parse(await readFile(join(gameDir, 'versions', versionId, `${versionId}.json`), 'utf-8'))
    loader = detectLoader(json)
    minecraftVersion = json.inheritsFrom ?? json.liuliMinecraftVersion ?? json.id ?? ''
  }
  const isolated = isolatedWith(await getVersionConfig(versionId, gameDir), versionIsolation, loader)
  return { dir: join(versionGameDir(gameDir, versionId, isolated), 'mods'), isolated, minecraftVersion, loader }
}

/** 列出 mods 文件夹中的模组文件（含已禁用的） */
export async function listModFiles(dir: string): Promise<string[]> {
  return (await readdir(dir).catch(() => [] as string[])).filter(isModFile)
}

const sha1Cache = new Map<string, { key: string; sha1: string }>()

/** 计算文件的 SHA1（按修改时间与大小缓存），用于在 Modrinth 上识别模组 */
export async function fileSha1(path: string): Promise<string> {
  const info = await stat(path)
  const key = `${info.mtimeMs}:${info.size}`
  const cached = sha1Cache.get(path)
  if (cached?.key === key) return cached.sha1
  const sha1 = createHash('sha1')
    .update(await readFile(path))
    .digest('hex')
  sha1Cache.set(path, { key, sha1 })
  return sha1
}

function isModFile(name: string): boolean {
  return name.endsWith('.jar') || name.endsWith('.jar' + DISABLED_SUFFIX)
}

/** 读取模组内的图片，转为 data URL */
async function readIcon(fs: FileSystem, path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined
  const clean = path.replace(/^\.?\//, '')
  if (!clean.toLowerCase().endsWith('.png') || !(await fs.existsFile(clean))) return undefined
  if ((zipEntrySize(fs, clean) ?? 0) > MAX_ICON_BYTES) return undefined
  const data = await fs.readFile(clean)
  if (data.byteLength > MAX_ICON_BYTES) return undefined
  return `data:image/png;base64,${Buffer.from(data).toString('base64')}`
}

/** 从模组 jar 中读取名称、版本、图标等信息，依次尝试 Fabric、Quilt、NeoForge、Forge 的描述文件 */
async function parseMod(path: string, size: number): Promise<ParsedMod> {
  let fs: FileSystem | undefined
  try {
    fs = await openLimitedFileSystem(path)
    const [info, relations] = await Promise.all([parseInfo(fs, path, size), readRelations(fs).catch(() => ({}))])
    return { ...info, relations }
  } catch {
    // 不是有效的 jar，只显示文件名
    return { ...(await parseInfo(undefined, path, size)), relations: {} }
  } finally {
    fs?.close()
  }
}

/** 名称、版本、图标等显示用的信息 */
async function parseInfo(
  fs: FileSystem | undefined,
  path: string,
  size: number
): Promise<Omit<ModInfo, 'fileName' | 'enabled'>> {
  const fallbackName = basename(path)
    .replace(/\.disabled$/, '')
    .replace(/\.jar$/, '')
  const base = { name: fallbackName, modId: '', version: '', description: '', kind: 'unknown' as ModKind, size }
  if (!fs) return base
  try {
    if (await fs.existsFile('fabric.mod.json')) {
      const mod = await readFabricMod(fs)
      const icon = typeof mod.icon === 'string' ? mod.icon : largestIcon(mod.icon as unknown)
      return {
        ...base,
        kind: 'fabric',
        name: mod.name || mod.id || fallbackName,
        modId: mod.id ?? '',
        version: mod.version ?? '',
        description: mod.description ?? '',
        icon: await readIcon(fs, icon)
      }
    }
    if (await fs.existsFile('quilt.mod.json')) {
      const mod = await readQuiltMod(fs)
      const meta = mod.quilt_loader.metadata
      return {
        ...base,
        kind: 'quilt',
        name: meta?.name || mod.quilt_loader.id || fallbackName,
        modId: mod.quilt_loader.id ?? '',
        version: mod.quilt_loader.version ?? '',
        description: meta?.description ?? '',
        icon: await readIcon(fs, typeof meta?.icon === 'string' ? meta.icon : largestIcon(meta?.icon))
      }
    }
    const manifest: Record<string, string> = {}
    await readForgeModManifest(fs, manifest).catch(() => undefined)
    for (const [file, kind] of [
      ['neoforge.mods.toml', 'neoforge'],
      ['mods.toml', 'forge']
    ] as const) {
      const [mod] = await readForgeModToml(fs, manifest, file)
      if (mod) {
        return {
          ...base,
          kind,
          name: mod.displayName || mod.modid || fallbackName,
          modId: mod.modid,
          version: resolveJarVersion(mod.version, manifest),
          description: mod.description.trim(),
          icon: await readIcon(fs, mod.logoFile)
        }
      }
    }
    const [legacy] = await readForgeModJson(fs).catch(() => [])
    if (legacy) {
      return {
        ...base,
        kind: 'forge',
        name: legacy.name || legacy.modid || fallbackName,
        modId: legacy.modid ?? '',
        version: legacy.version ?? '',
        description: legacy.description ?? '',
        icon: await readIcon(fs, legacy.logoFile)
      }
    }
    return base
  } catch {
    // 描述文件损坏，只显示文件名
    return base
  }
}

/** Fabric / Quilt 的多尺寸图标：选最大的那张 */
function largestIcon(icon: unknown): string | undefined {
  if (!icon || typeof icon !== 'object') return undefined
  const entries = Object.entries(icon as Record<string, string>).sort((a, b) => Number(b[0]) - Number(a[0]))
  return entries[0]?.[1]
}

/** mods.toml 里的 ${file.jarVersion} 取自 MANIFEST.MF 的 Implementation-Version */
function resolveJarVersion(version: string, manifest: Record<string, string>): string {
  if (version.includes('${file.jarVersion}')) {
    return manifest['Implementation-Version']
      ? version.replace('${file.jarVersion}', manifest['Implementation-Version'])
      : ''
  }
  return version
}

/** 列出某个版本的模组（按名称排序） */
export async function listMods(versionId: string): Promise<ModList> {
  const { dir, isolated, minecraftVersion, loader } = await modsContextOf(versionId)
  const names = await listModFiles(dir)

  const mods: (ModInfo & { relations: ModRelations })[] = []
  // 每次最多同时解析 8 个，避免模组很多时一次打开太多文件
  for (let i = 0; i < names.length; i += 8) {
    const batch = await Promise.all(
      names.slice(i, i + 8).map(async (fileName): Promise<(ModInfo & { relations: ModRelations }) | null> => {
        const path = join(dir, fileName)
        const info = await stat(path).catch(() => null)
        if (!info?.isFile()) return null
        // 启用/禁用只改文件名，缓存按去掉 .disabled 后的路径保存
        const cacheId = path.replace(/\.disabled$/, '')
        const key = `${info.mtimeMs}:${info.size}`
        let cached = cache.get(cacheId)
        if (cached?.key !== key) {
          cached = { key, meta: await parseMod(path, info.size) }
          cache.set(cacheId, cached)
        }
        return { ...cached.meta, fileName, enabled: !fileName.endsWith(DISABLED_SUFFIX) }
      })
    )
    mods.push(...(batch.filter(Boolean) as (ModInfo & { relations: ModRelations })[]))
  }
  mods.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const issues = findModIssues(mods, loader)
  // 依赖关系只在主进程里用，不发给界面
  return {
    versionId,
    dir,
    isolated,
    minecraftVersion,
    loader,
    mods: mods.map(({ relations: _, ...mod }) => mod),
    issues
  }
}

/** 只检查模组问题（启用、禁用、删除模组后刷新提示用） */
export async function checkModIssues(versionId: string): Promise<ModIssue[]> {
  return (await listMods(versionId)).issues
}

/** 游戏运行时模组文件被占用，且改动要重启游戏才生效，所以不允许修改 */
export function assertGameStopped(versionId: string): void {
  const game = getGameStatus()
  if ((game.state === 'launching' || game.state === 'running') && game.versionId === versionId) {
    throw new Error('游戏正在运行，请退出游戏后再修改模组')
  }
}

/** 检查文件名，防止通过 ../ 访问 mods 文件夹以外的文件 */
function assertModFile(fileName: string): void {
  if (!fileName || fileName !== basename(fileName) || !isModFile(fileName)) {
    throw new Error(`无效的模组文件：${fileName}`)
  }
}

/** 启用或禁用模组：禁用就是在文件名后加 .disabled（与其他启动器通用） */
export async function setModEnabled(versionId: string, fileName: string, enabled: boolean): Promise<string> {
  assertModFile(fileName)
  assertGameStopped(versionId)
  const { dir } = await modsContextOf(versionId)
  const base = fileName.replace(/\.disabled$/, '')
  const target = enabled ? base : base + DISABLED_SUFFIX
  if (target !== fileName) {
    // 同名的另一份（例如 a.jar 和 a.jar.disabled 同时存在）不能被覆盖
    if (
      await stat(join(dir, target)).then(
        () => true,
        () => false
      )
    ) {
      throw new Error(`已经有一个同名的${enabled ? '' : '禁用'}模组文件：${target}，请先删除其中一个`)
    }
    await rename(join(dir, fileName), join(dir, target))
  }
  return target
}

/** 删除模组：移到系统回收站，误删可以找回 */
export async function deleteMod(versionId: string, fileName: string): Promise<void> {
  assertModFile(fileName)
  assertGameStopped(versionId)
  const { dir } = await modsContextOf(versionId)
  await shell.trashItem(join(dir, fileName))
}

/** 选择 jar 文件复制到 mods 文件夹，返回添加的数量 */
export async function addMods(versionId: string, win: BrowserWindow | null): Promise<number> {
  assertGameStopped(versionId)
  const { dir } = await modsContextOf(versionId)
  const options: Electron.OpenDialogOptions = {
    title: `添加模组到 ${versionId}`,
    filters: [{ name: '模组文件', extensions: ['jar'] }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return 0
  await mkdir(dir, { recursive: true })
  for (const file of result.filePaths) {
    await copyFile(file, join(dir, basename(file)))
  }
  return result.filePaths.length
}

/** 在文件管理器中打开 mods 文件夹（不存在时先创建） */
export async function openModsDir(versionId: string): Promise<void> {
  const { dir } = await modsContextOf(versionId)
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}
