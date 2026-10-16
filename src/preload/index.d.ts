import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  GameDirInfo,
  GameLogEvent,
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
      repairVersion: (versionId: string) => Promise<void>
      deleteVersion: (versionId: string) => Promise<boolean>
      openVersionDir: (versionId: string) => Promise<void>
      launchGame: (versionId: string) => Promise<void>
      getGameStatus: () => Promise<GameStatus>
      onGameStatus: (callback: (status: GameStatus) => void) => () => void
      getGameDirInfo: () => Promise<GameDirInfo>
      setGameDir: (dir: string) => Promise<GameDirInfo>
      pickGameDir: () => Promise<GameDirInfo | null>
      openGameDir: () => Promise<void>
      getGameLogs: () => Promise<string[]>
      openLogWindow: () => Promise<void>
      onGameLog: (callback: (event: GameLogEvent) => void) => () => void
    }
  }
}

export {}
