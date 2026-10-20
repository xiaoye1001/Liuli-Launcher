import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'

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
 * 只修改这一项，其他设置原样保留；options.txt 不存在（第一次启动）时只写这一项，其余由游戏补上默认值。
 * 返回是否做了修改
 */
export async function applyDarkLoadingScreen(gamePath: string, minecraftVersion: string): Promise<boolean> {
  if (!supportsDarkLoadingScreen(minecraftVersion)) return false
  const file = join(gamePath, 'options.txt')
  let text = ''
  try {
    text = await readFile(file, 'utf-8')
  } catch (e) {
    // 读取失败（被占用等）时不动它；只有文件不存在才新建
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false
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
  await mkdir(gamePath, { recursive: true })
  // 先写临时文件再改名，不会留下写了一半的 options.txt
  const tmp = `${file}.liuli-tmp`
  await writeFile(tmp, lines.join(eol) + eol, 'utf-8')
  await rename(tmp, file)
  return true
}
