/** 一个可用的 Java 运行环境 */
export interface JavaInfo {
  /** java 可执行文件的完整路径 */
  path: string
  /** 完整版本号，例如 21.0.4 */
  version: string
  /** 主版本号，例如 21 */
  majorVersion: number
}

/** 下载源：官方源 或 BMCLAPI 国内镜像 */
export type DownloadSource = 'mojang' | 'bmclapi'

/** 启动器设置，保存在 userData/settings.json */
export interface AppSettings {
  /** 选中的 java 可执行文件路径，空字符串表示未选择 */
  javaPath: string
  /** 游戏最大内存（MB） */
  maxMemory: number
  /** 下载源 */
  downloadSource: DownloadSource
  /** 游戏目录（.minecraft） */
  gameDir: string
  /** 离线模式玩家名 */
  offlineName: string
  /** 上次选择启动的版本 */
  selectedVersion: string
  /** 自定义皮肤（PNG 的 data URL），空字符串表示使用默认皮肤 */
  skinDataUrl: string
  /** 皮肤模型：经典（4 像素宽手臂）或纤细（3 像素宽手臂） */
  skinModel: SkinModel
  /** 界面主题 */
  theme: ThemeMode
  /** 版本隔离：开启后版本使用 versions/<版本名> 作为游戏目录，模组、存档、配置互不影响 */
  versionIsolation: VersionIsolation
}

/** 版本隔离：关闭 / 只隔离装了模组加载器的版本 / 隔离所有版本 */
export type VersionIsolation = 'off' | 'modded' | 'all'

/** 界面主题：跟随系统 / 深色 / 浅色 */
export type ThemeMode = 'system' | 'dark' | 'light'

/** 皮肤模型 */
export type SkinModel = 'default' | 'slim'

/** 系统信息 */
export interface SystemInfo {
  /** 物理内存总量（MB） */
  totalMemory: number
}

/** 版本类型：正式版 / 快照 / 远古 Beta / 远古 Alpha */
export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

/** 版本清单中的一个 Minecraft 版本 */
export interface VersionEntry {
  id: string
  type: VersionType
  releaseTime: string
  /** 版本 json 的下载地址 */
  url: string
}

/** 版本清单 */
export interface VersionManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: VersionEntry[]
  /** 实际使用的下载源（首选源失败时会自动切换到另一个） */
  source: DownloadSource
}

/** 任务类型：安装新版本 / 检查并修复已安装版本 */
export type InstallKind = 'install' | 'repair'

/** 安装状态 */
export type InstallState = 'running' | 'success' | 'failed' | 'cancelled'

/** 安装阶段：游戏本体（版本 json 与客户端 jar） → 依赖库与资源文件（并行下载） → 运行模组加载器安装程序 */
export type InstallPhase = 'version' | 'dependencies' | 'processing'

/** 安装进度，由主进程实时推送到界面 */
export interface InstallStatus {
  versionId: string
  kind: InstallKind
  state: InstallState
  /** 当前正在下载的阶段 */
  phase: InstallPhase
  /** 已下载字节数 */
  progress: number
  /** 总字节数（随着阶段推进会逐渐增大） */
  total: number
  /** 下载速度（字节/秒） */
  speed: number
  /** 失败原因 */
  error?: string
}

/** 模组加载器 */
export type ModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'optifine'

/** 本地已安装的版本 */
export interface InstalledVersion {
  id: string
  /** 版本类型（来自版本 json 的 type 字段，可能为空） */
  type: string
  releaseTime: string
  /** 检测到的模组加载器，原版为 undefined */
  loader?: ModLoader
  /** 是否使用独立的游戏目录（版本隔离） */
  isolated: boolean
}

/** 游戏运行状态：空闲 / 启动中 / 窗口已出现 / 正常退出 / 崩溃或启动失败 */
export type GameState = 'idle' | 'launching' | 'running' | 'exited' | 'crashed'

export interface GameStatus {
  state: GameState
  versionId: string
  /** 进程退出码 */
  exitCode?: number | null
  /** 启动失败或崩溃的原因 */
  error?: string
}

/** 推送到日志窗口的一批日志 */
export interface GameLogEvent {
  /** 为 true 时表示新一次启动，界面应先清空旧日志 */
  reset: boolean
  lines: string[]
}

