import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  GameStatus,
  InstalledVersion,
  InstallStatus,
  JavaInfo,
  SystemInfo,
  VersionManifest
} from '../shared/types'

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
      startInstall: (versionId: string) => Promise<void>
      cancelInstall: () => Promise<void>
      getInstallStatus: () => Promise<InstallStatus | null>
      onInstallStatus: (callback: (status: InstallStatus | null) => void) => () => void
      getInstalledVersions: () => Promise<InstalledVersion[]>
      launchGame: (versionId: string) => Promise<void>
      getGameStatus: () => Promise<GameStatus>
      onGameStatus: (callback: (status: GameStatus) => void) => () => void
    }
  }
}

export {}
