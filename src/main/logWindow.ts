import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { frameOptions, watchMaximize } from './windowFrame'
import { manageUiScale } from './uiScale'

let logWindow: BrowserWindow | null = null

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
      sandbox: false
    }
  })

  watchMaximize(logWindow)
  manageUiScale(logWindow, [600, 360])
  logWindow.on('ready-to-show', () => logWindow?.show())
  // 链接（例如分享日志得到的 mclo.gs 链接）用系统浏览器打开
  logWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  logWindow.on('closed', () => {
    logWindow = null
  })

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
