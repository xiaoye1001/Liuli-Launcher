import { themePatch } from '../../../shared/theme'
import type { AppSettings, CustomTheme, ParticleEffect, ThemePreset } from '../../../shared/types'

/** 主题方案：一键切换配色、明暗、面板质感与专属动态背景 */
export interface ThemePresetInfo {
  key: ThemePreset
  name: string
  emoji: string
  desc: string
  /** 深色 / 浅色；null 表示不改变当前的明暗设置 */
  mode: 'dark' | 'light' | null
  /** 强调色（null 表示保留当前主题色） */
  accent: string | null
  /** 跟随主题时使用的粒子特效 */
  particles: Exclude<ParticleEffect, 'auto'>
  /** 面板不透明度（%）与模糊（px） */
  panelOpacity: number
  panelBlur: number
  /** 设置页卡片里的预览底色 */
  preview: string
  /** 预览里的光斑颜色 */
  glow: string[]
}

export const THEME_PRESET_LIST: ThemePresetInfo[] = [
  {
    key: 'aurora',
    name: '极夜流光',
    emoji: '🌌',
    desc: '石板灰底色，缓慢流动的翡翠极光',
    mode: 'dark',
    accent: '#1bd96a',
    particles: 'none',
    panelOpacity: 8,
    panelBlur: 24,
    preview: 'linear-gradient(135deg, #0f1117, #12161f 60%, #0d1a16)',
    glow: ['#1bd96a', '#0ea5e9', '#6366f1']
  },
  {
    key: 'sky',
    name: '晴空柔光',
    emoji: '☀️',
    desc: '冰川蓝白，阳光光晕与飘动云雾',
    mode: 'light',
    accent: '#0ea5e9',
    particles: 'none',
    panelOpacity: 18,
    panelBlur: 24,
    preview: 'linear-gradient(180deg, #bfe6ff, #e8f6ff 55%, #f8fbff)',
    glow: ['#fff7d6', '#ffffff', '#bae6fd']
  },
  {
    key: 'cherry',
    name: '樱花物语',
    emoji: '🌸',
    desc: '粉紫夜空，樱花花瓣随风飘落',
    mode: 'dark',
    accent: '#f472b6',
    particles: 'sakura',
    panelOpacity: 9,
    panelBlur: 24,
    preview: 'linear-gradient(160deg, #1b1226, #2a1730 55%, #3b1d33)',
    glow: ['#f472b6', '#c084fc', '#fb7185']
  },
  {
    key: 'end',
    name: '末地星云',
    emoji: '🔮',
    desc: '深空星云，紫色星尘缓缓上浮',
    mode: 'dark',
    accent: '#a855f7',
    particles: 'ender',
    panelOpacity: 8,
    panelBlur: 26,
    preview: 'linear-gradient(160deg, #090514, #120a24 60%, #1a0b2e)',
    glow: ['#a855f7', '#6366f1', '#d946ef']
  },
  {
    key: 'acrylic',
    name: '极简亚克力',
    emoji: '🧊',
    desc: '深灰蓝微噪点，Win11 风格边缘高光',
    mode: 'dark',
    accent: '#3b82f6',
    particles: 'none',
    panelOpacity: 14,
    panelBlur: 32,
    preview: 'linear-gradient(160deg, #161b26, #1b2232 60%, #1a2540)',
    glow: ['#3b82f6', '#60a5fa', '#1e293b']
  },
  {
    key: 'nether',
    name: '下界余烬',
    emoji: '🔥',
    desc: '暗曜石黑红，底部热浪与升腾火星',
    mode: 'dark',
    accent: '#f97316',
    particles: 'embers',
    panelOpacity: 8,
    panelBlur: 22,
    preview: 'linear-gradient(180deg, #120808, #1c0b0b 55%, #3a1208)',
    glow: ['#f97316', '#dc2626', '#fbbf24']
  },
  {
    key: 'classic',
    name: '经典琉璃',
    emoji: '💎',
    desc: '原来的渐变背景，保留当前主题色',
    mode: null,
    accent: null,
    particles: 'none',
    panelOpacity: 10,
    panelBlur: 24,
    preview: 'linear-gradient(135deg, #0f172a, #1e1b4b, #064e3b)',
    glow: []
  }
]

export function presetInfo(key: ThemePreset | undefined): ThemePresetInfo {
  return THEME_PRESET_LIST.find((p) => p.key === key) ?? THEME_PRESET_LIST[0]
}

export const PARTICLE_OPTIONS: { key: ParticleEffect; label: string }[] = [
  { key: 'auto', label: '跟随主题' },
  { key: 'none', label: '无' },
  { key: 'sakura', label: '樱花飘落' },
  { key: 'ender', label: '末影星尘' },
  { key: 'fireflies', label: '萤火虫' },
  { key: 'rain', label: '细雨微尘' },
  { key: 'embers', label: '下界余烬' }
]

/** 切换到某个主题方案时要修改的设置 */
export function presetPatch(key: ThemePreset): Partial<AppSettings> {
  const info = presetInfo(key)
  return {
    themePreset: key,
    particleEffect: 'auto',
    // 主题方案没有专属音乐：恢复播放全部音乐
    themeMusic: '',
    panelOpacity: info.panelOpacity,
    panelBlur: info.panelBlur,
    ...(info.mode ? { theme: info.mode } : {}),
    ...(info.accent ? { accentColor: 'custom' as const, customAccent: info.accent } : {})
  }
}

/** 自动切换目标（preset:xxx / custom:id）对应的设置；找不到时返回 null */
export function targetPatch(
  target: string,
  customThemes: CustomTheme[],
  library: string[]
): Partial<AppSettings> | null {
  if (target.startsWith('preset:')) {
    const key = target.slice(7) as ThemePreset
    return THEME_PRESET_LIST.some((p) => p.key === key) ? presetPatch(key) : null
  }
  if (target.startsWith('custom:')) {
    const theme = customThemes.find((t) => t.id === target.slice(7))
    return theme ? themePatch(theme.data, library) : null
  }
  return null
}

/** 自动切换目标的显示名称 */
export function targetName(target: string, customThemes: CustomTheme[]): string {
  if (target.startsWith('preset:')) return presetInfo(target.slice(7) as ThemePreset).name
  return customThemes.find((t) => t.id === target.slice(7))?.name ?? '（已删除的主题）'
}
