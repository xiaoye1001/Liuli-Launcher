import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../../../shared/types'

/** 需要立即在界面上生效的外观设置 */
export type Appearance = Pick<
  AppSettings,
  'accentColor' | 'backgroundImage' | 'backgroundBlur' | 'backgroundDim' | 'animations'
>

let current: Appearance = {
  accentColor: 'emerald',
  backgroundImage: '',
  backgroundBlur: 0,
  backgroundDim: 30,
  animations: true
}
const listeners = new Set<() => void>()

function apply(settings: AppSettings): void {
  current = {
    accentColor: settings.accentColor,
    backgroundImage: settings.backgroundImage,
    backgroundBlur: settings.backgroundBlur,
    backgroundDim: settings.backgroundDim,
    animations: settings.animations
  }
  const html = document.documentElement
  html.dataset.accent = settings.accentColor
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
