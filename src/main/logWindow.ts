import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { frameOptions, watchMaximize } from './windowFrame'
import { manageUiScale } from './uiScale'

let logWindow: BrowserWindow | null = null

/** 是否打开着日志窗口 */
export function isLogWindowOpen(): boolean {
  return !!logWindow && !logWindow.isDestroyed()
}

/** 通知所有窗口日志窗口打开或关闭了（主页的「日志」按钮显示当前状态） */
function broadcastState(): void {
  const open = isLogWindowOpen()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('logs:windowState', open)
  }
}

/** 打开或关闭日志窗口，返回操作后是否打开着 */
export function toggleLogWindow(): boolean {
  if (isLogWindowOpen()) {
    closeLogWindow()
    return false
  }
  openLogWindow()
  return true
}

/** 打开（或聚焦）游戏日志窗口。日志窗口与主窗口加载同一个页面，通过 #logs 区分 */
export function openLogWindow(): void {
  if (logWindow && !logWindow.isDestroyed()) {
    if (logWindow.isMinimized()) logWindow.restore()
    logWindow.show()
    return
  }

  logWindow = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 600,
    minHeight: 360,
    title: '游戏日志 - 琉璃启动器',
    show: false,
    autoHideMenuBar: true,
    ...frameOptions(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1120' : '#f8fafc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  watchMaximize(logWindow)
  manageUiScale(logWindow, [600, 360])
  logWindow.on('ready-to-show', () => logWindow?.show())
  // 链接（例如分享日志得到的 mclo.gs 链接）用系统浏览器打开
  logWindow.on('closed', () => {
    logWindow = null
    broadcastState()
  })
  broadcastState()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    logWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#logs`)
  } else {
    logWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'logs' })
  }
}

/** 主窗口关闭时一并关闭日志窗口，保证应用能正常退出 */
export function closeLogWindow(): void {
  if (logWindow && !logWindow.isDestroyed()) logWindow.close()
}
