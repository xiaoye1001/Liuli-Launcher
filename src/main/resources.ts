import { BrowserWindow, dialog, shell } from 'electron'
import { openFileSystem, type FileSystem } from '@xmcl/system'
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getGameStatus } from './launch'
import { fileSha1, modsContextOf } from './mods'
import { downloadModrinthVersion, findModrinthUpdates } from './modrinth'
import type { LocalResource, LocalResourceKind, LocalResourceList, ModUpdate } from '../shared/types'

const FOLDERS: Record<LocalResourceKind, string> = { resourcepack: 'resourcepacks', shader: 'shaderpacks' }
const KIND_NAMES: Record<LocalResourceKind, string> = { resourcepack: '资源包', shader: '光影包' }
/** 图标超过这个大小就不显示 */
const MAX_ICON_BYTES = 256 * 1024

/** 资源所在的游戏目录（考虑版本隔离）与资源文件夹 */
async function contextOf(
  versionId: string,
  kind: LocalResourceKind
): Promise<{ gameDir: string; dir: string; minecraftVersion: string }> {
  const ctx = await modsContextOf(versionId)
  const gameDir = dirname(ctx.dir)
  return { gameDir, dir: join(gameDir, FOLDERS[kind]), minecraftVersion: ctx.minecraftVersion }
}

/** 游戏运行时会重写 options.txt 等文件，修改也要重启游戏才生效 */
function assertGameStopped(versionId: string): void {
  const game = getGameStatus()
  if ((game.state === 'launching' || game.state === 'running') && game.versionId === versionId) {
    throw new Error('游戏正在运行，请退出游戏后再修改')
  }
}

/** 文件名只能是资源文件夹里的普通名字，防止通过 ../ 访问其他文件 */
function assertSafeName(fileName: string): void {
  if (!fileName || fileName !== basename(fileName) || fileName === '.' || fileName === '..') {
    throw new Error(`无效的文件名：${fileName}`)
  }
}

/** pack.mcmeta 的简介可能是字符串或文本组件，取出纯文本并去掉 § 颜色代码 */
function plainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(plainText).join('')
  if (value && typeof value === 'object') {
    const obj = value as { text?: unknown; translate?: unknown; extra?: unknown }
    return plainText(obj.text ?? obj.translate ?? '') + plainText(obj.extra ?? '')
  }
  return ''
}

/** 读取资源包的 pack.mcmeta 与 pack.png（zip 与文件夹都支持） */
export async function readPackMeta(path: string): Promise<Pick<LocalResource, 'description' | 'packFormat' | 'icon'>> {
  let fs: FileSystem | undefined
  try {
    fs = await openFileSystem(path)
    const result: Pick<LocalResource, 'description' | 'packFormat' | 'icon'> = { description: '' }
    if (await fs.existsFile('pack.mcmeta')) {
      // 部分资源包的 pack.mcmeta 带 BOM
      const text = Buffer.from(await fs.readFile('pack.mcmeta'))
        .toString('utf-8')
        .replace(/^﻿/, '')
      const pack = (JSON.parse(text) as { pack?: { description?: unknown; pack_format?: unknown } }).pack
      result.description = plainText(pack?.description).replace(/§./g, '').trim()
      if (typeof pack?.pack_format === 'number') result.packFormat = pack.pack_format
    }
    if (await fs.existsFile('pack.png')) {
      const data = await fs.readFile('pack.png')
      if (data.byteLength <= MAX_ICON_BYTES)
        result.icon = `data:image/png;base64,${Buffer.from(data).toString('base64')}`
    }
    return result
  } catch {
    return { description: '' }
  } finally {
    fs?.close()
  }
}

// ---------- options.txt（资源包启用状态） ----------

async function readLines(path: string): Promise<{ lines: string[]; eol: string }> {
  const text = await readFile(path, 'utf-8').catch(() => '')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text ? text.split(/\r?\n/) : []
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return { lines, eol }
}

