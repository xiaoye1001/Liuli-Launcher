import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, InstallStatus } from '../shared/types'

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
  startInstall: (versionId: string) => ipcRenderer.invoke('install:start', versionId),
  cancelInstall: () => ipcRenderer.invoke('install:cancel'),
  getInstallStatus: () => ipcRenderer.invoke('install:status'),
  /** 订阅安装进度，返回取消订阅函数 */
  onInstallStatus: (callback: (status: InstallStatus | null) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: InstallStatus | null): void => callback(status)
    ipcRenderer.on('install:status', listener)
    return () => {
      ipcRenderer.removeListener('install:status', listener)
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
