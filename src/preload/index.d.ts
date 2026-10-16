import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  FabricLoaderVersion,
  ForgeVersionInfo,
  GameDirInfo,
  GameLogEvent,
  GameStatus,
  InstalledVersion,
  InstallRequest,
  InstallStatus,
  JavaInfo,
  NeoForgeVersionInfo,
  OptiFineVersionInfo,
  ModList,
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
      startInstall: (request: InstallRequest) => Promise<void>
      retryInstall: () => Promise<void>
      cancelInstall: () => Promise<void>
      getInstallStatus: () => Promise<InstallStatus | null>
      getFabricLoaders: (minecraftVersion: string) => Promise<FabricLoaderVersion[]>
      getForgeVersions: (minecraftVersion: string) => Promise<ForgeVersionInfo[]>
      getNeoForgeVersions: (minecraftVersion: string) => Promise<NeoForgeVersionInfo[]>
      getOptiFineVersions: (minecraftVersion: string) => Promise<OptiFineVersionInfo[]>
      onInstallStatus: (callback: (status: InstallStatus | null) => void) => () => void
      getInstalledVersions: () => Promise<InstalledVersion[]>
      repairVersion: (versionId: string) => Promise<void>
      deleteVersion: (versionId: string) => Promise<boolean>
      openVersionDir: (versionId: string) => Promise<void>
      listMods: (versionId: string) => Promise<ModList>
      /** 返回修改后的文件名 */
      setModEnabled: (versionId: string, fileName: string, enabled: boolean) => Promise<string>
      deleteMod: (versionId: string, fileName: string) => Promise<void>
      /** 返回添加的数量，取消时为 0 */
      addMods: (versionId: string) => Promise<number>
      openModsDir: (versionId: string) => Promise<void>
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
