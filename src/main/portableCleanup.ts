import { readdir, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { portableDir } from './paths'

/**
 * 免安装版的程序文件解压在 exe 旁边的 LiuliLauncher-Data\launcher\<版本号>（见 build/portable.nsi），
 * 更新到新版本后，旧版本的文件夹就用不到了：新版本启动后把它们删掉。
 * 只删 launcher 文件夹里、名字是版本号、不是自己正在使用的文件夹；旧版本还没完全退出时文件被占用，稍后重试。
 */
export async function cleanupOldPortableVersions(): Promise<void> {
  if (!portableDir || process.platform !== 'win32') return
  const root = join(portableDir, 'launcher')
  const current = dirname(process.execPath)
  // 不是从 launcher\<版本号> 运行（例如 exe 所在的文件夹不能写入，解压到了临时文件夹）：什么都不做
  if (dirname(current).toLowerCase() !== root.toLowerCase()) return
  let names: string[]
  try {
    const entries = await readdir(root, { withFileTypes: true })
    // 只处理真正的文件夹（不跟随链接），名字必须是版本号
    names = entries
      .filter((e) => e.isDirectory() && /^\d+(\.\d+){1,3}([-+][0-9A-Za-z.-]+)?$/.test(e.name))
      .map((e) => join(root, e.name))
      .filter((dir) => dir.toLowerCase() !== current.toLowerCase())
  } catch {
    return
  }
  for (let attempt = 0; attempt < 30 && names.length > 0; attempt++) {
    for (const dir of [...names]) {
      try {
        await rm(dir, { recursive: true, force: true })
        names.splice(names.indexOf(dir), 1)
      } catch {
        // 旧版本的外壳程序还没退出，稍后再试
      }
    }
    if (names.length > 0) await new Promise((resolve) => setTimeout(resolve, 4000))
  }
}
