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
  JavaRuntimeInfo,
  NeoForgeVersionInfo,
  OptiFineVersionInfo,
  ModList,
  AccountsInfo,
  MsLoginStatus,
  ModrinthInstallResult,
  ModpackInfo,
  ModrinthModpack,
  ModpackSearchFilters,
  ModrinthModpackVersion,
  ModrinthSearchResult,
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
      /** 可下载的 Java 运行时及是否已下载 */
      getJavaRuntimes: () => Promise<JavaRuntimeInfo[]>
      /** 下载 Java 运行时，下载完成后返回 java 路径（进度通过 onInstallStatus 推送） */
      downloadJava: (component: string) => Promise<string>
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
      searchModrinth: (versionId: string, query: string, offset: number) => Promise<ModrinthSearchResult>
      /** 选择 .mrpack 整合包并读取信息，取消时返回 null */
      pickModpack: () => Promise<ModpackInfo | null>
      /** 安装最近选择的整合包（进度通过 onInstallStatus 推送） */
      installModpack: (name: string) => Promise<void>
      /** 读取拖入窗口的 .mrpack 文件 */
      loadModpackFile: (path: string) => Promise<ModpackInfo>
      searchModpacks: (
        query: string,
        offset: number,
        filters: ModpackSearchFilters
      ) => Promise<{ hits: ModrinthModpack[]; total: number }>
      getModpackVersions: (projectId: string) => Promise<ModrinthModpackVersion[]>
      /** 从 Modrinth 下载整合包的某个版本并读取信息 */
      downloadModpack: (versionId: string) => Promise<ModpackInfo>
      /** 拖入窗口的文件在本机的路径 */
      getPathForFile: (file: File) => string
      installFromModrinth: (versionId: string, projectId: string) => Promise<ModrinthInstallResult>
      launchGame: (versionId: string) => Promise<void>
      getGameStatus: () => Promise<GameStatus>
      onGameStatus: (callback: (status: GameStatus) => void) => () => void
      /** 选择背景图片，取消时返回原设置 */
      pickBackground: () => Promise<AppSettings>
      clearBackground: () => Promise<AppSettings>
      /** 任意窗口修改设置后推送最新设置 */
      onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void
      getAccounts: () => Promise<AccountsInfo>
      /** id 为 'offline' 或微软账号 UUID */
      setActiveAccount: (id: string) => Promise<AccountsInfo>
      removeAccount: (uuid: string) => Promise<AccountsInfo>
      /** 获取设备代码后立即返回，之后的进度通过 onMicrosoftLogin 推送 */
      startMicrosoftLogin: () => Promise<MsLoginStatus>
      cancelMicrosoftLogin: () => Promise<void>
      getMicrosoftLoginStatus: () => Promise<MsLoginStatus>
      /** 复制代码并打开登录网页 */
      openMicrosoftLoginPage: () => Promise<void>
      onMicrosoftLogin: (callback: (status: MsLoginStatus) => void) => () => void
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
