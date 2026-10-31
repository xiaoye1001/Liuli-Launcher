/** 设置页记住的分类（localStorage 的键），其他页面要打开设置的某个分类时先写入这里 */
export const SETTINGS_TAB_KEY = 'settingsTab'

/** 下次打开设置页时显示指定的分类 */
export function rememberSettingsTab(tab: string): void {
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, tab)
  } catch {
    // 记不住也没关系：设置页显示上次的分类
  }
}
