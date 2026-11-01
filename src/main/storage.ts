import { app } from 'electron'
import { readdir, rm, stat } from 'fs/promises'
import { isAbsolute, join, relative } from 'path'

/**
 * 控制启动器数据文件夹占用的空间：
 * - 浏览器缓存（下载页的模组图标、截图、新闻图片等）最多 64 MB。Chromium 默认按磁盘剩余空间决定上限，
 *   空间大的电脑上会用到几百 MB
 * - 启动器下载的整合包、OptiFine 安装器用完就删（见 discardDownloadedFile）；
 *   安装失败或中途关闭启动器留下的，下次启动时清理一天前的（见 pruneDownloadCache）
 *
 * 必须在 app ready 之前导入（index.ts 紧跟在 paths 后面导入），命令行开关才会生效
 */
const HTTP_CACHE_BYTES = 64 * 1024 * 1024
app.commandLine.appendSwitch('disk-cache-size', String(HTTP_CACHE_BYTES))

const DAY = 24 * 60 * 60 * 1000
/** 启动器下载、用完就不再需要的文件放在这些文件夹里 */
const DOWNLOAD_CACHE_DIRS = [
  join(app.getPath('userData'), 'cache', 'modpacks'),
  join(app.getPath('userData'), 'cache', 'optifine')
]

function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * 删除启动器自己下载、已经用完的文件（整合包、OptiFine 安装器）。
 * 只删启动器缓存文件夹里的文件：玩家自己拖进来、选择的整合包文件不删
 */
export async function discardDownloadedFile(path: string): Promise<void> {
  if (!DOWNLOAD_CACHE_DIRS.some((dir) => isInside(dir, path))) return
  await rm(path, { force: true }).catch(() => undefined)
}

/** 启动时调用：删除一天前下载、没有用完就留下的整合包和 OptiFine 安装器 */
export async function pruneDownloadCache(): Promise<void> {
  for (const dir of DOWNLOAD_CACHE_DIRS) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const path = join(dir, entry.name)
      const info = await stat(path).catch(() => null)
      if (info && Date.now() - info.mtimeMs > DAY) await rm(path, { force: true }).catch(() => undefined)
    }
  }
}