function readList(lines: string[], key: string): string[] {
  const line = lines.find((l) => l.startsWith(`${key}:`))
  if (!line) return []
  try {
    const list = JSON.parse(line.slice(key.length + 1))
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeList(lines: string[], key: string, list: string[]): void {
  const line = `${key}:${JSON.stringify(list)}`
  const index = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (index >= 0) lines[index] = line
  else lines.push(line)
}

/** 1.13 起资源包在 options.txt 里写作 "file/<文件名>"，更早的版本直接写文件名 */
function usesFilePrefix(list: string[], minecraftVersion: string): boolean {
  if (list.some((v) => v.startsWith('file/') || v === 'vanilla')) return true
  if (list.length > 0) return false
  const match = /^1\.(\d+)/.exec(minecraftVersion)
  return !match || Number(match[1]) >= 13
}

function packEnabled(list: string[], fileName: string): boolean {
  return list.includes(`file/${fileName}`) || list.includes(fileName)
}

// ---------- 光影配置（Iris / Oculus / OptiFine 都使用 Java properties 格式） ----------

const SHADER_CONFIGS = [
  { loader: 'iris', path: ['config', 'iris.properties'] },
  { loader: 'oculus', path: ['config', 'oculus.properties'] },
  { loader: 'optifine', path: ['optionsshaders.txt'] }
] as const

function unescapeProperty(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, ch: string) => {
    if (ch.length === 5) return String.fromCharCode(parseInt(ch.slice(1), 16))
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[ch] ?? ch
  })
}

