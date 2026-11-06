import type { AchievementStatus } from '../shared/achievements'
import type {
  CleanCategory,
  LocalAddresses,
  MultiplayerMod,
  MultiplayerStatus,
  P2PCoreStatus,
  CleanResult,
  CleanScan,
  JavaCheckReport,
  SpeedTestReport,
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
  PerformanceModResult,
  LaunchTiming,
  LaunchTimingRecord,
  GameOptionsInfo,
  OptionsCopyMode,
  OptionsCopyResult,
  VideoPreset,
  ModRollback,
  RepairInfo,
  ShaderChoice,
  ModCollection,
  GameResources,
  WorldMap,
  CrashRecord,
  KeyConflict,
  ModProfile,
  ModProfileResult,
  VersionSnapshot,
  ModMigrationCheck,
  SeedFavorite,
  DailyGoalStatus,
  ModUpdateSummary,
  GameReleaseNews,
  WardrobeSkin,
  SkinModel,
  CloudBackupConfig,
  CloudBackupInput,
  CloudBackupItem,
  CloudBackupStatus,
  LocalServer,
  LocalServerInput,
  LocalServerStatus,
  LocalServerPlayers,
  LocalServerPlayerAction,
  ShaderSetupResult,
  ModTranslationResult,
  ModpackInfo,
  ModpackUpdateCheck,
  ModpackUpdatePlan,
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
  OnThisDayShot,
  PlayStats,
  ModpackExportInfo,
  ModpackExportOptions,
  ModpackExportResult,
  AiAnalysisResult,
  AiConfig,
  AiConfigPatch,
  AiDelta
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
      /** 多人联机：当前状态（房间码、延迟、流量、本机对局域网开放的世界等） */
      getMultiplayerStatus: () => Promise<MultiplayerStatus>
      /** 多人联机：本机可用于直连的地址（公网 IPv6、公网 IPv4、局域网 IPv4） */
      getLocalAddresses: () => Promise<LocalAddresses>
      /** 多人联机：开始 / 停止监听本机「对局域网开放」的世界 */
      setLanSniffer: (enabled: boolean) => Promise<void>
      /** 方式一：创建直连房间（不填端口时使用检测到的局域网端口） */
      hostDirectRoom: (port?: number) => Promise<MultiplayerStatus>
      /** 方式二：创建 P2P 房间（本机没有内核时自动改用直连房间码）；relay 为自定义中继地址 */
      hostP2PRoom: (port?: number, relay?: string) => Promise<MultiplayerStatus>
      /** 方式三：把已有的穿透地址包装成房间码 */
      hostTunnelRoom: (address: string, motd?: string) => Promise<MultiplayerStatus>
      /** 加入房间（自动识别 MCL-D- / MCL-P2P- / MCL-T- 房间码） */
      joinRoom: (code: string) => Promise<MultiplayerStatus>
      /** 结束当前房间 */
      stopMultiplayer: () => Promise<MultiplayerStatus>
      /** P2P 联机内核的状态 */
      getP2PCoreStatus: () => Promise<P2PCoreStatus>
      /** 下载 P2P 联机内核（多线程高速下载，校验 SHA-256） */
      downloadP2PCore: () => Promise<P2PCoreStatus>
      /** 一键安装联机模组（e4mc / World Host）到指定版本 */
      installMultiplayerMod: (versionId: string, mod: MultiplayerMod) => Promise<ModrinthInstallResult>
      /** 联机状态变化（含每秒更新的流量）；返回取消订阅的函数 */
      onMultiplayerStatus: (callback: (status: MultiplayerStatus) => void) => () => void
      /** 百宝箱：扫描可以清理的游戏垃圾缓存 */
      scanCleanup: () => Promise<CleanScan>
      /** 百宝箱：清理选中的类别（删除前会重新扫描） */
      runCleanup: (categories: CleanCategory[]) => Promise<CleanResult>
      /** 百宝箱：Java 环境深度检测 */
      checkJavaEnvironment: () => Promise<JavaCheckReport>
      /** 百宝箱：对比官方源与国内镜像的速度 */
      runSpeedTest: () => Promise<SpeedTestReport>
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
      /** 存档地图预览：以 (x, z) 为中心、边长 size 格的主世界俯视图 */
      renderWorldMap: (versionId: string, folder: string, x: number, z: number, size: number) => Promise<WorldMap>
      /** 选择存档备份位置（取消时不改），返回最新的设置 */
      pickBackupDir: () => Promise<AppSettings>
      /** 存档备份位置恢复为游戏目录里的 backups 文件夹 */
      resetBackupDir: () => Promise<AppSettings>
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
      /** 可以退回的模组更新（最近 30 天） */
      listModRollbacks: (versionId: string) => Promise<ModRollback[]>
      /** 退回更新前的模组文件，返回放回的文件名 */
      rollbackModUpdate: (versionId: string, id: string) => Promise<string>
      /** 模组启用方案；current 是和现在的开关状态一样的方案 */
      listModProfiles: (versionId: string) => Promise<{ profiles: ModProfile[]; current: string | null }>
      /** 把现在的开关状态存成方案（同名的会被更新） */
      saveModProfile: (versionId: string, name: string) => Promise<ModProfile>
      applyModProfile: (versionId: string, id: string) => Promise<ModProfileResult>
      deleteModProfile: (versionId: string, id: string) => Promise<void>
      /** 版本快照（模组、模组配置、游戏设置），新的在前 */
      listSnapshots: (versionId: string) => Promise<VersionSnapshot[]>
      createSnapshot: (versionId: string, name: string) => Promise<VersionSnapshot>
      /** 恢复快照；返回恢复前自动保存的快照 */
      restoreSnapshot: (versionId: string, id: string) => Promise<VersionSnapshot>
      deleteSnapshot: (versionId: string, id: string) => Promise<void>
      /** 一键开服：本地服务器列表（新的在前） */
      listLocalServers: () => Promise<LocalServer[]>
      /** 运行状态、最近的输出、正在下载服务端的服务器 */
      getLocalServerStatus: () => Promise<{ status: LocalServerStatus; log: string[]; preparing: string[] }>
      /** 新建服务器并下载服务端（必须同意 EULA） */
      createLocalServer: (input: LocalServerInput) => Promise<LocalServer>
      updateLocalServer: (
        id: string,
        patch: Partial<Pick<LocalServer, 'name' | 'port' | 'memoryMb' | 'onlineMode'>>
      ) => Promise<LocalServer>
      redownloadLocalServer: (id: string) => Promise<LocalServer>
      /** 删除服务器（移到回收站） */
      deleteLocalServer: (id: string) => Promise<void>
      openLocalServerFolder: (id: string) => Promise<void>
      startLocalServer: (id: string) => Promise<void>
      stopLocalServer: () => Promise<void>
      /** 往服务器控制台发命令（一行，不用加 /） */
      sendLocalServerCommand: (command: string) => Promise<void>
      /** 在线玩家、管理员、白名单 */
      getLocalServerPlayers: (id: string) => Promise<LocalServerPlayers>
      /** 管理玩家（服务器运行时）：设为 / 取消管理员、踢出、白名单 */
      manageLocalServerPlayer: (id: string, action: LocalServerPlayerAction, name?: string) => Promise<void>
      onLocalServerStatus: (callback: (status: LocalServerStatus) => void) => () => void
      onLocalServerLog: (callback: (line: string) => void) => () => void
      onLocalServersChanged: (callback: () => void) => () => void
      /** 存档云备份（WebDAV）的设置，不包含密码 */
      getCloudBackupConfig: () => Promise<CloudBackupConfig>
      /** 保存网盘设置（密码为空时保留原来的） */
      configureCloudBackup: (input: CloudBackupInput) => Promise<CloudBackupConfig>
      /** 测试连接，成功时返回说明 */
      testCloudBackup: () => Promise<string>
      getCloudBackupStatus: () => Promise<CloudBackupStatus>
      /** 网盘里的存档备份（包括别的电脑上传的） */
      listCloudBackups: (versionId: string) => Promise<CloudBackupItem[]>
      /** 把一个本地备份上传到网盘 */
      uploadWorldBackup: (versionId: string, file: string) => Promise<void>
      /** 把网盘里的备份下载到这个版本的备份文件夹 */
      downloadCloudBackup: (versionId: string, source: string, file: string) => Promise<string>
      onCloudBackupStatus: (callback: (status: CloudBackupStatus) => void) => () => void
      /** 后台检查到的各个版本可以更新的模组 */
      getModUpdateSummary: () => Promise<Record<string, ModUpdateSummary>>
      onModUpdatesChanged: (callback: (summary: Record<string, ModUpdateSummary>) => void) => () => void
      /** Minecraft 新版本发布提醒 */
      getGameReleaseNews: () => Promise<GameReleaseNews | null>
      dismissGameReleaseNews: () => Promise<void>
      onGameReleaseNews: (callback: (news: GameReleaseNews | null) => void) => () => void
      /** 每日小目标 */
      getDailyGoal: () => Promise<DailyGoalStatus>
      /** 打卡（false 取消今天的打卡） */
      setDailyGoalDone: (done: boolean) => Promise<DailyGoalStatus>
      /** 换一个目标（每天最多 3 次） */
      skipDailyGoal: () => Promise<DailyGoalStatus>
      /** 种子收藏夹（新的在前） */
      listSeedFavorites: () => Promise<SeedFavorite[]>
      /** 收藏种子（同一个种子和版本只收藏一次） */
      addSeedFavorite: (
        input: Partial<Pick<SeedFavorite, 'seed' | 'name' | 'note' | 'version'>>
      ) => Promise<SeedFavorite[]>
      updateSeedFavorite: (
        id: string,
        patch: Partial<Pick<SeedFavorite, 'name' | 'note' | 'version'>>
      ) => Promise<SeedFavorite[]>
      deleteSeedFavorite: (id: string) => Promise<SeedFavorite[]>
      /** 模组迁移：检查已启用的模组在目标版本上有没有适用的版本 */
      checkModMigration: (versionId: string, targetId: string) => Promise<ModMigrationCheck>
      /** 把选中的模组装到目标版本 */
      applyModMigration: (
        versionId: string,
        targetId: string,
        mods: { projectId: string; title: string }[]
      ) => Promise<PerformanceModResult[]>
      /** 我的模组合集 */
      listModCollections: () => Promise<ModCollection[]>
      /** 把这个版本已启用的模组存为合集（只能保存 Modrinth 上有的模组） */
      saveModCollection: (versionId: string, name: string) => Promise<{ collection: ModCollection; unknown: string[] }>
      deleteModCollection: (id: string) => Promise<void>
      renameModCollection: (id: string, name: string) => Promise<void>
      /** 把合集装到这个版本 */
      applyModCollection: (versionId: string, id: string) => Promise<PerformanceModResult[]>
      /** 一键光影：装光影加载器和渲染优化模组，下载光影包并开启 */
      setupShaders: (versionId: string, choice: ShaderChoice) => Promise<ShaderSetupResult>
      /** 修复向导：最近添加的模组、Java 设置、自定义启动参数等 */
      getRepairInfo: (versionId: string) => Promise<RepairInfo>
      /** 修复向导：暂时禁用最近添加的模组 */
      repairDisableMods: (versionId: string, files: string[]) => Promise<{ done: string[]; failed: string[] }>
      /** 修复向导：这个版本的 Java 改为自动选择 */
      repairAutoJava: (versionId: string) => Promise<void>
      /** 修复向导：清除这个版本的自定义启动参数 */
      repairClearArgs: (versionId: string) => Promise<void>
      /** 修复向导：画质改成流畅、关闭全屏（修改前自动备份） */
      repairResetVideo: (versionId: string) => Promise<void>
      renameVersion: (versionId: string, newId: string) => Promise<void>
      /** 复制版本（includeSaves 为 false 时不复制存档） */
      copyVersion: (versionId: string, newId: string, includeSaves: boolean) => Promise<void>
      /** 在桌面创建直接启动该版本的快捷方式，返回快捷方式路径 */
      createDesktopShortcut: (versionId: string) => Promise<string>
      /** 版本的游戏截图（图片通过 liuli://screenshot/<版本>/<文件名> 读取） */
      listScreenshots: (versionId: string) => Promise<ScreenshotList>
      /** 那年今日：往年的今天拍的截图（新的在前） */
      screenshotsOnThisDay: () => Promise<OnThisDayShot[]>
      /** 删除截图（移到回收站） */
      deleteScreenshot: (versionId: string, fileName: string) => Promise<void>
      /** 复制截图到剪贴板 */
      copyScreenshot: (versionId: string, fileName: string) => Promise<void>
      showScreenshot: (versionId: string, fileName: string) => Promise<void>
      openScreenshotsDir: (versionId: string) => Promise<void>
      /** 游玩时长统计与最近游玩记录 */
      getPlayStats: () => Promise<PlayStats>
      /** 崩溃记录（新的在前） */
      listCrashHistory: () => Promise<CrashRecord[]>
      clearCrashHistory: () => Promise<void>
      /** 保存报告图片（PNG），返回保存的路径，取消时返回 null */
      saveReportImage: (dataUrl: string, name: string) => Promise<string | null>
      /** 复制报告图片到剪贴板 */
      copyReportImage: (dataUrl: string) => Promise<void>
      /** 启动用时：最近一次（和这个版本上一次比较）、最快的一次 */
      getLaunchTiming: () => Promise<{ latest: LaunchTiming | null; best?: LaunchTimingRecord }>
      /** 一个版本的游戏设置（options.txt）：有没有设置、备份，以及可以从哪些版本复制 */
      getGameOptionsInfo: (versionId: string) => Promise<GameOptionsInfo>
      /** 从另一个版本复制游戏设置（修改前自动备份） */
      copyGameOptions: (from: string, to: string, mode: OptionsCopyMode) => Promise<OptionsCopyResult>
      /** 恢复上次修改前的游戏设置 */
      restoreGameOptions: (versionId: string) => Promise<void>
      /** 按键冲突：绑在同一个键上的操作 */
      getKeyConflicts: (versionId: string) => Promise<KeyConflict[]>
      /** 解除某个操作的按键绑定（修改前自动备份） */
      unbindKey: (versionId: string, action: string) => Promise<void>
      /** 全部按键恢复默认（修改前自动备份） */
      resetKeyBindings: (versionId: string) => Promise<void>
      /** 套用画质档位（只改视距、图形质量等几项，修改前自动备份） */
      applyVideoPreset: (versionId: string, preset: VideoPreset) => Promise<void>
      /** 启动器成就（含进度） */
      getAchievements: () => Promise<AchievementStatus[]>
      /** 解锁了新成就时回调（参数是成就 ID），返回取消监听的函数 */
      onAchievementUnlocked: (callback: (id: string) => void) => () => void
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
      /** 检查整合包有没有新版本（从下载页安装的整合包） */
      checkModpackUpdate: (versionId: string) => Promise<ModpackUpdateCheck>
      /** 下载整合包的新版本并读取信息，确认后用 applyModpackUpdate 开始更新 */
      prepareModpackUpdate: (versionId: string, packVersionId: string) => Promise<ModpackUpdatePlan>
      /** 选择新版本的整合包文件来更新，取消时为 null */
      pickModpackUpdateFile: (versionId: string) => Promise<ModpackUpdatePlan | null>
      /** 开始更新整合包（进度通过 onInstallStatus 推送） */
      applyModpackUpdate: (versionId: string, token: string) => Promise<void>
      /** 拖入窗口的文件在本机的路径 */
      getPathForFile: (file: File) => string
      /** 一键性能优化：安装常用的优化模组，返回每个模组的结果 */
      installPerformanceMods: (versionId: string) => Promise<PerformanceModResult[]>
      /** 模组汉化：安装 I18nUpdateMod（进入游戏时自动下载最新的模组汉化） */
      installModTranslation: (versionId: string) => Promise<ModTranslationResult>
      installFromModrinth: (versionId: string, projectId: string) => Promise<ModrinthInstallResult>
      /** 启动游戏；server 不为空时进入游戏后直接连接该服务器，world 不为空时直接进入这个存档（1.20 起） */
      launchGame: (versionId: string, server?: string, world?: string) => Promise<void>
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
      /** 上线提醒：服务器上线、有人进服时弹系统通知 */
      setServerWatch: (id: string, watch: boolean) => Promise<SavedServer[]>
      moveServer: (id: string, offset: number) => Promise<SavedServer[]>
      /** 从游戏的多人游戏列表（servers.dat）导入 */
      importGameServers: () => Promise<{ added: number; list: SavedServer[] }>
      /** 查询服务器状态 */
      pingServer: (address: string) => Promise<ServerStatus>
      getGameStatus: () => Promise<GameStatus>
      /** 版本需要的 Java 主版本；读不到时为 null */
      getJavaRequirement: (versionId: string) => Promise<number | null>
      /** 取消正在进行的启动（游戏窗口出现之前有效），返回是否已发出取消 */
      cancelLaunch: () => Promise<boolean>
      /** 强制结束正在运行的游戏，游戏没有在运行时返回 false */
      killGame: () => Promise<boolean>
      onGameStatus: (callback: (status: GameStatus) => void) => () => void
      /** 游戏资源占用（内存、CPU），游戏没有运行时为 null */
      getGameResources: () => Promise<GameResources | null>
      /** 这次游戏最近一段时间的占用记录（旧的在前，画曲线用） */
      getGameResourceHistory: () => Promise<GameResources[]>
      onGameResources: (callback: (resources: GameResources | null) => void) => () => void
      /** 选择背景图片，取消时返回原设置 */
      pickBackground: () => Promise<AppSettings>
      clearBackground: () => Promise<AppSettings>
      /** 添加背景图片到背景库（可以多选） */
      addBackgrounds: () => Promise<AppSettings>
      /** 从背景库删除图片 */
      removeBackground: (name: string) => Promise<AppSettings>
      /** 下载网络图片或视频到背景库，并设为当前背景 */
      addBackgroundUrl: (url: string) => Promise<AppSettings>
      /** 把游戏截图放进背景库并设为当前背景 */
      backgroundFromScreenshot: (versionId: string, fileName: string) => Promise<AppSettings>
      /** 导出主题为 .liulitheme 文件；不传 ID 时导出当前外观；取消时返回 null */
      exportTheme: (themeId?: string) => Promise<{ path: string; wallpaperSkipped: boolean } | null>
      /** 导入主题：保存到「我的主题」并立即应用；取消时返回 null */
      importTheme: () => Promise<{ settings: AppSettings; themeId: string; name: string } | null>
      /** 应用精选主题（复制壁纸和音乐后应用整套外观），返回新的设置 */
      applyBuiltinTheme: (id: string) => Promise<AppSettings>
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
      /** 皮肤衣柜 */
      listWardrobe: () => Promise<WardrobeSkin[]>
      addToWardrobe: (image: string, name: string, model: SkinModel) => Promise<WardrobeSkin[]>
      updateWardrobeSkin: (id: string, patch: { name?: string; model?: SkinModel }) => Promise<WardrobeSkin[]>
      removeFromWardrobe: (id: string) => Promise<WardrobeSkin[]>
      wearWardrobeSkin: (
        id: string
      ) => Promise<{ kind: 'offline'; settings: AppSettings } | { kind: 'microsoft'; profile: MsSkinProfile }>
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
      /** 打开或关闭日志窗口，返回操作后是否打开着 */
      toggleLogWindow: () => Promise<boolean>
      isLogWindowOpen: () => Promise<boolean>
      /** 预览桌面启动悬浮窗 */
      previewLaunchSplash: () => Promise<void>
      onLogWindowState: (callback: (open: boolean) => void) => () => void
      /** 上传到 mclo.gs：日志窗口里的游戏输出 */
      shareGameLog: () => Promise<SharedLog[]>
      /** 去掉日志里的登录令牌和用户文件夹路径（复制日志时使用） */
      sanitizeLog: (text: string) => Promise<string>
      /** 上传到 mclo.gs：最近一次崩溃的游戏输出和崩溃报告 */
      shareCrashLogs: () => Promise<SharedLog[]>
      /** AI 助手：读取设置（不含 API Key 本身） */
      aiGetConfig: () => Promise<AiConfig>
      /** AI 助手：修改设置；apiKey 为空字符串或 null 时删除已保存的 Key */
      aiSetConfig: (patch: AiConfigPatch) => Promise<AiConfig>
      /** 测试连接，返回说明文字 */
      aiTest: () => Promise<string>
      aiListModels: () => Promise<string[]>
      /** 分析当前的启动失败或崩溃；force 为 true 时不使用上次的结果 */
      aiAnalyze: (id: string, force?: boolean) => Promise<AiAnalysisResult>
      aiCancel: (id: string) => Promise<void>
      /** 订阅 AI 分析过程中的新文字，返回取消订阅函数 */
      onAiDelta: (callback: (delta: AiDelta) => void) => () => void
      /** 上传到 mclo.gs：某个版本的 logs/latest.log */
      shareLatestLog: (versionId: string) => Promise<SharedLog[]>
      onGameLog: (callback: (event: GameLogEvent) => void) => () => void
    }
  }
}

export {}
