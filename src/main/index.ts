import { portableDir } from './paths'
import { clearBackground, pickBackground, registerBackgroundProtocol } from './appearance'
import { setMainWindow } from './windows'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { totalmem } from 'os'
import { scanJava } from './java'
import { downloadedJavaPaths, listJavaRuntimes } from './javaRuntime'
import { getSettings, updateSettings } from './config'
import { getVersionManifest } from './versions'
import { getForgeVersions } from './forge'
import { getNeoForgeVersions } from './neoforge'
import { getOptiFineVersions } from './optifine'
import {
  cancelInstall,
  getFabricLoaders,
  getInstallStatus,
  retryLastInstall,
  startCustomInstall,
  startJavaInstall,
  startRepair
} from './install'
import { getGameLogs, getGameStatus, launchGame, listInstalledVersions } from './launch'
import { closeLogWindow, openLogWindow } from './logWindow'
import { getGameDirInfo, openGameDir, pickGameDir, setGameDir } from './gameDir'
import { deleteVersion, openVersionDir } from './versionManage'
import { addMods, deleteMod, listMods, openModsDir, setModEnabled } from './mods'
import {
  getProjectVersions,
  installFromModrinth,
  installResource,
  listWorlds,
  searchModrinth,
  searchProjects
} from './modrinth'
import { isElevated } from './elevation'
import { getVersionConfig, setVersionConfig } from './versionConfig'
import {
  addLocalResources,
  deleteLocalResource,
  listLocalResources,
  openLocalResourceDir,
  setActiveShader,
  setResourcePackEnabled
} from './resources'
import {
  addWorldDatapacks,
  backupWorld,
  deleteWorld,
  deleteWorldDatapack,
  importWorld,
  listWorldDatapacks,
  listWorldInfos,
  openBackupsDir,
  openWorldDatapacksDir,
  openWorldDir
} from './worlds'
import { exportCrashInfo, openCrashFile } from './crashReport'
import { deleteServer, importGameServers, listServers, moveServer, saveServer } from './servers'
import { pingServer } from './serverPing'
import { checkUpdate, openUpdateLink } from './updater'
import { downloadModpack, installModpack, loadModpackFile, pickModpack } from './modpack'
import {
  cancelMicrosoftLogin,
  getAccounts,
  getLoginStatus,
  openLoginPage,
  removeAccount,
  setActiveAccount,
  startMicrosoftLogin
} from './microsoft'
import type {
  AppSettings,
  InstallRequest,
  ResourceSearchFilters,
  ResourceTarget,
  ResourceType,
  SystemInfo,
  VersionConfig,
  LocalResourceKind,
  SavedServer
} from '../shared/types'

