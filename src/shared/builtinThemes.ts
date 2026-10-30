/**
 * 精选主题：启动器自带的几套完整外观，每套都有专属的高清壁纸（2560×1440）和背景音乐。
 * 壁纸是用代码渲染的原创方块风景，音乐是程序生成的原创钢琴氛围曲，都不使用任何游戏或他人的素材，
 * 文件在 resources/themes 里，应用时复制到背景库和音乐文件夹（之后可以像自己添加的一样删除）。
 */
import type { ThemeData } from './types'

export interface BuiltinTheme {
  id: string
  name: string
  description: string
  /** 背景音乐的名称（同时作为复制到音乐文件夹里的文件名） */
  musicTitle: string
  /** 除了壁纸和音乐以外的外观 */
  data: Omit<ThemeData, 'backgroundImage' | 'music'>
}

const base = {
  theme: 'dark',
  customAccent: '#10b981',
  // 壁纸细节多：稍微模糊并压暗壁纸、加强毛玻璃，小字也看得清
  panelOpacity: 14,
  panelBlur: 32,
  particleEffect: 'auto',
  particleDensity: 'normal',
  particleSpeed: 100,
  particleInteract: true,
  parallax: true,
  backgroundMode: 'fixed',
  backgroundFit: 'cover',
  backgroundBlur: 2
} as const

export const BUILTIN_THEMES: BuiltinTheme[] = [
  {
    id: 'plains',
    name: '晨光平原',
    description: '河流穿过开满野花的草原，远处是被夕阳染暖的雪山',
    musicTitle: '晨光平原 · 原创钢琴曲',
    data: { ...base, themePreset: 'sky', accentColor: 'amber', backgroundDim: 38 }
  },
  {
    id: 'cherry',
    name: '樱花之境',
    description: '粉色的樱花林环抱着一汪小湖，花瓣随风飘落',
    musicTitle: '樱花之境 · 原创钢琴曲',
    data: { ...base, themePreset: 'cherry', accentColor: 'rose', backgroundDim: 40 }
  },
  {
    id: 'aurora_night',
    name: '雪原极光',
    description: '星空下的冰湖与云杉林，绿色极光在雪山间流动',
    musicTitle: '雪原极光 · 原创钢琴曲',
    data: { ...base, themePreset: 'aurora', accentColor: 'teal', backgroundDim: 28 }
  },
  {
    id: 'nether',
    name: '熔岩峡谷',
    description: '炽热的熔岩海穿过暗红色的峡谷，火星在空中飞舞',
    musicTitle: '熔岩峡谷 · 原创钢琴曲',
    data: { ...base, themePreset: 'nether', accentColor: 'red', backgroundDim: 34 }
  },
  {
    id: 'the_end',
    name: '星海浮岛',
    description: '漂浮在紫色星海中的岛屿，水晶在石柱顶端闪耀',
    musicTitle: '星海浮岛 · 原创钢琴曲',
    data: { ...base, themePreset: 'end', accentColor: 'violet', backgroundDim: 22 }
  }
]

/** 复制到背景库里的壁纸文件名 */
export function builtinWallpaperName(id: string): string {
  return `liuli-theme-${id}.webp`
}

/** 复制到音乐文件夹里的文件名 */
export function builtinMusicName(theme: BuiltinTheme): string {
  return `${theme.musicTitle}.ogg`
}
