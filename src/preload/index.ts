import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  scanJava: () => ipcRenderer.invoke('java:scan')
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
