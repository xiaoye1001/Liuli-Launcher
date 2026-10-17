import { portableDir } from './paths'
import { clearBackground, pickBackground, registerBackgroundProtocol } from './appearance'
import { getMainWindow, setMainWindow } from './windows'
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
  getQuiltLoaders,
  getInstallStatus,
  retryLastInstall,
  startCustomInstall,
  startJavaInstall,
  startRepair
} from './install'
import { getGameLogs, getGameStatus, launchGame, listInstalledVersions, previewMemory } from './launch'
import { closeLogWindow, openLogWindow } from './logWindow'
import { shareCrashLogs, shareGameLog, shareLatestLog } from './logShare'
import { getGameDirInfo, openGameDir, pickGameDir, removeGameDir, renameGameDir, setGameDir } from './gameDir'
import { assertSafeId, deleteVersion, openVersionDir } from './versionManage'
import { addMods, deleteMod, listMods, openModsDir, setModEnabled } from './mods'
import {
  checkModUpdates,
  getProjectVersions,
  installFromModrinth,
  installResource,
  listWorlds,
  searchModrinth,
  searchProjects,
  updateMod
} from './modrinth'
import { isElevated } from './elevation'
import { getVersionConfig, setVersionConfig } from './versionConfig'
import {
  addLocalResources,
  checkResourceUpdates,
  deleteLocalResource,
  listLocalResources,
  openLocalResourceDir,
  setActiveShader,
  setResourcePackEnabled,
  updateResource
} from './resources'
import {
  addWorldDatapacks,
  backupWorld,
  deleteWorldBackup,
  listWorldBackups,
  restoreWorldBackup,
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
import {
  cancelUpdateDownload,
  checkUpdate,
  cleanUpdateFiles,
  downloadUpdate,
  getUpdateDownload,
  installUpdate,
  openUpdateLink
} from './updater'
import { getPlayStats } from './playStats'
import { exportModpack, getModpackExportInfo, showExportedModpack } from './modpackExport'
import { copyScreenshot, deleteScreenshot, listScreenshots, openScreenshotsDir, showScreenshot } from './screenshots'
import { copyVersion, createDesktopShortcut, launchArgOf, renameVersion } from './versionOps'
import { getNews } from './news'
import { applyNetworkSettings, checkNetwork, validateProxyUrl } from './network'
import { addOfflineAccount, removeOfflineAccount, renameOfflineAccount, selectOfflineAccount } from './offline'
import { loginExternal, removeExternalAccount, selectExternalProfile } from './yggdrasil'
import { downloadModpack, installModpack, loadModpackFile, pickModpack } from './modpack'
import { getCurseForgeVersions, installCurseForgeResource, isCurseForgeId, searchCurseForge } from './curseforge'
import {
  cancelMicrosoftLogin,
  getAccounts,
  getLoginStatus,
  getMsSkinProfile,
  openLoginPage,
  removeAccount,
  resetMsSkin,
  setActiveAccount,
  setMsCape,
  startMicrosoftLogin,
  uploadMsSkin
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
  SavedServer,
  ModpackExportOptions,
  GameDirInfo
} from '../shared/types'

/** 设置变化后通知所有窗口（主题色、背景、动画等外观设置需要立即生效） */
function broadcastSettings(settings: AppSettings): AppSettings {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', settings)
  return settings
}

/** 切换游戏目录后通知所有窗口（选中的版本也随之改变） */
async function afterGameDirChange(info: GameDirInfo): Promise<GameDirInfo> {
  broadcastSettings(await getSettings())
  return info
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
  ipcMain.handle('settings:update', async (_, patch: Partial<AppSettings>) => {
    // 修改主题时同步给 Electron，所有窗口的 prefers-color-scheme 会随之变化
    if (patch.theme) nativeTheme.themeSource = patch.theme
    if (typeof patch.proxyUrl === 'string' && patch.proxyUrl.trim()) {
      patch = { ...patch, proxyUrl: validateProxyUrl(patch.proxyUrl) }
    }
    if (patch.downloadThreads !== undefined) {
      const threads = Number(patch.downloadThreads)
      patch = { ...patch, downloadThreads: Number.isInteger(threads) ? Math.min(64, Math.max(1, threads)) : 16 }
    }
    const next = await updateSettings(patch)
    // 代理与下载线程数立即生效
    if ('proxyMode' in patch || 'proxyUrl' in patch || 'downloadThreads' in patch) await applyNetworkSettings()
    return broadcastSettings(next)
  })
  ipcMain.handle('network:check', () => checkNetwork())
  ipcMain.handle('news:get', (_, force?: boolean) => getNews(force === true))
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
  ipcMain.handle('quilt:loaders', (_, minecraftVersion: string) => getQuiltLoaders(minecraftVersion))
  ipcMain.handle('forge:versions', (_, minecraftVersion: string) => getForgeVersions(minecraftVersion))
  ipcMain.handle('neoforge:versions', (_, minecraftVersion: string) => getNeoForgeVersions(minecraftVersion))
  ipcMain.handle('optifine:versions', (_, minecraftVersion: string) => getOptiFineVersions(minecraftVersion))
  ipcMain.handle('versions:installed', () => listInstalledVersions())
  ipcMain.handle('versions:repair', (_, versionId: string) => startRepair(versionId))
  ipcMain.handle('versions:delete', (event, versionId: string) =>
    deleteVersion(BrowserWindow.fromWebContents(event.sender), versionId)
  )
  ipcMain.handle('versions:open', (_, versionId: string) => openVersionDir(versionId))
  ipcMain.handle('versions:rename', (_, versionId: string, newId: string) => renameVersion(versionId, newId))
  ipcMain.handle('versions:copy', (_, versionId: string, newId: string, includeSaves: boolean) =>
    copyVersion(versionId, newId, includeSaves)
  )
  ipcMain.handle('versions:shortcut', (_, versionId: string) => createDesktopShortcut(versionId))
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
  ipcMain.handle('mods:checkUpdates', (_, versionId: string) => checkModUpdates(versionId))
  ipcMain.handle('mods:update', (_, versionId: string, fileName: string, modrinthVersionId: string) =>
    updateMod(versionId, fileName, modrinthVersionId)
  )
  ipcMain.handle('local:list', (_, versionId: string, kind: LocalResourceKind) => listLocalResources(versionId, kind))
  ipcMain.handle('local:checkUpdates', (_, versionId: string, kind: LocalResourceKind) =>
    checkResourceUpdates(versionId, kind)
  )
  ipcMain.handle(
    'local:update',
    (_, versionId: string, kind: LocalResourceKind, fileName: string, modrinthVersionId: string) =>
      updateResource(versionId, kind, fileName, modrinthVersionId)
  )
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
  ipcMain.handle('worlds:backups', (_, versionId: string) => listWorldBackups(versionId))
  ipcMain.handle('worlds:restore', (_, versionId: string, file: string, asNew: boolean) =>
    restoreWorldBackup(versionId, file, asNew === true)
  )
  ipcMain.handle('worlds:deleteBackup', (_, versionId: string, file: string) => deleteWorldBackup(versionId, file))
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
  ipcMain.handle('screenshots:list', (_, versionId: string) => listScreenshots(versionId))
  ipcMain.handle('screenshots:delete', (_, versionId: string, fileName: string) =>
    deleteScreenshot(versionId, fileName)
  )
  ipcMain.handle('screenshots:copy', (_, versionId: string, fileName: string) => copyScreenshot(versionId, fileName))
  ipcMain.handle('screenshots:show', (_, versionId: string, fileName: string) => showScreenshot(versionId, fileName))
  ipcMain.handle('screenshots:open', (_, versionId: string) => openScreenshotsDir(versionId))
  ipcMain.handle('local:open', (_, versionId: string, kind: LocalResourceKind) => openLocalResourceDir(versionId, kind))
  ipcMain.handle('accounts:list', () => getAccounts())
  ipcMain.handle('accounts:setActive', (_, id: string) => setActiveAccount(id))
  ipcMain.handle('accounts:remove', (_, uuid: string) => removeAccount(uuid))
  ipcMain.handle('external:login', (_, server: string, username: string, password: string) =>
    loginExternal(server, username, password)
  )
  ipcMain.handle('external:selectProfile', (_, pendingId: string, profileId: string) =>
    selectExternalProfile(pendingId, profileId)
  )
  ipcMain.handle('external:remove', async (_, id: string) => {
    await removeExternalAccount(id)
    return getAccounts()
  })
  ipcMain.handle('offline:add', (_, name: string) => addOfflineAccount(name).then(broadcastSettings))
  ipcMain.handle('offline:select', (_, id: string) => selectOfflineAccount(id).then(broadcastSettings))
  ipcMain.handle('offline:rename', (_, id: string, name: string) =>
    renameOfflineAccount(id, name).then(broadcastSettings)
  )
  ipcMain.handle('offline:remove', (_, id: string) => removeOfflineAccount(id).then(broadcastSettings))
  ipcMain.handle('ms:login', () => startMicrosoftLogin())
  ipcMain.handle('ms:cancel', () => cancelMicrosoftLogin())
  ipcMain.handle('ms:status', () => getLoginStatus())
  ipcMain.handle('ms:openLoginPage', () => openLoginPage())
  ipcMain.handle('ms:skinProfile', (_, uuid: string) => getMsSkinProfile(uuid))
  ipcMain.handle('ms:uploadSkin', (event, uuid: string, variant: 'classic' | 'slim') =>
    uploadMsSkin(uuid, variant === 'slim' ? 'slim' : 'classic', BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('ms:resetSkin', (_, uuid: string) => resetMsSkin(uuid))
  ipcMain.handle('ms:setCape', (_, uuid: string, capeId: string | null) => setMsCape(uuid, capeId))
  ipcMain.handle('modpack:pick', (event) => pickModpack(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('modpack:install', (_, name: string) => installModpack(name))
  ipcMain.handle('modpack:loadFile', (_, path: string) => loadModpackFile(path))
  ipcMain.handle(
    'resource:search',
    (_, type: ResourceType, query: string, offset: number, filters: ResourceSearchFilters) =>
      filters?.source === 'curseforge'
        ? searchCurseForge(type, query, offset, filters)
        : searchProjects(type, query, offset, filters)
  )
  ipcMain.handle('resource:versions', (_, projectId: string, type: ResourceType) =>
    isCurseForgeId(projectId) ? getCurseForgeVersions(projectId, type) : getProjectVersions(projectId, type)
  )
  ipcMain.handle('resource:install', (_, target: ResourceTarget, type: ResourceType, versionId: string) =>
    isCurseForgeId(versionId)
      ? installCurseForgeResource(target, type, versionId)
      : installResource(target, type, versionId)
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
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:downloadStatus', () => getUpdateDownload())
  ipcMain.handle('update:cancelDownload', () => cancelUpdateDownload())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('servers:list', () => listServers())
  ipcMain.handle('servers:save', (_, server: Omit<SavedServer, 'id'> & { id?: string }) => saveServer(server))
  ipcMain.handle('servers:delete', (_, id: string) => deleteServer(id))
  ipcMain.handle('servers:move', (_, id: string, offset: number) => moveServer(id, offset))
  ipcMain.handle('servers:import', () => importGameServers())
  ipcMain.handle('servers:ping', (_, address: string) => pingServer(address))
  ipcMain.handle('game:status', () => getGameStatus())
  ipcMain.handle('stats:get', () => getPlayStats())
  ipcMain.handle('export:show', () => showExportedModpack())
  ipcMain.handle('export:info', (_, versionId: string) => getModpackExportInfo(versionId))
  ipcMain.handle('export:run', (event, options: ModpackExportOptions) =>
    exportModpack(options, BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle('game:logs', () => getGameLogs())
  ipcMain.handle('logs:open', () => openLogWindow())
  ipcMain.handle('logs:shareGame', () => shareGameLog())
  ipcMain.handle('logs:shareCrash', () => shareCrashLogs())
  ipcMain.handle('logs:shareLatest', (_, versionId: string) => shareLatestLog(versionId))
  ipcMain.handle('crash:open', (_, kind: 'report' | 'native') => openCrashFile(kind))
  ipcMain.handle('crash:export', (event) => exportCrashInfo(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('gamedir:info', () => getGameDirInfo())
  ipcMain.handle('gamedir:set', (_, dir: string) => setGameDir(dir).then(afterGameDirChange))
  ipcMain.handle('gamedir:rename', (_, dir: string, name: string) => renameGameDir(dir, name))
  ipcMain.handle('gamedir:remove', (_, dir: string) => removeGameDir(dir))
  ipcMain.handle('gamedir:open', (_, dir?: string) => openGameDir(typeof dir === 'string' ? dir : undefined))
  // 弹出文件夹选择框，添加并切换到选中的目录；用户取消时返回 null
  ipcMain.handle('gamedir:pick', async (event) => {
    const dir = await pickGameDir(BrowserWindow.fromWebContents(event.sender))
    return dir ? setGameDir(dir).then(afterGameDirChange) : null
  })
  ipcMain.handle('memory:preview', (_, versionId: string) => previewMemory(versionId))
  ipcMain.handle(
    'system:info',
    async (): Promise<SystemInfo> => ({
      totalMemory: Math.floor(totalmem() / 1024 / 1024),
      portableDir,
      elevated: await isElevated()
    })
  )
}

// 只允许运行一个启动器：再次打开（例如双击桌面快捷方式）时切换到已打开的窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

/** 从桌面快捷方式启动：等界面加载完再启动指定的版本 */
async function launchFromShortcut(versionId: string): Promise<void> {
  const win = getMainWindow()
  if (win?.webContents.isLoading()) {
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
  }
  try {
    assertSafeId(versionId)
    broadcastSettings(await updateSettings({ selectedVersion: versionId }))
    await launchGame(versionId)
  } catch (e) {
    // 游戏已在运行等情况：只把窗口切到前台
    console.error('快捷方式启动失败：', e)
  }
}

app.on('second-instance', (_, argv) => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  const versionId = launchArgOf(argv)
  if (versionId) void launchFromShortcut(versionId)
})

app.whenReady().then(async () => {
  if (!gotLock) return
  electronApp.setAppUserModelId('io.github.xiaoye1001.liuli-launcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  registerBackgroundProtocol()
  // 先应用保存的主题，再创建窗口，避免启动时闪烁
  nativeTheme.themeSource = (await getSettings()).theme
  await applyNetworkSettings().catch((e) => console.error('应用网络设置失败：', e))
  createWindow()
  // 上次自动更新留下的安装包已经用不到了（稍后再删，等更新程序完全退出）
  setTimeout(() => void cleanUpdateFiles(), 60_000)
  const shortcutVersion = launchArgOf(process.argv)
  if (shortcutVersion) void launchFromShortcut(shortcutVersion)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
