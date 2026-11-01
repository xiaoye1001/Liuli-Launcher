import { existsSync } from 'fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'

/** 「默认设置」类模组：options.txt 不存在时复制整合包自带的设置（YOSBR、Default Options 等） */
const DEFAULT_OPTIONS_MODS = /yosbr|your.?options|default.?options|defaultsettings/i

/** 1.11（快照 16w32a）起语言代码是小写的 zh_cn，更早是 zh_CN；新的版本号格式（例如 26.1）按新版本处理 */
function langCode(minecraftVersion: string): string {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1]) >= 11 ? 'zh_cn' : 'zh_CN'
  const snapshot = /^(\d{2})w(\d{2})/.exec(minecraftVersion)
  if (snapshot) return Number(snapshot[1]) * 100 + Number(snapshot[2]) >= 1632 ? 'zh_cn' : 'zh_CN'
  if (/^\d{2}\.\d/.test(minecraftVersion)) return 'zh_cn'
  return 'zh_CN'
}

/**
 * 新版本默认简体中文：第一次启动（还没有 options.txt）时创建只有 lang 一项的 options.txt，其他设置由游戏补上默认值。
 * 已经有 options.txt 时不动；装了「默认设置」类模组时也不创建（它们在 options.txt 不存在时才复制整合包自带的设置）。
 * 整合包由调用方跳过。返回是否创建了文件
 */
export async function applyDefaultLanguage(gamePath: string, minecraftVersion: string): Promise<boolean> {
  const file = join(gamePath, 'options.txt')
  if (existsSync(file)) return false
  const mods = await readdir(join(gamePath, 'mods')).catch(() => [] as string[])
  if (mods.some((name) => DEFAULT_OPTIONS_MODS.test(name))) return false
  if (['yosbr', 'defaultoptions'].some((dir) => existsSync(join(gamePath, 'config', dir)))) return false
  await mkdir(gamePath, { recursive: true })
  try {
    // wx：文件已经存在时不覆盖
    await writeFile(file, `lang:${langCode(minecraftVersion)}\n`, { encoding: 'utf-8', flag: 'wx' })
  } catch {
    return false
  }
  return true
}

/** 游戏加载画面「单色标志」（黑色背景）在 options.txt 里的设置项，1.17 起才有 */
const DARK_KEY = 'darkMojangStudiosBackground'

/** 这个游戏版本有没有「单色标志」选项：1.17 及以上、2021 年及以后的快照；新的版本号格式（例如 26.1）按新版本处理 */
export function supportsDarkLoadingScreen(minecraftVersion: string): boolean {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1]) >= 17
  const snapshot = /^(\d{2})w\d{2}/.exec(minecraftVersion)
  if (snapshot) return Number(snapshot[1]) >= 21
  return /^\d{2,}\.\d+/.test(minecraftVersion)
}

/**
 * 把游戏加载画面的红色背景改成黑色：打开 options.txt 里的「单色标志」选项（游戏里在 设置 → 辅助功能）。
 * 只修改这一项，其他设置原样保留。options.txt 还不存在（第一次启动）时不创建：
 * 很多整合包用模组（例如 Your Options Shall Be Respected）在 options.txt 不存在时复制整合包自带的默认设置，
 * 抢先创建会让这些默认设置失效；从第二次启动开始生效。
 * 返回是否做了修改
 */
export async function applyDarkLoadingScreen(gamePath: string, minecraftVersion: string): Promise<boolean> {
  if (!supportsDarkLoadingScreen(minecraftVersion)) return false
  const file = join(gamePath, 'options.txt')
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch {
    // 不存在（第一次启动）或读取失败（被占用等）：不动它
    return false
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text ? text.split(/\r?\n/) : []
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const index = lines.findIndex((l) => l.startsWith(`${DARK_KEY}:`))
  if (index >= 0) {
    if (lines[index] === `${DARK_KEY}:true`) return false
    lines[index] = `${DARK_KEY}:true`
  } else {
    lines.push(`${DARK_KEY}:true`)
  }
  // 先写临时文件再改名，不会留下写了一半的 options.txt
  const tmp = `${file}.liuli-tmp`
  try {
    await writeFile(tmp, lines.join(eol) + eol, 'utf-8')
    await rename(tmp, file)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
  return true
}
