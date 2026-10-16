import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings, JavaInfo, SystemInfo, VersionManifest } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      versions: {
        electron: string
        chrome: string
        node: string
      }
      scanJava: () => Promise<JavaInfo[]>
      getSettings: () => Promise<AppSettings>
      updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
      getSystemInfo: () => Promise<SystemInfo>
      getVersionList: (force?: boolean) => Promise<VersionManifest>
    }
  }
}

export {}
