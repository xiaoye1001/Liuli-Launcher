import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../../../shared/types'
import { ACCENT_VARIABLE_NAMES, accentVariables } from './accent'

/** 需要立即在界面上生效的外观设置 */
export type Appearance = Pick<
  AppSettings,
  | 'accentColor'
  | 'backgroundImage'
  | 'backgroundImages'
  | 'backgroundMode'
  | 'backgroundInterval'
  | 'backgroundFit'
  | 'themePreset'
  | 'particleEffect'
  | 'backgroundBlur'
  | 'backgroundDim'
  | 'animations'
  | 'launcherTitle'
  | 'launcherSubtitle'
  | 'hiddenPages'
  | 'welcomeTitle'
  | 'welcomeSubtitle'
>

export const DEFAULT_TITLE = '琉璃启动器'
export const DEFAULT_SUBTITLE = 'Liuli Launcher'

let current: Appearance = {
  accentColor: 'emerald',
  backgroundImage: '',
  backgroundImages: [],
  backgroundMode: 'off',
  backgroundInterval: 10,
  backgroundFit: 'cover',
  themePreset: 'aurora',
  particleEffect: 'auto',
  backgroundBlur: 0,
  backgroundDim: 30,
  animations: true,
  launcherTitle: '',
  launcherSubtitle: '',
  hiddenPages: [],
  welcomeTitle: '',
  welcomeSubtitle: ''
}
const listeners = new Set<() => void>()

function apply(settings: AppSettings): void {
  current = {
    accentColor: settings.accentColor,
    backgroundImage: settings.backgroundImage,
    backgroundImages: Array.isArray(settings.backgroundImages) ? settings.backgroundImages : [],
    backgroundMode: settings.backgroundMode ?? 'off',
    backgroundInterval: settings.backgroundInterval || 10,
    backgroundFit: settings.backgroundFit ?? 'cover',
    themePreset: settings.themePreset ?? 'aurora',
    particleEffect: settings.particleEffect ?? 'auto',
    backgroundBlur: settings.backgroundBlur,
    backgroundDim: settings.backgroundDim,
    animations: settings.animations,
    launcherTitle: settings.launcherTitle ?? '',
    launcherSubtitle: settings.launcherSubtitle ?? '',
    hiddenPages: Array.isArray(settings.hiddenPages) ? settings.hiddenPages : [],
    welcomeTitle: settings.welcomeTitle ?? '',
    welcomeSubtitle: settings.welcomeSubtitle ?? ''
  }
  // 主窗口的标题跟随自定义的启动器名称（日志窗口有自己的标题）
  if (window.location.hash !== '#logs') document.title = current.launcherTitle || DEFAULT_TITLE
  const html = document.documentElement
  html.dataset.accent = settings.accentColor
  // 主题方案：决定底色与动态背景（样式见 index.css 的 html[data-preset]）
  html.dataset.preset = current.themePreset
  // 自定义主题色：把算好的色阶写到 <html> 上；换回预设时清掉
  const custom = settings.accentColor === 'custom' ? accentVariables(settings.customAccent ?? '') : null
  for (const name of ACCENT_VARIABLE_NAMES) {
    if (custom) html.style.setProperty(name, custom[name])
    else html.style.removeProperty(name)
  }
  // 面板质感
  const opacity = Number.isFinite(settings.panelOpacity) ? Math.min(60, Math.max(0, settings.panelOpacity)) : 10
  const blur = Number.isFinite(settings.panelBlur) ? Math.min(40, Math.max(0, settings.panelBlur)) : 24
  html.style.setProperty('--panel-alpha', String(opacity / 100))
  html.style.setProperty('--panel-blur', `${blur}px`)
  // 界面字体：名称已由主进程清理过，这里再加引号作为一个整体
  const font = (settings.fontFamily ?? '').replace(/["\\]/g, '').trim()
  if (font) html.style.setProperty('--app-font', `"${font}"`)
  else html.style.removeProperty('--app-font')
  html.classList.toggle('no-anim', !settings.animations)
  listeners.forEach((listener) => listener())
}

/** 读取外观设置并监听变化（任意窗口修改设置后，主进程会推送给所有窗口） */
export function initAppearance(): void {
  window.api.getSettings().then(apply)
  window.api.onSettingsChanged(apply)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current)
}

/** 背景图片的地址（由主进程的 liuli:// 协议提供） */
export function backgroundUrl(name: string): string {
  return `liuli://background/${encodeURIComponent(name)}`
}
