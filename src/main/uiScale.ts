import { BrowserWindow, screen } from 'electron'
import { getSettings, updateSettings } from './config'
import { UI_SCALES } from '../shared/types'
import type { AppSettings } from '../shared/types'

/** 每个窗口在 100% 缩放下的最小尺寸；缩放后按比例放大，避免内容被挤压 */
const baseMinSize = new WeakMap<BrowserWindow, [number, number]>()

/** 把缩放比例限制在可选范围内（取最接近的一档） */
export function normalizeScale(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 100
  return UI_SCALES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 100)
}

/** 按缩放比例设置窗口的缩放和最小尺寸 */
export function applyUiScale(win: BrowserWindow, scale: number): void {
  if (win.isDestroyed()) return
  const factor = normalizeScale(scale) / 100
  if (win.webContents.getZoomFactor() !== factor) win.webContents.setZoomFactor(factor)
  const base = baseMinSize.get(win)
  if (!base) return
  // 最小尺寸不能超过屏幕可用区域，否则小屏幕上窗口放不下
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize
  const minWidth = Math.min(Math.round(base[0] * factor), area.width)
  const minHeight = Math.min(Math.round(base[1] * factor), area.height)
  win.setMinimumSize(minWidth, minHeight)
  if (!win.isMaximized() && !win.isFullScreen()) {
    const [width, height] = win.getSize()
    if (width < minWidth || height < minHeight) win.setSize(Math.max(width, minWidth), Math.max(height, minHeight))
  }
}

/** 按当前设置调整所有窗口的缩放 */
export function applyUiScaleToAll(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) applyUiScale(win, settings.uiScale)
}

/** 下一档缩放比例：direction 为 1 放大、-1 缩小、0 恢复 100% */
function stepScale(current: number, direction: -1 | 0 | 1): number {
  if (direction === 0) return 100
  const index = UI_SCALES.indexOf(normalizeScale(current))
  return UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, index + direction))]
}

/** 清理字体名称：只保留名称本身，去掉引号、分号等可能破坏 CSS 的字符 */
export function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f"'\\;{}<>]/g, '')
    .trim()
    .slice(0, 80)
}

/**
 * 让窗口跟随界面缩放设置：
 * - 页面加载完成后应用缩放
 * - Ctrl + 加号 / 减号 / 0、Ctrl + 鼠标滚轮修改缩放设置（所有窗口一起变）
 */
export function manageUiScale(win: BrowserWindow, minSize: [number, number]): void {
  baseMinSize.set(win, minSize)
  const contents = win.webContents
  contents.on('did-finish-load', () => {
    void getSettings().then((s) => applyUiScale(win, s.uiScale))
  })

  const change = async (direction: -1 | 0 | 1): Promise<void> => {
    const current = (await getSettings()).uiScale
    const next = stepScale(current, direction)
    if (next === current) return
    const settings = await updateSettings({ uiScale: next })
    applyUiScaleToAll(settings)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', settings)
  }

  // 拦截后，系统菜单里的缩放快捷键也不会再单独生效，保证缩放始终和设置一致
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    const direction = input.key === '=' || input.key === '+' ? 1 : input.key === '-' ? -1 : input.key === '0' ? 0 : null
    if (direction === null) return
    event.preventDefault()
    void change(direction)
  })
  contents.on('zoom-changed', (_, zoomDirection) => {
    void change(zoomDirection === 'in' ? 1 : -1)
  })
}
