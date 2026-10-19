import { app, BrowserWindow, dialog, shell } from 'electron'
import { createHash } from 'crypto'
import { readdir, readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { getGameStatus } from './launch'
import { isAllowedModpackUrl, lookupModrinthFiles } from './modrinth'
import { modsContextOf } from './mods'
import { assertSafeId } from './versionManage'
import { directoryEntries, writeZip, type ZipEntry } from './zipWriter'
import type {
  ExportableEntry,
  ModpackExportFormat,
  ModpackExportInfo,
  ModpackExportOptions,
  ModpackExportResult
} from '../shared/types'

/** 不放进整合包的内容：启动器与游戏自动生成的文件、日志、缓存等 */
const EXCLUDED = new Set([
  'versions',
  'libraries',
  'assets',
  'logs',
  'crash-reports',
  'screenshots',
  'backups',
  'natives',
  'downloads',
  'webcache',
  'webcache2',
  'debug',
  '.cache',
  '.fabric',
  '.mixin.out',
  '.optifine',
  'liuli-version.json',
  'liuli-display.json',
  'liuli-icon.png',
  'launcher_profiles.json',
  'launcher_accounts.json',
  'usercache.json',
  'usernamecache.json',
  'realms_persistence.json',
  'command_history.txt',
  'servers.dat_old',
  'shaderpacks_cache'
])
/** 默认勾选的内容 */
const RECOMMENDED = new Set([
  'mods',
  'config',
  'defaultconfigs',
  'kubejs',
  'scripts',
  'resourcepacks',
  'shaderpacks',
  'global_packs',
  'options.txt',
  'optionsof.txt',
  'optionsshaders.txt',
  'servers.dat'
])
/** 这些文件夹里的 jar / zip 可以改为 Modrinth 下载地址 */
const LINKABLE = ['mods/', 'resourcepacks/', 'shaderpacks/']

type Loader = ModpackExportInfo['loader']

/** 从版本 json 读出模组加载器与版本号 */
async function loaderOf(
  gameDir: string,
  versionId: string
): Promise<{ minecraftVersion: string; loader: Loader; loaderVersion: string }> {
  const json = JSON.parse(await readFile(join(gameDir, 'versions', versionId, `${versionId}.json`), 'utf-8'))
  const minecraftVersion: string = json.inheritsFrom ?? json.liuliMinecraftVersion ?? json.id
  const libs: string[] = (json.libraries ?? []).map((l: { name?: string }) => l.name ?? '')
  const gameArgs: string[] = (json.arguments?.game ?? []).filter((a: unknown) => typeof a === 'string')
  const argValue = (flag: string): string | undefined => {
    const i = gameArgs.indexOf(flag)
    return i >= 0 ? gameArgs[i + 1] : undefined
  }
  const lib = (re: RegExp): string | undefined => libs.map((n) => re.exec(n)?.[1]).find(Boolean)
  const stripMc = (v: string | undefined): string | undefined =>
    v?.replace(new RegExp(`^${minecraftVersion.replace(/\./g, '\\.')}-`), '')

  let v = lib(/^net\.fabricmc:fabric-loader:([^:]+)/)
  if (v) return { minecraftVersion, loader: 'fabric', loaderVersion: v }
  v = lib(/^org\.quiltmc:quilt-loader:([^:]+)/)
  if (v) return { minecraftVersion, loader: 'quilt', loaderVersion: v }
  v = argValue('--fml.neoForgeVersion') ?? lib(/^net\.neoforged:neoforge:([^:]+)/)
  if (v) return { minecraftVersion, loader: 'neoforge', loaderVersion: v }
  // 1.20.1 的 NeoForge 沿用 Forge 的格式
  v = stripMc(lib(/^net\.neoforged:forge:([^:]+)/))
  if (v) return { minecraftVersion, loader: 'neoforge', loaderVersion: v }
  v = argValue('--fml.forgeVersion') ?? stripMc(lib(/^net\.minecraftforge:(?:forge|fmlloader):([^:]+)/))
  if (v) return { minecraftVersion, loader: 'forge', loaderVersion: v }
  return { minecraftVersion, loader: null, loaderVersion: '' }
}

/** 版本使用的游戏目录（考虑版本隔离） */
async function gameDirOf(versionId: string): Promise<string> {
  return dirname((await modsContextOf(versionId)).dir)
}

async function measure(path: string): Promise<{ size: number; files: number }> {
  const info = await stat(path)
  if (!info.isDirectory()) return { size: info.size, files: 1 }
  let size = 0
  let files = 0
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    const child = await measure(join(path, entry.name)).catch(() => ({ size: 0, files: 0 }))
    size += child.size
    files += child.files
  }
  return { size, files }
}

