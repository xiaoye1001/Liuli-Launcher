/**
 * 根据系统配色（prefers-color-scheme）切换 <html> 上的 light 类名。
 * 主进程会把设置中的主题同步到 nativeTheme.themeSource，
 * 所以这里只需监听 prefers-color-scheme，所有窗口都会自动跟随。
 */
export function initTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    document.documentElement.classList.toggle('light', !query.matches)
  }
  apply()
  query.addEventListener('change', apply)
}
