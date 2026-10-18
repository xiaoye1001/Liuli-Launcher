import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron'

/**
 * 窗口标题栏：Windows 和 Linux 不用系统标题栏（深色主题下是一条黑边），
 * 界面自己画最小化、最大化、关闭按钮，背景与启动器一致。macOS 保持系统样式
 */
export const CUSTOM_TITLE_BAR = process.platform === 'win32' || process.platform === 'linux'

export function frameOptions(): BrowserWindowConstructorOptions {
  return CUSTOM_TITLE_BAR ? { frame: false } : {}
}

/** 窗口最大化或还原时通知界面切换按钮图标 */
export function watchMaximize(win: BrowserWindow): void {
  if (!CUSTOM_TITLE_BAR) return
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', win.isMaximized())
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
}

/** 界面上的窗口按钮 */
export function registerWindowControls(): void {
  ipcMain.handle('window:control', (event, action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'close') win.close()
  })
  ipcMain.handle('window:isMaximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
}