function escapeProperty(value: string): string {
  return value.replace(/[\\=:#!\t\n\r\f]|[^\x20-\x7e]/g, (ch) => {
    const special: Record<string, string> = { '\t': '\\t', '\n': '\\n', '\r': '\\r', '\f': '\\f' }
    if (special[ch]) return special[ch]
    if (/[\\=:#!]/.test(ch)) return `\\${ch}`
    return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

function getProperty(lines: string[], key: string): string | undefined {
  const re = new RegExp(`^\\s*${key}\\s*[=:]\\s*(.*)$`)
  for (const line of lines) {
    const match = re.exec(line)
    if (match) return unescapeProperty(match[1])
  }
  return undefined
}

function setProperty(lines: string[], key: string, value: string): void {
  const re = new RegExp(`^\\s*${key}\\s*[=:]`)
  const line = `${key}=${escapeProperty(value)}`
  const index = lines.findIndex((l) => re.test(l))
  if (index >= 0) lines[index] = line
  else lines.push(line)
}

/** 找到该版本已有的光影加载器配置（游戏里打开过一次光影设置后才会生成） */
async function findShaderConfig(
  gameDir: string
): Promise<{ loader: 'iris' | 'oculus' | 'optifine'; path: string; lines: string[]; eol: string } | null> {
  for (const config of SHADER_CONFIGS) {
    const path = join(gameDir, ...config.path)
    if (await stat(path).catch(() => null)) return { loader: config.loader, path, ...(await readLines(path)) }
  }
  return null
}

/** 当前使用的光影文件名（未开启光影时为空） */
function activeShader(config: { loader: string; lines: string[] }): { name: string; enabled: boolean } {
  const name = getProperty(config.lines, 'shaderPack') ?? ''
  if (config.loader === 'optifine') {
    const enabled = !!name && name !== 'OFF' && name !== '(internal)'
    return { name: enabled ? name : '', enabled }
  }
  const enabled = getProperty(config.lines, 'enableShaders') !== 'false'
  return { name, enabled: enabled && !!name }
}

async function writeLines(path: string, lines: string[], eol: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, lines.join(eol) + eol, 'utf-8')
  await rename(`${path}.tmp`, path)
}

// ---------- 对外接口 ----------

/** 列出某个版本的资源包或光影包 */
export async function listLocalResources(versionId: string, kind: LocalResourceKind): Promise<LocalResourceList> {
  const { gameDir, dir } = await contextOf(versionId, kind)
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const result: LocalResourceList = { versionId, kind, dir, items: [] }

  let enabledPacks: string[] = []
  let shader = { name: '', enabled: false }
  if (kind === 'resourcepack') {
    enabledPacks = readList((await readLines(join(gameDir, 'options.txt'))).lines, 'resourcePacks')
  } else {
    const config = await findShaderConfig(gameDir)
    if (config) {
      shader = activeShader(config)
      result.shaderLoader = config.loader
      result.shadersEnabled = shader.enabled
    }
  }

  for (const entry of entries) {
    const isDirectory = entry.isDirectory()
    const isZip = entry.isFile() && entry.name.toLowerCase().endsWith('.zip')
    if (!isDirectory && !isZip) continue
    const path = join(dir, entry.name)
    if (kind === 'resourcepack') {
      // 文件夹形式的资源包必须带 pack.mcmeta
      if (isDirectory && !(await stat(join(path, 'pack.mcmeta')).catch(() => null))) continue
      result.items.push({
        fileName: entry.name,
        isDirectory,
        size: isDirectory ? 0 : (await stat(path)).size,
        ...(await readPackMeta(path)),
        enabled: packEnabled(enabledPacks, entry.name)
      })
    } else {
      result.items.push({
        fileName: entry.name,
        isDirectory,
        size: isDirectory ? 0 : (await stat(path)).size,
        description: '',
        enabled: shader.enabled && shader.name === entry.name
      })
    }
  }
  result.items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.fileName.localeCompare(b.fileName, 'zh-CN'))
  return result
}

/** 在游戏中启用或停用资源包（修改 options.txt，启用的资源包放在最上层） */
export async function setResourcePackEnabled(versionId: string, fileName: string, enabled: boolean): Promise<void> {
  assertSafeName(fileName)
  assertGameStopped(versionId)
  const { gameDir, dir, minecraftVersion } = await contextOf(versionId, 'resourcepack')
  if (enabled && !(await stat(join(dir, fileName)).catch(() => null))) throw new Error(`找不到资源包：${fileName}`)
  const path = join(gameDir, 'options.txt')
  const { lines, eol } = await readLines(path)
  const current = readList(lines, 'resourcePacks')
  const prefixed = usesFilePrefix(current, minecraftVersion)
  const without = (list: string[]): string[] => list.filter((v) => v !== fileName && v !== `file/${fileName}`)
  const next = without(current)
  if (enabled) {
    // 新版本的列表里要保留原版资源（vanilla），排在最底层
    if (prefixed && !next.includes('vanilla')) next.unshift('vanilla')
    next.push(prefixed ? `file/${fileName}` : fileName)
  }
  writeList(lines, 'resourcePacks', next)
  const incompatible = readList(lines, 'incompatibleResourcePacks')
  if (incompatible.length > 0) writeList(lines, 'incompatibleResourcePacks', without(incompatible))
  await writeLines(path, lines, eol)
}

/** 设置当前使用的光影；fileName 为 null 时关闭光影 */
export async function setActiveShader(versionId: string, fileName: string | null): Promise<void> {
  if (fileName !== null) assertSafeName(fileName)
  assertGameStopped(versionId)
  const { gameDir, dir } = await contextOf(versionId, 'shader')
  const config = await findShaderConfig(gameDir)
  if (!config) {
    throw new Error('没有找到光影加载器的设置。请先安装 Iris 或 OptiFine，进入游戏打开一次光影设置')
  }
  if (fileName !== null && !(await stat(join(dir, fileName)).catch(() => null))) {
    throw new Error(`找不到光影包：${fileName}`)
  }
  if (config.loader === 'optifine') {
    setProperty(config.lines, 'shaderPack', fileName ?? 'OFF')
  } else {
    if (fileName !== null) setProperty(config.lines, 'shaderPack', fileName)
    setProperty(config.lines, 'enableShaders', fileName !== null ? 'true' : 'false')
  }
  await writeLines(config.path, config.lines, config.eol)
}

/** 删除资源：移到系统回收站 */
export async function deleteLocalResource(versionId: string, kind: LocalResourceKind, fileName: string): Promise<void> {
  assertSafeName(fileName)
  assertGameStopped(versionId)
  const { dir } = await contextOf(versionId, kind)
  await shell.trashItem(join(dir, fileName))
  if (kind === 'resourcepack') {
    // 同时从启用列表中去掉，避免游戏里留下找不到的条目
    await setResourcePackEnabled(versionId, fileName, false).catch(() => undefined)
  }
}

/** 选择 zip 文件复制到资源文件夹，返回添加的数量 */
export async function addLocalResources(
  versionId: string,
  kind: LocalResourceKind,
  win: BrowserWindow | null
): Promise<number> {
  const { dir } = await contextOf(versionId, kind)
  const options: Electron.OpenDialogOptions = {
    title: `添加${KIND_NAMES[kind]}到 ${versionId}`,
    filters: [{ name: KIND_NAMES[kind], extensions: ['zip'] }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return 0
  await mkdir(dir, { recursive: true })
  for (const file of result.filePaths) await copyFile(file, join(dir, basename(file)))
  return result.filePaths.length
}

/** 在文件管理器中打开资源文件夹（不存在时先创建） */
export async function openLocalResourceDir(versionId: string, kind: LocalResourceKind): Promise<void> {
  const { dir } = await contextOf(versionId, kind)
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

// ---------- 检查更新 ----------

/** 查询更新时，当前版本没有声明加载器时使用的默认值 */
const DEFAULT_LOADERS: Record<LocalResourceKind, string[]> = {
  resourcepack: ['minecraft'],
  shader: ['iris', 'optifine']
}

/** 检查资源包或光影包有没有新版本（只能识别 Modrinth 上的 zip 文件） */
export async function checkResourceUpdates(versionId: string, kind: LocalResourceKind): Promise<ModUpdate[]> {
  const { dir, minecraftVersion } = await contextOf(versionId, kind)
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const hashOf = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue
    const hash = await fileSha1(join(dir, entry.name)).catch(() => '')
    if (hash) hashOf.set(entry.name, hash)
  }
  return findModrinthUpdates(hashOf, minecraftVersion, (current) =>
    current.length > 0 ? current : DEFAULT_LOADERS[kind]
  )
}

/**
 * 更新资源包或光影包：下载新版本，旧文件移到回收站。
 * 启用中的资源包和正在使用的光影会改成新文件，保持启用。返回新的文件名
 */
export async function updateResource(
  versionId: string,
  kind: LocalResourceKind,
  fileName: string,
  modrinthVersionId: string
): Promise<string> {
  assertSafeName(fileName)
  assertGameStopped(versionId)
  const { gameDir, dir } = await contextOf(versionId, kind)
  if (!(await stat(join(dir, fileName)).catch(() => null))?.isFile()) {
    throw new Error(`找不到${KIND_NAMES[kind]}：${fileName}`)
  }
  const newName = await downloadModrinthVersion(modrinthVersionId, dir)
  if (newName === fileName) return newName
  await shell.trashItem(join(dir, fileName))

  if (kind === 'resourcepack') {
    const path = join(gameDir, 'options.txt')
    const { lines, eol } = await readLines(path)
    const replace = (list: string[]): string[] =>
      list.map((v) => (v === fileName ? newName : v === `file/${fileName}` ? `file/${newName}` : v))
    const enabled = readList(lines, 'resourcePacks')
    if (packEnabled(enabled, fileName)) {
      writeList(lines, 'resourcePacks', replace(enabled))
      const incompatible = readList(lines, 'incompatibleResourcePacks')
      if (incompatible.length > 0) {
        writeList(
          lines,
          'incompatibleResourcePacks',
          incompatible.filter((v) => !packEnabled([v], fileName))
        )
      }
      await writeLines(path, lines, eol)
    }
  } else {
    const config = await findShaderConfig(gameDir)
    if (config && getProperty(config.lines, 'shaderPack') === fileName) {
      setProperty(config.lines, 'shaderPack', newName)
      await writeLines(config.path, config.lines, config.eol)
    }
  }
  return newName
}
