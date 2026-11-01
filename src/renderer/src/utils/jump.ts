import { SETTINGS_TAB_KEY } from './settingsTab'

/**
 * 快速搜索（Ctrl+K）跳到某个页面里的分类：先记到 localStorage（页面打开时读取），
 * 页面已经打开时再通过事件切换
 */
export const JUMP_EVENT = 'liuli-jump'
/** 百宝箱记住的工具（localStorage 的键，和 MorePage 一致） */
export const TOOLBOX_KEY = 'liuli-toolbox-tool'

/** 侧边栏等地方打开快速搜索时发出的事件 */
export const OPEN_PALETTE_EVENT = 'liuli-open-palette'

export const IS_MAC = navigator.platform.toLowerCase().includes('mac')

/** 打开快速搜索的快捷键说明（macOS 用 ⌘） */
export const PALETTE_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl+K'

export interface JumpDetail {
  target: 'settings' | 'more'
  key: string
}

export function requestJump(detail: JumpDetail): void {
  try {
    localStorage.setItem(detail.target === 'settings' ? SETTINGS_TAB_KEY : TOOLBOX_KEY, detail.key)
  } catch {
    // 记不住时页面用默认分类
  }
  window.dispatchEvent(new CustomEvent<JumpDetail>(JUMP_EVENT, { detail }))
}

/** 页面里监听跳转：只处理自己的 */
export function onJump(target: JumpDetail['target'], handler: (key: string) => void): () => void {
  const listener = (e: Event): void => {
    const detail = (e as CustomEvent<JumpDetail>).detail
    if (detail?.target === target) handler(detail.key)
  }
  window.addEventListener(JUMP_EVENT, listener)
  return () => window.removeEventListener(JUMP_EVENT, listener)
}
