import type { BrowserWindow } from 'electron'
import { getSettings } from './config'

let mainWindow: BrowserWindow | null = null
/** 是否由「启动后」设置隐藏或最小化了启动器，游戏结束后需要恢复 */
let changedByLaunch = false

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** 游戏窗口出现后，按设置最小化或隐藏启动器 */
export async function onGameWindowReady(): Promise<void> {
  const win = getMainWindow()
  if (!win) return
  const { afterLaunch } = await getSettings()
  if (afterLaunch === 'minimize') {
    win.minimize()
    changedByLaunch = true
  } else if (afterLaunch === 'hide') {
    win.hide()
    changedByLaunch = true
  }
}

/** 游戏退出或崩溃后恢复启动器窗口（崩溃时用户需要看到错误信息） */
export function onGameEnded(): void {
  const win = getMainWindow()
  if (!win || !changedByLaunch) return
  changedByLaunch = false
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