/** 游戏目录信息 */
export interface GameDirInfo {
  /** 当前使用的游戏目录 */
  path: string
  /** 目录中已安装的版本数量 */
  versionCount: number
  /** 是否为启动器默认目录 */
  isDefault: boolean
  /** 是否为官方启动器的目录 */
  isOfficial: boolean
  /** 启动器默认目录 */
  defaultDir: string
  /** 官方启动器的 .minecraft 目录 */
  officialDir: string
  /** 官方启动器目录是否存在 */
  officialExists: boolean
}

/** 一个 Fabric 加载器版本 */
export interface FabricLoaderVersion {
  version: string
  /** 是否为稳定版 */
  stable: boolean
}

/** 安装请求：在原版基础上可选附加模组加载器，并可自定义版本名 */
export interface InstallRequest {
  /** Minecraft 原版版本号 */
  minecraftVersion: string
  /** 安装后的版本名（versions 下的文件夹名） */
  name: string
  /** 要附加的 Fabric 加载器版本，不安装时为空 */
  fabricLoader?: string
  /** 要附加的 Forge 版本（例如 47.3.0），不安装时为空 */
  forgeVersion?: string
  /** 要附加的 NeoForge 版本（例如 21.1.65，1.20.1 为 1.20.1-47.1.106），不安装时为空 */
  neoforgeVersion?: string
  /** 要附加的 OptiFine 版本，不安装时为空 */
  optifine?: OptiFineVersionRef
}

/** 指定一个 OptiFine 版本，例如 { type: 'HD_U', patch: 'I6' } */
export interface OptiFineVersionRef {
  type: string
  patch: string
}

export interface OptiFineVersionInfo extends OptiFineVersionRef {
  /** 是否为预览版（patch 形如 I7_pre1） */
  preview: boolean
  /** 兼容的 Forge 版本说明，例如「Forge 47.1.0」，可能为空 */
  forge?: string
}

/** 一个 NeoForge 版本 */
export interface NeoForgeVersionInfo {
  /** 版本号，例如 21.1.65；1.20.1 时形如 1.20.1-47.1.106 */
  version: string
  /** 是否为测试版 */
  beta: boolean
}

/** 一个 Forge 版本 */
export interface ForgeVersionInfo {
  /** Forge 版本号，例如 47.3.0 */
  version: string
  /** 对应的 Minecraft 版本 */
  mcversion: string
  /** 是否为官方推荐版本 */
  recommended: boolean
  /** 是否为该 Minecraft 版本的最新版本 */
  latest: boolean
  /** 发布时间（可能为空） */
  date: string
}

/** 模组文件对应的加载器（从模组自带的描述文件判断） */
export type ModKind = 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'unknown'

/** mods 文件夹中的一个模组 */
export interface ModInfo {
  /** 磁盘上的文件名，禁用的模组以 .disabled 结尾 */
  fileName: string
  enabled: boolean
  /** 模组名称，读取不到时为文件名 */
  name: string
  modId: string
  version: string
  description: string
  kind: ModKind
  /** 模组图标（PNG 的 data URL） */
  icon?: string
  /** 文件大小（字节） */
  size: number
}

/** 某个版本的模组列表 */
export interface ModList {
  versionId: string
  /** mods 文件夹路径 */
  dir: string
  /** 是否为该版本独立的 mods 文件夹（版本隔离） */
  isolated: boolean
  /** 原版 Minecraft 版本号 */
  minecraftVersion: string
  /** 版本的模组加载器 */
  loader?: ModLoader
  mods: ModInfo[]
}

/** Modrinth 搜索结果中的一个模组 */
export interface ModrinthProject {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl?: string
  downloads: number
  /** 当前版本的 mods 文件夹中是否已经有这个模组 */
  installed: boolean
}

export interface ModrinthSearchResult {
  hits: ModrinthProject[]
  total: number
  /** 搜索时使用的 Minecraft 版本与加载器 */
  minecraftVersion: string
  loader: string
}

/** 从 Modrinth 安装模组的结果 */
export interface ModrinthInstallResult {
  /** 实际下载的模组（含自动安装的前置模组） */
  installed: { projectId: string; title: string; fileName: string; dependency: boolean }[]
  /** 找不到适用版本的前置模组名称 */
  missingDependencies: string[]
}
