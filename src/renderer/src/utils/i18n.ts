/**
 * 界面语言：简体中文（默认）或英文。
 *
 * 用法：t('启动游戏')、t('正在玩 {version}', { version })。中文原文就是键：中文界面原样返回，
 * 英文界面查 i18n-en.ts 里的翻译，没有翻译的保持中文。
 *
 * 语言在页面一打开时就要知道（很多模块在加载时就生成了菜单文字），所以除了设置里的 language，
 * 还在浏览器存储里记一份，加载时同步读取；切换语言后重新加载页面
 */
import EN from './i18n-en'

export type Language = 'zh-CN' | 'en'

const KEY = 'liuli-language'

function readLanguage(): Language {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

/** 当前界面语言（页面加载时定下，换语言会重新加载页面） */
export const LANGUAGE: Language = readLanguage()
export const IS_EN = LANGUAGE === 'en'

if (typeof document !== 'undefined') document.documentElement.lang = IS_EN ? 'en' : 'zh-CN'

/** 翻译一句界面文字；vars 替换里面的 {name} */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = IS_EN ? (EN[text] ?? text) : text
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return out
}

/** 记下语言；和当前不一样时重新加载页面（记不住时不重新加载，免得一直刷新） */
function remember(language: Language): boolean {
  try {
    localStorage.setItem(KEY, language)
    return localStorage.getItem(KEY) === language
  } catch {
    return false
  }
}

/** 设置里换语言 */
export async function setLanguage(language: Language): Promise<void> {
  await window.api.updateSettings({ language })
  if (language !== LANGUAGE && remember(language)) void window.api.reloadWindow()
}

/** 启动时设置读到后调用：浏览器存储被清掉等情况下，以设置里的为准 */
export function syncLanguage(language: Language | undefined): void {
  if (language && language !== LANGUAGE && remember(language)) void window.api.reloadWindow()
}
