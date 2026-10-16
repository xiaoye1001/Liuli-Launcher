import { app } from 'electron'
import { accessSync, constants, mkdirSync } from 'fs'
import { join } from 'path'

/** 免安装版的数据文件夹名（放在 exe 旁边） */
const PORTABLE_DATA_DIR = 'LiuliLauncher-Data'

/**
 * 免安装版（electron-builder 的 portable 目标）运行时会设置 PORTABLE_EXECUTABLE_DIR，
 * 数据放在 exe 旁边，整个文件夹复制到 U 盘就能带走；该位置不可写（例如放在 Program Files 里）时返回 null
 */
function portableDataDir(): string | null {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (!exeDir) return null
  const dir = join(exeDir, PORTABLE_DATA_DIR)
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return dir
  } catch {
    return null
  }
}

/** 是否以免安装版运行，且数据保存在 exe 旁边 */
export const portableDir = portableDataDir()

/**
 * 固定用户数据目录（设置、账号、默认游戏目录都在这里）。
 * Electron 默认按程序名决定这个目录，以后打包时改了显示名称也不能让数据「消失」，
 * 所以必须在其他模块读取 userData 之前执行（index.ts 第一个导入本模块）。
 */
app.setPath('userData', portableDir ?? join(app.getPath('appData'), 'mc_launcher'))
