import { BrowserWindow, dialog } from 'electron'
import { getDefaultAgent } from '@xmcl/file-transfer'
import { DownloadMultipleTask } from '@xmcl/installer'
import { task as createTask } from '@xmcl/task'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { mkdir, writeFile } from 'fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'path'
import { startCustomInstall, type InstallExtraStep } from './install'
import { modrinthFileUrls, MODRINTH_USER_AGENT } from './modrinth'
import type { InstallRequest, ModpackInfo } from '../shared/types'

/** Modrinth 整合包（.mrpack）的 modrinth.index.json */
interface MrpackIndex {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: {
    path: string
    hashes: { sha1: string; sha512?: string }
    env?: { client?: 'required' | 'optional' | 'unsupported'; server?: string }
    downloads: string[]
    fileSize: number
  }[]
  dependencies: Record<string, string>
}

const OVERRIDE_DIRS = ['overrides/', 'client-overrides/']

/** 只允许整合包写入游戏目录内部，防止 ../ 之类的路径写到其他地方 */
function isSafePath(path: string): boolean {
  if (!path || isAbsolute(path) || /^[a-zA-Z]:/.test(path)) return false
  return !path.split(/[\\/]/).includes('..')
}

function safeJoin(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!isSafePath(path) || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`整合包中包含不安全的文件路径：${path}`)
  }
  return target
}

/** 客户端需要的文件（服务端专用的跳过） */
function clientFiles(index: MrpackIndex): MrpackIndex['files'] {
  return index.files.filter((f) => f.env?.client !== 'unsupported')
}

async function readIndex(path: string): Promise<{ index: MrpackIndex; overrideCount: number }> {
  const zip = await open(path).catch(() => {
    throw new Error('无法读取整合包，文件可能已损坏或不是 .mrpack 格式')
  })
  try {
    const entries = await readAllEntries(zip)
    const indexEntry = entries.find((e) => e.fileName === 'modrinth.index.json')
    if (!indexEntry) throw new Error('这不是 Modrinth 整合包（缺少 modrinth.index.json）')
    const index = JSON.parse((await readEntry(zip, indexEntry)).toString('utf-8')) as MrpackIndex
    if (index.game !== 'minecraft' || !index.dependencies?.minecraft) throw new Error('整合包格式不正确')
    // 读取时就检查所有路径，有问题的整合包在开始安装前就拒绝
    const unsafe =
      index.files.find((f) => !isSafePath(f.path))?.path ??
      entries.find((e) => OVERRIDE_DIRS.some((d) => e.fileName.startsWith(d)) && !isSafePath(e.fileName))?.fileName
    if (unsafe) throw new Error(`整合包中包含不安全的文件路径：${unsafe}，已拒绝安装`)
    const overrideCount = entries.filter(
      (e) => !e.fileName.endsWith('/') && OVERRIDE_DIRS.some((d) => e.fileName.startsWith(d))
    ).length
    return { index, overrideCount }
  } finally {
    zip.close()
  }
}

function describe(path: string, index: MrpackIndex, overrideCount: number): ModpackInfo {
  const deps = index.dependencies
  const loader = deps['fabric-loader']
    ? 'fabric'
    : deps.forge
      ? 'forge'
      : deps.neoforge
        ? 'neoforge'
        : deps['quilt-loader']
          ? 'quilt'
          : null
  const files = clientFiles(index)
  return {
    fileName: basename(path),
    name: index.name,
    version: index.versionId,
    summary: index.summary ?? '',
    minecraftVersion: deps.minecraft,
    loader,
    loaderVersion: loader
      ? deps[loader === 'fabric' ? 'fabric-loader' : loader === 'quilt' ? 'quilt-loader' : loader]
      : '',
    fileCount: files.length,
    totalSize: files.reduce((sum, f) => sum + (f.fileSize ?? 0), 0),
    overrideCount
  }
}

/** 用户最近选择的整合包（安装时只使用主进程自己记录的路径，不接受界面传入的路径） */
let pending: { path: string; info: ModpackInfo } | null = null

/** 选择 .mrpack 文件并读取信息，取消时返回 null */
export async function pickModpack(win: BrowserWindow | null): Promise<ModpackInfo | null> {
  const options: Electron.OpenDialogOptions = {
    title: '导入整合包',
    filters: [{ name: 'Modrinth 整合包', extensions: ['mrpack'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  return loadModpack(path)
}

/** 读取整合包并记为待安装 */
export async function loadModpack(path: string): Promise<ModpackInfo> {
  const { index, overrideCount } = await readIndex(path)
  const info = describe(path, index, overrideCount)
  pending = { path, info }
  return info
}

/** 整合包的加载器版本转换为安装请求 */
function toRequest(info: ModpackInfo, name: string): InstallRequest {
  const mc = info.minecraftVersion
  const request: InstallRequest = { minecraftVersion: mc, name }
  if (info.loader === 'quilt') throw new Error('暂不支持 Quilt 整合包')
  if (info.loader === 'fabric') request.fabricLoader = info.loaderVersion
  if (info.loader === 'forge') {
    // 有的整合包写成「1.20.1-47.2.0」，统一为 Forge 版本号本身
    request.forgeVersion = info.loaderVersion.replace(`${mc}-`, '')
  }
  if (info.loader === 'neoforge') {
    // 1.20.1 的 NeoForge 沿用 Forge 的版本格式（1.20.1-47.1.x）
    request.neoforgeVersion =
      mc === '1.20.1' && !info.loaderVersion.startsWith('1.20.1-') ? `1.20.1-${info.loaderVersion}` : info.loaderVersion
  }
  return request
}

/** 下载整合包中的模组等文件，并解压 overrides 到该版本的游戏目录 */
function modpackStep(path: string): InstallExtraStep {
  return async (context, gameDir) => {
    const { index } = await readIndex(path)
    const files = clientFiles(index)
    if (files.length > 0) {
      const downloads = await Promise.all(
        files.map(async (file) => ({
          url: await modrinthFileUrls(file.downloads),
          destination: safeJoin(gameDir, file.path),
          validator: { algorithm: 'sha1', hash: file.hashes.sha1 },
          headers: { 'User-Agent': MODRINTH_USER_AGENT },
          dispatcher: getDefaultAgent({ maxRetries: 3 })
        }))
      )
      await context.yield(new DownloadMultipleTask(downloads).setName('modpackFiles'))
    }
    await context.yield(
      createTask('modpackOverrides', async () => {
        const zip = await open(path)
        try {
          const entries = await readAllEntries(zip)
          // 先 overrides 再 client-overrides，客户端专用的配置覆盖通用配置
          for (const dir of OVERRIDE_DIRS) {
            for (const entry of entries) {
              if (!entry.fileName.startsWith(dir) || entry.fileName.endsWith('/')) continue
              const target = safeJoin(gameDir, entry.fileName.slice(dir.length))
              await mkdir(dirname(target), { recursive: true })
              await writeFile(target, await readEntry(zip, entry))
            }
          }
        } finally {
          zip.close()
        }
      })
    )
  }
}

/** 安装最近选择的整合包 */
export async function installModpack(name: string): Promise<void> {
  if (!pending) throw new Error('请先选择整合包')
  const { path, info } = pending
  await startCustomInstall(toRequest(info, name), false, modpackStep(path))
}
