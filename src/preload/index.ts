import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  GameLogEvent,
  GameStatus,
  InstallRequest,
  InstallStatus,
  ResourceSearchFilters,
  ResourceTarget,
  ResourceType,
  MsLoginStatus,
  VersionConfig,
  LocalResourceKind,
  SavedServer,
  ModpackExportOptions
} from '../shared/types'

const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  scanJava: () => ipcRenderer.invoke('java:scan'),
  getJavaRuntimes: () => ipcRenderer.invoke('java:runtimes'),
  downloadJava: (component: string) => ipcRenderer.invoke('java:download', component),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getVersionList: (force = false) => ipcRenderer.invoke('versions:list', force),
  startInstall: (request: InstallRequest) => ipcRenderer.invoke('install:start', request),
  retryInstall: () => ipcRenderer.invoke('install:retry'),
  cancelInstall: () => ipcRenderer.invoke('install:cancel'),
  getInstallStatus: () => ipcRenderer.invoke('install:status'),
  getFabricLoaders: (minecraftVersion: string) => ipcRenderer.invoke('fabric:loaders', minecraftVersion),
  getForgeVersions: (minecraftVersion: string) => ipcRenderer.invoke('forge:versions', minecraftVersion),
  getNeoForgeVersions: (minecraftVersion: string) => ipcRenderer.invoke('neoforge:versions', minecraftVersion),
  getOptiFineVersions: (minecraftVersion: string) => ipcRenderer.invoke('optifine:versions', minecraftVersion),
  /** 订阅安装进度，返回取消订阅函数 */
  onInstallStatus: (callback: (status: InstallStatus | null) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: InstallStatus | null): void => callback(status)
    ipcRenderer.on('install:status', listener)
    return () => {
      ipcRenderer.removeListener('install:status', listener)
    }
  },
  getInstalledVersions: () => ipcRenderer.invoke('versions:installed'),
  repairVersion: (versionId: string) => ipcRenderer.invoke('versions:repair', versionId),
  deleteVersion: (versionId: string) => ipcRenderer.invoke('versions:delete', versionId),
  openVersionDir: (versionId: string) => ipcRenderer.invoke('versions:open', versionId),
  listLocalResources: (versionId: string, kind: LocalResourceKind) => ipcRenderer.invoke('local:list', versionId, kind),
  setResourcePackEnabled: (versionId: string, fileName: string, enabled: boolean) =>
    ipcRenderer.invoke('local:setPackEnabled', versionId, fileName, enabled),
  setActiveShader: (versionId: string, fileName: string | null) =>
    ipcRenderer.invoke('local:setShader', versionId, fileName),
  deleteLocalResource: (versionId: string, kind: LocalResourceKind, fileName: string) =>
    ipcRenderer.invoke('local:delete', versionId, kind, fileName),
  addLocalResources: (versionId: string, kind: LocalResourceKind) => ipcRenderer.invoke('local:add', versionId, kind),
  openLocalResourceDir: (versionId: string, kind: LocalResourceKind) =>
    ipcRenderer.invoke('local:open', versionId, kind),
  listWorldInfos: (versionId: string) => ipcRenderer.invoke('worlds:list', versionId),
  deleteWorld: (versionId: string, folder: string) => ipcRenderer.invoke('worlds:delete', versionId, folder),
  backupWorld: (versionId: string, folder: string) => ipcRenderer.invoke('worlds:backup', versionId, folder),
  openWorldDir: (versionId: string, folder?: string) => ipcRenderer.invoke('worlds:open', versionId, folder),
  openBackupsDir: (versionId: string) => ipcRenderer.invoke('worlds:openBackups', versionId),
  importWorld: (versionId: string) => ipcRenderer.invoke('worlds:import', versionId),
  listWorldDatapacks: (versionId: string, folder: string) => ipcRenderer.invoke('worlds:datapacks', versionId, folder),
  deleteWorldDatapack: (versionId: string, folder: string, fileName: string) =>
    ipcRenderer.invoke('worlds:deleteDatapack', versionId, folder, fileName),
  addWorldDatapacks: (versionId: string, folder: string) =>
    ipcRenderer.invoke('worlds:addDatapacks', versionId, folder),
  openWorldDatapacksDir: (versionId: string, folder: string) =>
    ipcRenderer.invoke('worlds:openDatapacks', versionId, folder),
  openCrashFile: (kind: 'report' | 'native') => ipcRenderer.invoke('crash:open', kind),
  exportCrashInfo: () => ipcRenderer.invoke('crash:export'),
  checkModUpdates: (versionId: string) => ipcRenderer.invoke('mods:checkUpdates', versionId),
  updateMod: (versionId: string, fileName: string, modrinthVersionId: string) =>
    ipcRenderer.invoke('mods:update', versionId, fileName, modrinthVersionId),
  renameVersion: (versionId: string, newId: string) => ipcRenderer.invoke('versions:rename', versionId, newId),
  copyVersion: (versionId: string, newId: string, includeSaves: boolean) =>
    ipcRenderer.invoke('versions:copy', versionId, newId, includeSaves),
  createDesktopShortcut: (versionId: string) => ipcRenderer.invoke('versions:shortcut', versionId),
  listScreenshots: (versionId: string) => ipcRenderer.invoke('screenshots:list', versionId),
  deleteScreenshot: (versionId: string, fileName: string) =>
    ipcRenderer.invoke('screenshots:delete', versionId, fileName),
  copyScreenshot: (versionId: string, fileName: string) => ipcRenderer.invoke('screenshots:copy', versionId, fileName),
  showScreenshot: (versionId: string, fileName: string) => ipcRenderer.invoke('screenshots:show', versionId, fileName),
  openScreenshotsDir: (versionId: string) => ipcRenderer.invoke('screenshots:open', versionId),
  getPlayStats: () => ipcRenderer.invoke('stats:get'),
  getModpackExportInfo: (versionId: string) => ipcRenderer.invoke('export:info', versionId),
  exportModpack: (options: ModpackExportOptions) => ipcRenderer.invoke('export:run', options),
  showExportedModpack: () => ipcRenderer.invoke('export:show'),
  onExportProgress: (callback: (progress: { done: number; total: number }) => void) => {
    const listener = (_: unknown, progress: { done: number; total: number }): void => callback(progress)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  getVersionConfig: (versionId: string) => ipcRenderer.invoke('versions:getConfig', versionId),
  setVersionConfig: (versionId: string, patch: Partial<VersionConfig>) =>
    ipcRenderer.invoke('versions:setConfig', versionId, patch),
  listMods: (versionId: string) => ipcRenderer.invoke('mods:list', versionId),
  setModEnabled: (versionId: string, fileName: string, enabled: boolean) =>
    ipcRenderer.invoke('mods:setEnabled', versionId, fileName, enabled),
  deleteMod: (versionId: string, fileName: string) => ipcRenderer.invoke('mods:delete', versionId, fileName),
  addMods: (versionId: string) => ipcRenderer.invoke('mods:add', versionId),
  openModsDir: (versionId: string) => ipcRenderer.invoke('mods:open', versionId),
  pickModpack: () => ipcRenderer.invoke('modpack:pick'),
  installModpack: (name: string) => ipcRenderer.invoke('modpack:install', name),
  loadModpackFile: (path: string) => ipcRenderer.invoke('modpack:loadFile', path),
  searchResources: (type: ResourceType, query: string, offset: number, filters: ResourceSearchFilters) =>
    ipcRenderer.invoke('resource:search', type, query, offset, filters),
  getResourceVersions: (projectId: string, type: ResourceType) =>
    ipcRenderer.invoke('resource:versions', projectId, type),
  installResource: (target: ResourceTarget, type: ResourceType, versionId: string) =>
    ipcRenderer.invoke('resource:install', target, type, versionId),
  listWorlds: (versionId: string) => ipcRenderer.invoke('resource:worlds', versionId),
  downloadModpack: (versionId: string) => ipcRenderer.invoke('modpack:download', versionId),
  /** 拖入窗口的文件在本机的路径 */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  searchModrinth: (versionId: string, query: string, offset: number) =>
    ipcRenderer.invoke('modrinth:search', versionId, query, offset),
  installFromModrinth: (versionId: string, projectId: string) =>
    ipcRenderer.invoke('modrinth:install', versionId, projectId),
  launchGame: (versionId: string, server?: string) => ipcRenderer.invoke('game:launch', versionId, server),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openUpdateLink: (kind: 'asset' | 'page') => ipcRenderer.invoke('update:open', kind),
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server: Omit<SavedServer, 'id'> & { id?: string }) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (id: string) => ipcRenderer.invoke('servers:delete', id),
  moveServer: (id: string, offset: number) => ipcRenderer.invoke('servers:move', id, offset),
  importGameServers: () => ipcRenderer.invoke('servers:import'),
  pingServer: (address: string) => ipcRenderer.invoke('servers:ping', address),
  getGameStatus: () => ipcRenderer.invoke('game:status'),
  /** 订阅游戏运行状态，返回取消订阅函数 */
  getAccounts: () => ipcRenderer.invoke('accounts:list'),
  setActiveAccount: (id: string) => ipcRenderer.invoke('accounts:setActive', id),
  removeAccount: (uuid: string) => ipcRenderer.invoke('accounts:remove', uuid),
  loginExternal: (server: string, username: string, password: string) =>
    ipcRenderer.invoke('external:login', server, username, password),
  selectExternalProfile: (pendingId: string, profileId: string) =>
    ipcRenderer.invoke('external:selectProfile', pendingId, profileId),
  removeExternalAccount: (id: string) => ipcRenderer.invoke('external:remove', id),
  startMicrosoftLogin: () => ipcRenderer.invoke('ms:login'),
  cancelMicrosoftLogin: () => ipcRenderer.invoke('ms:cancel'),
  getMicrosoftLoginStatus: () => ipcRenderer.invoke('ms:status'),
  openMicrosoftLoginPage: () => ipcRenderer.invoke('ms:openLoginPage'),
  onMicrosoftLogin: (callback: (status: MsLoginStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: MsLoginStatus): void => callback(status)
    ipcRenderer.on('ms:login', listener)
    return () => {
      ipcRenderer.removeListener('ms:login', listener)
    }
  },
  pickBackground: () => ipcRenderer.invoke('appearance:pickBackground'),
  clearBackground: () => ipcRenderer.invoke('appearance:clearBackground'),
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    const listener = (_: Electron.IpcRendererEvent, settings: AppSettings): void => callback(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => {
      ipcRenderer.removeListener('settings:changed', listener)
    }
  },
  onGameStatus: (callback: (status: GameStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: GameStatus): void => callback(status)
    ipcRenderer.on('game:status', listener)
    return () => {
      ipcRenderer.removeListener('game:status', listener)
    }
  },
  getGameDirInfo: () => ipcRenderer.invoke('gamedir:info'),
  setGameDir: (dir: string) => ipcRenderer.invoke('gamedir:set', dir),
  pickGameDir: () => ipcRenderer.invoke('gamedir:pick'),
  openGameDir: () => ipcRenderer.invoke('gamedir:open'),
  getGameLogs: () => ipcRenderer.invoke('game:logs'),
  openLogWindow: () => ipcRenderer.invoke('logs:open'),
  /** 订阅游戏日志，返回取消订阅函数 */
  onGameLog: (callback: (event: GameLogEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: GameLogEvent): void => callback(event)
    ipcRenderer.on('game:log', listener)
    return () => {
      ipcRenderer.removeListener('game:log', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore 非隔离模式下直接挂载到 window
  window.electron = electronAPI
  // @ts-ignore 非隔离模式下直接挂载到 window
  window.api = api
}
