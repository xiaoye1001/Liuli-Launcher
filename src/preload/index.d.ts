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
  ModrinthProjectHit,
  ResourceSearchFilters,
  ResourceTarget,
  ResourceType,
  ModrinthProjectVersion,
  ModrinthSearchResult,
  SystemInfo,
  VersionManifest,
  VersionConfig,
  LocalResourceKind,
  LocalResourceList,
  WorldDatapack,
  WorldList,
  SavedServer,
  ServerStatus,
  UpdateInfo,
  ExternalAccount,
  ExternalLoginResult,
  ModUpdate,
  ScreenshotList,
  PlayStats,
  ModpackExportInfo,
  ModpackExportOptions,
  ModpackExportResult
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
      /** 版本游戏目录里的资源包 / 光影包 */
      listLocalResources: (versionId: string, kind: LocalResourceKind) => Promise<LocalResourceList>
      /** 在游戏中启用或停用资源包（修改 options.txt） */
      setResourcePackEnabled: (versionId: string, fileName: string, enabled: boolean) => Promise<void>
      /** 设置当前光影，null 为关闭光影 */
      setActiveShader: (versionId: string, fileName: string | null) => Promise<void>
      deleteLocalResource: (versionId: string, kind: LocalResourceKind, fileName: string) => Promise<void>
      /** 选择文件添加，返回添加的数量 */
      addLocalResources: (versionId: string, kind: LocalResourceKind) => Promise<number>
      openLocalResourceDir: (versionId: string, kind: LocalResourceKind) => Promise<void>
      /** 版本的存档列表 */
      listWorldInfos: (versionId: string) => Promise<WorldList>
      /** 删除存档（移到回收站） */
      deleteWorld: (versionId: string, folder: string) => Promise<void>
      /** 备份存档为 zip，返回路径与大小 */
      backupWorld: (versionId: string, folder: string) => Promise<{ path: string; size: number }>
      openWorldDir: (versionId: string, folder?: string) => Promise<void>
      openBackupsDir: (versionId: string) => Promise<void>
      /** 从 zip 导入存档，返回文件夹名；取消时返回 null */
      importWorld: (versionId: string) => Promise<string | null>
      listWorldDatapacks: (versionId: string, folder: string) => Promise<WorldDatapack[]>
      deleteWorldDatapack: (versionId: string, folder: string, fileName: string) => Promise<void>
      addWorldDatapacks: (versionId: string, folder: string) => Promise<number>
      openWorldDatapacksDir: (versionId: string, folder: string) => Promise<void>
      /** 打开最近一次崩溃的崩溃报告 / Java 崩溃日志 */
      openCrashFile: (kind: 'report' | 'native') => Promise<void>
      /** 导出崩溃信息 zip，返回保存路径；取消时返回 null */
      exportCrashInfo: () => Promise<string | null>
      /** 检查模组更新（只能识别 Modrinth 上的模组） */
      checkModUpdates: (versionId: string) => Promise<ModUpdate[]>
      /** 更新模组，返回新的文件名 */
      updateMod: (versionId: string, fileName: string, modrinthVersionId: string) => Promise<string>
      renameVersion: (versionId: string, newId: string) => Promise<void>
      /** 复制版本（includeSaves 为 false 时不复制存档） */
      copyVersion: (versionId: string, newId: string, includeSaves: boolean) => Promise<void>
      /** 在桌面创建直接启动该版本的快捷方式，返回快捷方式路径 */
      createDesktopShortcut: (versionId: string) => Promise<string>
      /** 版本的游戏截图（图片通过 liuli://screenshot/<版本>/<文件名> 读取） */
      listScreenshots: (versionId: string) => Promise<ScreenshotList>
      /** 删除截图（移到回收站） */
      deleteScreenshot: (versionId: string, fileName: string) => Promise<void>
      /** 复制截图到剪贴板 */
      copyScreenshot: (versionId: string, fileName: string) => Promise<void>
      showScreenshot: (versionId: string, fileName: string) => Promise<void>
      openScreenshotsDir: (versionId: string) => Promise<void>
      /** 游玩时长统计与最近游玩记录 */
      getPlayStats: () => Promise<PlayStats>
      /** 导出整合包：版本信息与可以导出的内容 */
      getModpackExportInfo: (versionId: string) => Promise<ModpackExportInfo>
      /** 导出整合包（弹出保存对话框），取消时返回 null */
      exportModpack: (options: ModpackExportOptions) => Promise<ModpackExportResult | null>
      /** 在文件夹中显示刚导出的整合包 */
      showExportedModpack: () => Promise<void>
      onExportProgress: (callback: (progress: { done: number; total: number }) => void) => () => void
      /** 版本设置（未设置的项跟随全局设置） */
      getVersionConfig: (versionId: string) => Promise<VersionConfig>
      setVersionConfig: (versionId: string, patch: Partial<VersionConfig>) => Promise<VersionConfig>
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
      /** 在 Modrinth 搜索某类社区资源 */
      searchResources: (
        type: ResourceType,
        query: string,
        offset: number,
        filters: ResourceSearchFilters
      ) => Promise<{ hits: ModrinthProjectHit[]; total: number }>
      getResourceVersions: (projectId: string, type: ResourceType) => Promise<ModrinthProjectVersion[]>
      /** 安装模组 / 资源包 / 光影 / 数据包的某个版本到指定游戏版本 */
      installResource: (target: ResourceTarget, type: ResourceType, versionId: string) => Promise<ModrinthInstallResult>
      /** 某个版本的存档列表 */
      listWorlds: (versionId: string) => Promise<string[]>
      /** 从 Modrinth 下载整合包的某个版本并读取信息 */
      downloadModpack: (versionId: string) => Promise<ModpackInfo>
      /** 拖入窗口的文件在本机的路径 */
      getPathForFile: (file: File) => string
      installFromModrinth: (versionId: string, projectId: string) => Promise<ModrinthInstallResult>
      /** 启动游戏；server 不为空时进入游戏后直接连接该服务器 */
      launchGame: (versionId: string, server?: string) => Promise<void>
      /** 查询 GitHub 上的最新版本 */
      checkUpdate: () => Promise<UpdateInfo>
      /** 在浏览器中打开新版本的安装包或发布页面 */
      openUpdateLink: (kind: 'asset' | 'page') => Promise<void>
      listServers: () => Promise<SavedServer[]>
      /** 添加（没有 id）或修改服务器，返回新的列表 */
      saveServer: (server: Omit<SavedServer, 'id'> & { id?: string }) => Promise<SavedServer[]>
      deleteServer: (id: string) => Promise<SavedServer[]>
      moveServer: (id: string, offset: number) => Promise<SavedServer[]>
      /** 从游戏的多人游戏列表（servers.dat）导入 */
      importGameServers: () => Promise<{ added: number; list: SavedServer[] }>
      /** 查询服务器状态 */
      pingServer: (address: string) => Promise<ServerStatus>
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
      /** 外置登录（authlib-injector 验证服务器，例如 LittleSkin） */
      loginExternal: (server: string, username: string, password: string) => Promise<ExternalLoginResult>
      /** 账号下有多个角色时选择一个 */
      selectExternalProfile: (pendingId: string, profileId: string) => Promise<ExternalAccount>
      removeExternalAccount: (id: string) => Promise<AccountsInfo>
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