/** 读取可以导出的内容与版本信息 */
export async function getModpackExportInfo(versionId: string): Promise<ModpackExportInfo> {
  assertSafeId(versionId)
  const { gameDir } = await getSettings()
  const { minecraftVersion, loader, loaderVersion } = await loaderOf(gameDir, versionId)
  const dir = await gameDirOf(versionId)
  const excluded = new Set([...EXCLUDED, `${versionId}.json`, `${versionId}.jar`, `${versionId}-natives`])
  const entries: ExportableEntry[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const name = entry.name
    if (excluded.has(name) || /\.(log|tmp)$/i.test(name) || /^hs_err_pid/.test(name)) continue
    if (!entry.isDirectory() && !entry.isFile()) continue
    const { size, files } = await measure(join(dir, name))
    if (entry.isDirectory() && files === 0) continue
    entries.push({ name, isDirectory: entry.isDirectory(), size, files, recommended: RECOMMENDED.has(name) })
  }
  entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
  return { versionId, minecraftVersion, loader, loaderVersion, entries }
}

const EXTENSIONS: Record<ModpackExportFormat, string> = {
  modrinth: 'mrpack',
  curseforge: 'zip',
  multimc: 'zip',
  mcbbs: 'zip'
}

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf-8')
}

/** 弹出保存对话框并导出整合包；用户取消时返回 null */
export async function exportModpack(
  options: ModpackExportOptions,
  win: BrowserWindow | null
): Promise<ModpackExportResult | null> {
  const game = getGameStatus()
  if ((game.state === 'launching' || game.state === 'running') && game.versionId === options.versionId) {
    throw new Error('游戏正在运行，请退出游戏后再导出')
  }
  const name = options.name.trim()
  if (!name) throw new Error('请填写整合包名称')
  const info = await getModpackExportInfo(options.versionId)
  const allowed = new Set(info.entries.map((e) => e.name))
  const include = options.include.filter((n) => allowed.has(n))
  if (include.length === 0) throw new Error('请至少选择一项要导出的内容')

  const fileName = `${name}${options.version ? ` ${options.version}` : ''}.${EXTENSIONS[options.format]}`.replace(
    /[\\/:*?"<>|]/g,
    '_'
  )
  const dialogOptions: Electron.SaveDialogOptions = {
    title: '导出整合包',
    defaultPath: join(app.getPath('desktop'), fileName),
    filters: [{ name: '整合包', extensions: [EXTENSIONS[options.format]] }]
  }
  const picked = win ? await dialog.showSaveDialog(win, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
  if (picked.canceled || !picked.filePath) return null
  const result = await writeModpack(picked.filePath, options, info, include, (done, total) =>
    win?.webContents.send('export:progress', { done, total })
  )
  lastExport = result.path
  return result
}

/** 最近一次导出的文件（「在文件夹中显示」只能打开它） */
let lastExport: string | null = null

export function showExportedModpack(): void {
  if (lastExport) shell.showItemInFolder(lastExport)
}

/** 生成整合包文件（不弹对话框，供测试与导出共用） */
export async function writeModpack(
  dest: string,
  options: ModpackExportOptions,
  info: ModpackExportInfo,
  include: string[],
  onProgress?: (done: number, total: number) => void
): Promise<ModpackExportResult> {
  const dir = await gameDirOf(options.versionId)
  // 游戏目录里要导出的文件（相对路径使用 /）
  const files: ZipEntry[] = []
  for (const name of include) {
    const path = join(dir, name)
    if ((await stat(path)).isDirectory()) files.push(...(await directoryEntries(path, `${name}/`)))
    else files.push({ name, file: path })
  }
  const contentFiles = files.filter((f) => f.file)

  // Modrinth 格式：能在 Modrinth 上找到的文件只写下载地址
  const linked: { path: string; sha1: string; sha512: string; url: string; size: number }[] = []
  if (options.format === 'modrinth' && options.useModrinthLinks) {
    const candidates = contentFiles.filter(
      (f) => LINKABLE.some((p) => f.name.startsWith(p)) && /\.(jar|zip)$/i.test(f.name)
    )
    const hashes = new Map<string, { sha1: string; sha512: string; size: number }>()
    for (const f of candidates) {
      const data = await readFile(f.file!)
      hashes.set(f.name, {
        sha1: createHash('sha1').update(data).digest('hex'),
        sha512: createHash('sha512').update(data).digest('hex'),
        size: data.length
      })
    }
    try {
      const found = await lookupModrinthFiles([...new Set([...hashes.values()].map((h) => h.sha1))])
      for (const [path, h] of hashes) {
        const remote = found.get(h.sha1)
        // Modrinth 规定下载地址只能来自这些网站
        if (remote && isAllowedModpackUrl(remote.url)) {
          linked.push({ path, sha1: h.sha1, sha512: h.sha512, url: remote.url, size: h.size })
        }
      }
    } catch {
      // 查询失败时全部打包进整合包
    }
  }
  const linkedPaths = new Set(linked.map((l) => l.path))
  const bundled = files.filter((f) => !linkedPaths.has(f.name))
  const under = (prefix: string): ZipEntry[] => bundled.map((f) => ({ ...f, name: prefix + f.name }))

  const { minecraftVersion, loader, loaderVersion } = info
  const name = options.name.trim()
  const author = options.author.trim()
  const entries: ZipEntry[] = []
  switch (options.format) {
    case 'modrinth': {
      const dependencies: Record<string, string> = { minecraft: minecraftVersion }
      if (loader) dependencies[loader === 'fabric' || loader === 'quilt' ? `${loader}-loader` : loader] = loaderVersion
      entries.push({
        name: 'modrinth.index.json',
        data: json({
          formatVersion: 1,
          game: 'minecraft',
          versionId: options.version || '1.0.0',
          name,
          summary: options.description || undefined,
          files: linked.map((l) => ({
            path: l.path,
            hashes: { sha1: l.sha1, sha512: l.sha512 },
            downloads: [l.url],
            fileSize: l.size
          })),
          dependencies
        })
      })
      entries.push(...under('overrides/'))
      break
    }
    case 'curseforge':
    case 'mcbbs': {
      const manifest = {
        minecraft: {
          version: minecraftVersion,
          modLoaders: loader ? [{ id: `${loader}-${loaderVersion}`, primary: true }] : []
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        name,
        version: options.version,
        author,
        files: [],
        overrides: 'overrides'
      }
      if (options.format === 'mcbbs') {
        entries.push({
          name: 'mcbbs.packmeta',
          data: json({
            manifestType: 'minecraftModpack',
            manifestVersion: 2,
            name,
            version: options.version,
            author,
            description: options.description,
            url: '',
            forceUpdate: false,
            origin: [],
            addons: [
              { id: 'game', version: minecraftVersion },
              ...(loader ? [{ id: loader, version: loaderVersion }] : [])
            ],
            libraries: [],
            files: [],
            settings: { install_mods: true, install_resourcepack: true },
            launchInfo: { minMemory: 0, launchArgument: [], javaArgument: [] }
          })
        })
      }
      // MCBBS 整合包同时带上 CurseForge 的 manifest.json，兼容更多启动器
      entries.push({ name: 'manifest.json', data: json(manifest) })
      entries.push(...under('overrides/'))
      break
    }
    case 'multimc': {
      const root = `${name.replace(/[\\/:*?"<>|]/g, '_')}/`
      const components: { uid: string; version: string; important?: boolean; dependencyOnly?: boolean }[] = [
        { uid: 'net.minecraft', version: minecraftVersion, important: true }
      ]
      if (loader === 'fabric' || loader === 'quilt') {
        components.push({ uid: 'net.fabricmc.intermediary', version: minecraftVersion, dependencyOnly: true })
      }
      const uid = {
        fabric: 'net.fabricmc.fabric-loader',
        quilt: 'org.quiltmc.quilt-loader',
        forge: 'net.minecraftforge',
        neoforge: 'net.neoforged'
      }
      if (loader) components.push({ uid: uid[loader], version: loaderVersion })
      entries.push({ name: root })
      entries.push({ name: `${root}instance.cfg`, data: Buffer.from(`InstanceType=OneSix\nname=${name}\n`, 'utf-8') })
      entries.push({ name: `${root}mmc-pack.json`, data: json({ formatVersion: 1, components }) })
      entries.push(...under(`${root}.minecraft/`))
      break
    }
  }

  const { size } = await writeZip(dest, entries, onProgress)
  return { path: dest, files: bundled.filter((f) => f.file).length, linked: linked.length, size }
}
