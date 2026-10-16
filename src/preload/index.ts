import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, GameLogEvent, GameStatus, InstallRequest, InstallStatus } from '../shared/types'

const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  scanJava: () => ipcRenderer.invoke('java:scan'),
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
  launchGame: (versionId: string) => ipcRenderer.invoke('game:launch', versionId),
  getGameStatus: () => ipcRenderer.invoke('game:status'),
  /** 订阅游戏运行状态，返回取消订阅函数 */
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