/** 设置变化后通知所有窗口（主题色、背景、动画等外观设置需要立即生效） */
function broadcastSettings(settings: AppSettings): AppSettings {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', settings)
  return settings
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#e0f2fe',
    // Windows 使用安装包里 exe 的图标；Linux 与开发模式需要单独指定
    ...(process.platform === 'linux' || is.dev ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    closeLogWindow()
  })

  // 文件拖进窗口时，界面没有处理到的话浏览器会直接打开该文件，离开启动器界面，这里一律阻止
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 只用系统浏览器打开网页链接
    if (/^https?:\/\//.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('java:scan', async () => scanJava(await downloadedJavaPaths()))
  ipcMain.handle('java:runtimes', () => listJavaRuntimes())
  ipcMain.handle('java:download', (_, component: string) => startJavaInstall(component))
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_, patch: Partial<AppSettings>) => {
    // 修改主题时同步给 Electron，所有窗口的 prefers-color-scheme 会随之变化
    if (patch.theme) nativeTheme.themeSource = patch.theme
    return updateSettings(patch).then(broadcastSettings)
  })
  ipcMain.handle('appearance:pickBackground', (event) =>
    pickBackground(BrowserWindow.fromWebContents(event.sender)).then(broadcastSettings)
  )
  ipcMain.handle('appearance:clearBackground', () => clearBackground().then(broadcastSettings))
  ipcMain.handle('versions:list', async (_, force: boolean) => {
    const settings = await getSettings()
    return getVersionManifest(settings.downloadSource, force)
  })
  ipcMain.handle('install:start', (_, request: InstallRequest) => startCustomInstall(request))
  ipcMain.handle('install:retry', () => retryLastInstall())
  ipcMain.handle('install:cancel', () => cancelInstall())
  ipcMain.handle('install:status', () => getInstallStatus())
  ipcMain.handle('fabric:loaders', (_, minecraftVersion: string) => getFabricLoaders(minecraftVersion))
  ipcMain.handle('forge:versions', (_, minecraftVersion: string) => getForgeVersions(minecraftVersion))
  ipcMain.handle('neoforge:versions', (_, minecraftVersion: string) => getNeoForgeVersions(minecraftVersion))
  ipcMain.handle('optifine:versions', (_, minecraftVersion: string) => getOptiFineVersions(minecraftVersion))
  ipcMain.handle('versions:installed', () => listInstalledVersions())
  ipcMain.handle('versions:repair', (_, versionId: string) => startRepair(versionId))
  ipcMain.handle('versions:delete', (event, versionId: string) =>
    deleteVersion(BrowserWindow.fromWebContents(event.sender), versionId)
  )
  ipcMain.handle('versions:open', (_, versionId: string) => openVersionDir(versionId))
  ipcMain.handle('versions:getConfig', (_, versionId: string) => getVersionConfig(versionId))
  ipcMain.handle('versions:setConfig', (_, versionId: string, patch: Partial<VersionConfig>) =>
    setVersionConfig(versionId, patch)
  )
  ipcMain.handle('mods:list', (_, versionId: string) => listMods(versionId))
  ipcMain.handle('mods:setEnabled', (_, versionId: string, fileName: string, enabled: boolean) =>
    setModEnabled(versionId, fileName, enabled)
  )
  ipcMain.handle('mods:delete', (_, versionId: string, fileName: string) => deleteMod(versionId, fileName))
  ipcMain.handle('mods:add', (event, versionId: string) =>
    addMods(versionId, BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('mods:open', (_, versionId: string) => openModsDir(versionId))
  ipcMain.handle('local:list', (_, versionId: string, kind: LocalResourceKind) => listLocalResources(versionId, kind))
  ipcMain.handle('local:setPackEnabled', (_, versionId: string, fileName: string, enabled: boolean) =>
    setResourcePackEnabled(versionId, fileName, enabled)
  )
  ipcMain.handle('local:setShader', (_, versionId: string, fileName: string | null) =>
    setActiveShader(versionId, fileName)
  )
  ipcMain.handle('local:delete', (_, versionId: string, kind: LocalResourceKind, fileName: string) =>
    deleteLocalResource(versionId, kind, fileName)
  )
  ipcMain.handle('local:add', (event, versionId: string, kind: LocalResourceKind) =>
    addLocalResources(versionId, kind, BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('worlds:list', (_, versionId: string) => listWorldInfos(versionId))
  ipcMain.handle('worlds:delete', (_, versionId: string, folder: string) => deleteWorld(versionId, folder))
  ipcMain.handle('worlds:backup', (_, versionId: string, folder: string) => backupWorld(versionId, folder))
  ipcMain.handle('worlds:open', (_, versionId: string, folder?: string) => openWorldDir(versionId, folder))
  ipcMain.handle('worlds:openBackups', (_, versionId: string) => openBackupsDir(versionId))
  ipcMain.handle('worlds:import', (event, versionId: string) =>
    importWorld(versionId, BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('worlds:datapacks', (_, versionId: string, folder: string) => listWorldDatapacks(versionId, folder))
  ipcMain.handle('worlds:deleteDatapack', (_, versionId: string, folder: string, fileName: string) =>
    deleteWorldDatapack(versionId, folder, fileName)
  )
  ipcMain.handle('worlds:addDatapacks', (event, versionId: string, folder: string) =>
    addWorldDatapacks(versionId, folder, BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('worlds:openDatapacks', (_, versionId: string, folder: string) =>
    openWorldDatapacksDir(versionId, folder)
  )
  ipcMain.handle('local:open', (_, versionId: string, kind: LocalResourceKind) => openLocalResourceDir(versionId, kind))
  ipcMain.handle('accounts:list', () => getAccounts())
  ipcMain.handle('accounts:setActive', (_, id: string) => setActiveAccount(id))
  ipcMain.handle('accounts:remove', (_, uuid: string) => removeAccount(uuid))
  ipcMain.handle('ms:login', () => startMicrosoftLogin())
  ipcMain.handle('ms:cancel', () => cancelMicrosoftLogin())
  ipcMain.handle('ms:status', () => getLoginStatus())
  ipcMain.handle('ms:openLoginPage', () => openLoginPage())
  ipcMain.handle('modpack:pick', (event) => pickModpack(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('modpack:install', (_, name: string) => installModpack(name))
  ipcMain.handle('modpack:loadFile', (_, path: string) => loadModpackFile(path))
  ipcMain.handle(
    'resource:search',
    (_, type: ResourceType, query: string, offset: number, filters: ResourceSearchFilters) =>
      searchProjects(type, query, offset, filters)
  )
  ipcMain.handle('resource:versions', (_, projectId: string, type: ResourceType) => getProjectVersions(projectId, type))
  ipcMain.handle('resource:install', (_, target: ResourceTarget, type: ResourceType, versionId: string) =>
    installResource(target, type, versionId)
  )
  ipcMain.handle('resource:worlds', (_, versionId: string) => listWorlds(versionId))
  ipcMain.handle('modpack:download', (_, versionId: string) => downloadModpack(versionId))
  ipcMain.handle('modrinth:search', (_, versionId: string, query: string, offset: number) =>
    searchModrinth(versionId, query, offset)
  )
  ipcMain.handle('modrinth:install', (_, versionId: string, projectId: string) =>
    installFromModrinth(versionId, projectId)
  )
  ipcMain.handle('game:launch', (_, versionId: string, server?: string) => launchGame(versionId, server))
  ipcMain.handle('update:check', () => checkUpdate())
  ipcMain.handle('update:open', (_, kind: 'asset' | 'page') => openUpdateLink(kind))
  ipcMain.handle('servers:list', () => listServers())
  ipcMain.handle('servers:save', (_, server: Omit<SavedServer, 'id'> & { id?: string }) => saveServer(server))
  ipcMain.handle('servers:delete', (_, id: string) => deleteServer(id))
  ipcMain.handle('servers:move', (_, id: string, offset: number) => moveServer(id, offset))
  ipcMain.handle('servers:import', () => importGameServers())
  ipcMain.handle('servers:ping', (_, address: string) => pingServer(address))
  ipcMain.handle('game:status', () => getGameStatus())
  ipcMain.handle('game:logs', () => getGameLogs())
  ipcMain.handle('logs:open', () => openLogWindow())
  ipcMain.handle('crash:open', (_, kind: 'report' | 'native') => openCrashFile(kind))
  ipcMain.handle('crash:export', (event) => exportCrashInfo(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('gamedir:info', () => getGameDirInfo())
  ipcMain.handle('gamedir:set', (_, dir: string) => setGameDir(dir))
  ipcMain.handle('gamedir:open', () => openGameDir())
  // 弹出文件夹选择框并切换；用户取消时返回 null
  ipcMain.handle('gamedir:pick', async (event) => {
    const dir = await pickGameDir(BrowserWindow.fromWebContents(event.sender))
    return dir ? setGameDir(dir) : null
  })
  ipcMain.handle(
    'system:info',
    async (): Promise<SystemInfo> => ({
      totalMemory: Math.floor(totalmem() / 1024 / 1024),
      portableDir,
      elevated: await isElevated()
    })
  )
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('io.github.xiaoye1001.liuli-launcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  registerBackgroundProtocol()
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
