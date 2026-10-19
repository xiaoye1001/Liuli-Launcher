import type {
  UpdateDownload,
  NewsList,
  NetworkCheck,
  WorldBackup,
  MemoryPlan,
  MsSkinProfile,
  AppSettings,
  FabricLoaderVersion,
  ForgeVersionInfo,
  GameDirInfo,
  SharedLog,
  GameLogEvent,
  GameStatus,
  FastDownloadTask,
  DirectDownloadOptions,
  InstalledVersion,
  InstallRequest,
  InstallStatus,
  JavaInfo,
  JavaRuntimeInfo,
  NeoForgeVersionInfo,
  OptiFineVersionInfo,
  ModList,
  ModIssue,
  VersionDisplay,
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
  WorldDetails,
  SavedServer,
  ServerStatus,
  UpdateInfo,
  UpdateResult,
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
    api: {
      customTitleBar: boolean
      /** 界面上的窗口按钮：最小化、最大化 / 还原、关闭 */
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>
      isWindowMaximized: () => Promise<boolean>
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
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
      /** 测试常用服务器能否连接（使用当前的代理设置） */
      checkNetwork: () => Promise<NetworkCheck>
      /** Minecraft 官方新闻（一小时内使用缓存，force 为 true 时重新获取） */
      getNews: (force?: boolean) => Promise<NewsList>
      /** 预览某个版本自动分配的内存；版本无法读取时返回 null */
      previewMemory: (versionId: string) => Promise<MemoryPlan | null>
      getVersionList: (force?: boolean) => Promise<VersionManifest>
      startInstall: (request: InstallRequest) => Promise<void>
      retryInstall: () => Promise<void>
      cancelInstall: () => Promise<void>
      getInstallStatus: () => Promise<InstallStatus | null>
      getFabricLoaders: (minecraftVersion: string) => Promise<FabricLoaderVersion[]>
      /** 某个 Minecraft 版本可用的 Quilt 加载器版本，不支持时为空 */
      getQuiltLoaders: (minecraftVersion: string) => Promise<FabricLoaderVersion[]>
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
      /** 检查资源包 / 光影包在 Modrinth 上有没有新版本 */
      checkResourceUpdates: (versionId: string, kind: LocalResourceKind) => Promise<ModUpdate[]>
      /** 更新资源包 / 光影包，返回新文件名（启用状态保持不变） */
      updateResource: (
        versionId: string,
        kind: LocalResourceKind,
        fileName: string,
        modrinthVersionId: string
      ) => Promise<string>
      deleteLocalResource: (versionId: string, kind: LocalResourceKind, fileName: string) => Promise<void>
      /** 选择文件添加，返回添加的数量 */
      addLocalResources: (versionId: string, kind: LocalResourceKind) => Promise<number>
      openLocalResourceDir: (versionId: string, kind: LocalResourceKind) => Promise<void>
      /** 版本的存档列表 */
      listWorldInfos: (versionId: string) => Promise<WorldList>
      /** 存档详情：种子、难度、游戏规则等 */
      getWorldDetails: (versionId: string, folder: string) => Promise<WorldDetails>
      /** 删除存档（移到回收站） */
      deleteWorld: (versionId: string, folder: string) => Promise<void>
      /** 备份存档为 zip，返回路径与大小 */
      backupWorld: (versionId: string, folder: string) => Promise<{ path: string; size: number }>
      openWorldDir: (versionId: string, folder?: string) => Promise<void>
      openBackupsDir: (versionId: string) => Promise<void>
      /** 列出存档备份（新的在前） */
      listWorldBackups: (versionId: string) => Promise<WorldBackup[]>
      /** 还原备份：asNew 为 true 时还原为新存档，否则覆盖原存档（会先自动备份当前存档） */
      restoreWorldBackup: (
        versionId: string,
        file: string,
        asNew: boolean
      ) => Promise<{ folder: string; safetyBackup?: string }>
      /** 删除备份（移到回收站） */
      deleteWorldBackup: (versionId: string, file: string) => Promise<void>
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
      setVersionFavorite: (versionId: string, favorite: boolean) => Promise<VersionDisplay>
      /** 使用内置图标，null 恢复默认 */
      setVersionIcon: (versionId: string, icon: string | null) => Promise<VersionDisplay>
      /** 选择图片作为版本图标，取消时返回 null */
      pickVersionIcon: (versionId: string) => Promise<VersionDisplay | null>
      /** 检查模组问题：缺少前置、重复模组 */
      checkModIssues: (versionId: string) => Promise<ModIssue[]>
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
      /** 下载页一键安装：下载整合包并直接开始安装，返回使用的版本名 */
      downloadAndInstallModpack: (versionId: string) => Promise<string>
      /** 拖入窗口的文件在本机的路径 */
      getPathForFile: (file: File) => string
      installFromModrinth: (versionId: string, projectId: string) => Promise<ModrinthInstallResult>
      /** 启动游戏；server 不为空时进入游戏后直接连接该服务器 */
      launchGame: (versionId: string, server?: string) => Promise<void>
      /** 查询 GitHub 上的最新版本 */
      checkUpdate: () => Promise<UpdateInfo>
      /** 在浏览器中打开新版本的安装包或发布页面 */
      openUpdateLink: (kind: 'asset' | 'page') => Promise<void>
      /** 在启动器里下载新版本（校验 SHA-256），进度通过 onUpdateDownload 推送 */
      downloadUpdate: () => Promise<void>
      getUpdateDownload: () => Promise<UpdateDownload>
      cancelUpdateDownload: () => Promise<void>
      /** 替换为新版本并重启启动器 */
      installUpdate: () => Promise<void>
      /** 上次自动更新的结果，只返回一次；没有时为 null */
      getLastUpdateResult: () => Promise<UpdateResult | null>
      showUpdateLog: () => Promise<void>
      onUpdateDownload: (callback: (status: UpdateDownload) => void) => () => void
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
      /** 添加背景图片到背景库（可以多选） */
      addBackgrounds: () => Promise<AppSettings>
      /** 从背景库删除图片 */
      removeBackground: (name: string) => Promise<AppSettings>
      /** 下载网络图片或视频到背景库，并设为当前背景 */
      addBackgroundUrl: (url: string) => Promise<AppSettings>
      /** 导出主题为 .liulitheme 文件；不传 ID 时导出当前外观；取消时返回 null */
      exportTheme: (themeId?: string) => Promise<{ path: string; wallpaperSkipped: boolean } | null>
      /** 导入主题：保存到「我的主题」并立即应用；取消时返回 null */
      importTheme: () => Promise<{ settings: AppSettings; themeId: string; name: string } | null>
      /** 背景音乐列表（music 文件夹里的音频文件名） */
      listMusic: () => Promise<string[]>
      /** 添加背景音乐（可以多选），返回新的列表 */
      addMusic: () => Promise<string[]>
      removeMusic: (name: string) => Promise<string[]>
      openMusicDir: () => Promise<void>
      // ---------- 高速多线程下载（百宝箱） ----------
      /** 新建直链下载（只支持 http / https），返回任务 ID */
      createDirectDownload: (url: string, options?: DirectDownloadOptions) => Promise<string>
      /** 所有下载任务（包括模组、整合包下载），最新的在前 */
      listDownloads: () => Promise<FastDownloadTask[]>
      pauseDownload: (taskId: string) => Promise<void>
      resumeDownload: (taskId: string) => Promise<void>
      cancelDownload: (taskId: string) => Promise<void>
      /** 从列表中移除已结束的任务；不传 taskId 时移除全部已结束的任务 */
      removeDownload: (taskId?: string) => Promise<void>
      /** 选择保存文件夹，取消时返回 null */
      pickDownloadDir: () => Promise<string | null>
      /** 打开任务所在的文件夹（已完成时选中文件） */
      openDownloadFolder: (taskId: string) => Promise<void>
      /** 监听下载进度（每 250 毫秒推送一次所有任务），返回取消监听的函数 */
      onDownloadProgress: (callback: (tasks: FastDownloadTask[]) => void) => () => void
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
      /** 添加离线账号并切换为当前账号 */
      addOfflineAccount: (name: string) => Promise<AppSettings>
      /** 切换到某个离线账号（同时把当前账号设为离线） */
      selectOfflineAccount: (id: string) => Promise<AppSettings>
      renameOfflineAccount: (id: string, name: string) => Promise<AppSettings>
      /** 删除离线账号，至少保留一个 */
      removeOfflineAccount: (id: string) => Promise<AppSettings>
      /** 获取设备代码后立即返回，之后的进度通过 onMicrosoftLogin 推送 */
      startMicrosoftLogin: () => Promise<MsLoginStatus>
      cancelMicrosoftLogin: () => Promise<void>
      getMicrosoftLoginStatus: () => Promise<MsLoginStatus>
      /** 复制代码并打开登录网页 */
      openMicrosoftLoginPage: () => Promise<void>
      /** 读取正版账号的皮肤与披风 */
      getMsSkinProfile: (uuid: string) => Promise<MsSkinProfile>
      /** 选择 PNG 上传为正版皮肤；取消时返回 null */
      uploadMsSkin: (uuid: string, variant: 'classic' | 'slim') => Promise<MsSkinProfile | null>
      /** 恢复默认皮肤 */
      resetMsSkin: (uuid: string) => Promise<MsSkinProfile>
      /** 选择显示的披风，null 表示不显示 */
      setMsCape: (uuid: string, capeId: string | null) => Promise<MsSkinProfile>
      onMicrosoftLogin: (callback: (status: MsLoginStatus) => void) => () => void
      getGameDirInfo: () => Promise<GameDirInfo>
      setGameDir: (dir: string) => Promise<GameDirInfo>
      pickGameDir: () => Promise<GameDirInfo | null>
      /** 打开游戏目录，不填时打开当前目录 */
      openGameDir: (dir?: string) => Promise<void>
      renameGameDir: (dir: string, name: string) => Promise<GameDirInfo>
      removeGameDir: (dir: string) => Promise<GameDirInfo>
      getGameLogs: () => Promise<string[]>
      openLogWindow: () => Promise<void>
      /** 上传到 mclo.gs：日志窗口里的游戏输出 */
      shareGameLog: () => Promise<SharedLog[]>
      /** 去掉日志里的登录令牌和用户文件夹路径（复制日志时使用） */
      sanitizeLog: (text: string) => Promise<string>
      /** 上传到 mclo.gs：最近一次崩溃的游戏输出和崩溃报告 */
      shareCrashLogs: () => Promise<SharedLog[]>
      /** 上传到 mclo.gs：某个版本的 logs/latest.log */
      shareLatestLog: (versionId: string) => Promise<SharedLog[]>
      onGameLog: (callback: (event: GameLogEvent) => void) => () => void
    }
  }
}

export {}
