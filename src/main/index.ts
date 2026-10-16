import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { totalmem } from 'os'
import { scanJava } from './java'
import { getSettings, updateSettings } from './config'
import { getVersionManifest } from './versions'
import { cancelInstall, getInstallStatus, startInstall } from './install'
import { getGameLogs, getGameStatus, launchGame, listInstalledVersions } from './launch'
import { closeLogWindow, openLogWindow } from './logWindow'
import type { AppSettings, SystemInfo } from '../shared/types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#e0f2fe',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    closeLogWindow()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('java:scan', () => scanJava())
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_, patch: Partial<AppSettings>) => {
    // 修改主题时同步给 Electron，所有窗口的 prefers-color-scheme 会随之变化
    if (patch.theme) nativeTheme.themeSource = patch.theme
    return updateSettings(patch)
  })
  ipcMain.handle('versions:list', async (_, force: boolean) => {
    const settings = await getSettings()
    return getVersionManifest(settings.downloadSource, force)
  })
  ipcMain.handle('install:start', (_, versionId: string) => startInstall(versionId))
  ipcMain.handle('install:cancel', () => cancelInstall())
  ipcMain.handle('install:status', () => getInstallStatus())
  ipcMain.handle('versions:installed', () => listInstalledVersions())
  ipcMain.handle('game:launch', (_, versionId: string) => launchGame(versionId))
  ipcMain.handle('game:status', () => getGameStatus())
  ipcMain.handle('game:logs', () => getGameLogs())
  ipcMain.handle('logs:open', () => openLogWindow())
  ipcMain.handle(
    'system:info',
    (): SystemInfo => ({ totalMemory: Math.floor(totalmem() / 1024 / 1024) })
  )
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mclauncher.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  // 先应用保存的主题，再创建窗口，避免启动时闪烁
  nativeTheme.themeSource = (await getSettings()).theme
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
