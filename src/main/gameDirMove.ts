import { mkdir, readdir, rename, rmdir, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { defaultGameDir, legacyGameDir } from './config'
import { moveGameDirTrust } from './versionTrust'

/**
 * 游戏文件和启动器文件分开放：旧版本（0.5.1 及以前）把默认游戏目录放在启动器的数据文件夹里，
 * 这里把它搬到新的默认位置（免安装版：exe 旁边的 .minecraft；安装版：系统的 .minecraft）。
 *
 * 只改名，不复制、不删除任何文件：同一个磁盘上瞬间完成。新位置已经有 .minecraft、在不同的磁盘、
 * 文件被占用（例如游戏还在运行）时什么都不做，继续使用原来的位置（设置里改名为「旧的默认目录」），下次启动再试。
 *
 * 必须在第一次读取设置之前调用（index.ts 拿到单实例锁后马上调用）：读取设置时按搬没搬走决定用哪个位置
 */
export async function moveLegacyGameDir(): Promise<void> {
  const from = legacyGameDir()
  const to = defaultGameDir()
  if (!(await isDirectory(from))) return
  const existing = await stat(to).catch(() => null)
  if (existing) {
    // 新位置只有一个空文件夹时可以替换，有任何内容都不动
    if (!existing.isDirectory() || (await readdir(to).catch(() => ['?'])).length > 0) return
    await rmdir(to).catch(() => undefined)
    if (await stat(to).catch(() => null)) return
  }
  try {
    await mkdir(dirname(to), { recursive: true })
    await renameWithRetry(from, to)
  } catch (e) {
    console.warn('游戏目录没能搬到新位置，继续使用原来的位置：', e)
    return
  }
  // 版本设置里认可过的命令、Java 等，在新位置继续有效
  const versions = await readdir(join(to, 'versions')).catch(() => [] as string[])
  await moveGameDirTrust(from, to, versions).catch(() => undefined)
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false
}

/** Windows 上杀毒软件扫描时可能暂时无法改名，稍等重试几次 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (attempt >= 3 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
}
