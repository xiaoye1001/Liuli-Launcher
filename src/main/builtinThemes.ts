import { copyFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { getSettings, updateSettings } from './config'
import { BACKGROUND_DIR, MAX_BACKGROUNDS } from './appearance'
import { MUSIC_DIR } from './music'
import { BUILTIN_THEMES, builtinMusicName, builtinWallpaperName } from '../shared/builtinThemes'
import { themePatch } from '../shared/theme'
import type { AppSettings } from '../shared/types'

/**
 * 精选主题的壁纸和音乐在安装目录的 resources/themes 里（打包时解压在 app.asar 外面，见 electron-builder 的 asarUnpack），
 * 开发时在项目根目录的 resources/themes
 */
function themesDir(): string {
  // 主进程代码在 <应用根目录>/out/main 里：往上两级就是应用根目录（开发时是项目目录，打包后是 app.asar）
  return join(__dirname, '..', '..', 'resources', 'themes').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

/** 文件不存在或大小不同（例如复制到一半）时复制 */
async function ensureCopy(source: string, target: string): Promise<void> {
  const [from, to] = await Promise.all([stat(source), stat(target).catch(() => null)])
  if (to && to.size === from.size) return
  await copyFile(source, target)
}

/**
 * 应用精选主题：把壁纸复制进背景库、音乐复制进音乐文件夹（已经有了就不重复复制），
 * 然后应用整套外观，并只循环播放这首音乐
 */
export async function applyBuiltinTheme(id: unknown): Promise<AppSettings> {
  const theme = BUILTIN_THEMES.find((t) => t.id === id)
  if (!theme) throw new Error('找不到这个主题')
  const dir = themesDir()
  const settings = await getSettings()

  const wallpaper = builtinWallpaperName(theme.id)
  let library = [...settings.backgroundImages]
  if (!library.includes(wallpaper)) {
    if (library.length >= MAX_BACKGROUNDS)
      throw new Error(`背景库最多 ${MAX_BACKGROUNDS} 张，请先删除一些再应用这个主题`)
    library = [...library, wallpaper]
  }
  await mkdir(BACKGROUND_DIR, { recursive: true })
  await ensureCopy(join(dir, `${theme.id}.webp`), join(BACKGROUND_DIR, wallpaper))

  const music = builtinMusicName(theme)
  await mkdir(MUSIC_DIR, { recursive: true })
  await ensureCopy(join(dir, `${theme.id}.ogg`), join(MUSIC_DIR, music))

  return updateSettings({
    backgroundImages: library,
    ...themePatch({ ...theme.data, backgroundImage: wallpaper, music }, library)
  })
}
