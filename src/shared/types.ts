/** 一个可用的 Java 运行环境 */
/** 启动器可以下载的 Java 运行环境（来自 Mojang 官方的 Java 运行时） */
export interface JavaRuntimeInfo {
  /** 组件名，例如 java-runtime-delta */
  component: string
  /** 主版本号，例如 21 */
  majorVersion: number
  /** 完整版本号，例如 21.0.7 */
  version: string
  /** 是否已经下载 */
  installed: boolean
}

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

/** 离线账号（可以保存多个，各自有玩家名和皮肤） */
export interface OfflineAccount {
  id: string
  name: string
  /** 皮肤（PNG 的 data URL），空字符串使用默认皮肤 */
  skin: string
  skinModel: SkinModel
}

/** Minecraft 官方新闻 */
export interface NewsItem {
  id: string
  title: string
  /** 分类标签，例如 Minecraft: Java Edition */
  tag: string
  /** 日期，例如 2025-06-17 */
  date: string
  text: string
  /** 配图（https 地址），可能为空 */
  image: string
  /** 「阅读全文」链接（https），可能为空 */
  link: string
}

export interface NewsList {
  items: NewsItem[]
  fetchedAt: number
  /** 网络失败，显示的是上次保存的新闻 */
  offline: boolean
}

export type ProxyMode = 'none' | 'system' | 'custom'

/** 网络连通性测试结果 */
export interface NetworkCheck {
  /** 正在使用的代理（隐藏密码），null 为直连 */
  proxy: string | null
  results: { name: string; ok: boolean; ms: number; status?: number; error?: string }[]
}

/** 启动器设置，保存在 userData/settings.json */
export interface AppSettings {
  /** 选中的 java 可执行文件路径，空字符串表示未选择 */
  javaPath: string
  /** 自动选择 Java：按游戏版本的要求挑选合适的 Java，没有时自动下载 */
  javaAuto: boolean
  /** 游戏最大内存（MB），手动分配时使用 */
  maxMemory: number
  /** 自动分配内存：按可用内存和模组数量决定 */
  memoryAuto: boolean
  /** 启动前检查游戏文件，自动补全缺失或损坏的文件 */
  checkFiles: boolean
  /** 主页显示 Minecraft 新闻 */
  showNews: boolean
  /** 下载源 */
  downloadSource: DownloadSource
  /** 每个服务器同时下载的文件数（1~64） */
  downloadThreads: number
  /** 代理：不使用 / 系统代理 / 手动设置 */
  proxyMode: ProxyMode
  /** 手动设置的 HTTP 代理地址，例如 http://127.0.0.1:7890 */
  proxyUrl: string
  /** 游戏目录（.minecraft） */
  gameDir: string
  /** 当前离线账号的玩家名（与 offlineAccounts 中 activeOffline 对应的账号同步） */
  offlineName: string
  /** 所有离线账号 */
  offlineAccounts: OfflineAccount[]
  /** 当前使用的离线账号 id */
  activeOffline: string
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
  /** 当前使用的账号：'offline' 为离线账号，否则为微软账号的 UUID */
  activeAccount: string
  /** 主题色 */
  accentColor: AccentColor
  /** 自定义背景图片（用户数据目录 backgrounds 下的文件名），空字符串表示使用默认渐变背景 */
  backgroundImage: string
  /** 背景模糊程度（像素，0~20） */
  backgroundBlur: number
  /** 背景遮罩浓度（百分比，0~80），让文字在明亮的图片上也看得清 */
  backgroundDim: number
  /** 是否开启界面动画 */
  animations: boolean
  /** 游戏窗口出现后启动器的行为 */
  afterLaunch: AfterLaunch
  /** 启动时自动检查更新 */
  autoCheckUpdate: boolean
  /** 用户选择忽略的新版本（不再自动提示） */
  skippedVersion: string
}

/** 检查更新的结果 */
export interface UpdateInfo {
  /** 当前版本 */
  current: string
  /** 最新版本（不带 v） */
  latest: string
  /** 是否有比当前更新的版本 */
  hasUpdate: boolean
  /** 发布名称 */
  name: string
  /** 更新说明（Markdown 原文） */
  notes: string
  publishedAt: string
  /** 适合本机的安装包文件名，没有时为空 */
  assetName: string
  assetSize: number
}

/** 主题色 */
export type AccentColor = 'emerald' | 'sky' | 'violet' | 'rose' | 'amber'

/** 游戏启动后：保持不变 / 最小化 / 隐藏（游戏退出后都会恢复） */
export type AfterLaunch = 'keep' | 'minimize' | 'hide'

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
  /** 免安装版的数据文件夹（exe 旁边），安装版为 null */
  portableDir: string | null
  /** Windows 上是否以管理员身份运行（此时无法从资源管理器拖入文件） */
  elevated: boolean
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
export type InstallKind = 'install' | 'repair' | 'java'

/** 安装状态 */
export type InstallState = 'running' | 'success' | 'failed' | 'cancelled'

/** 安装阶段：游戏本体（版本 json 与客户端 jar） → 依赖库与资源文件（并行下载） → 运行模组加载器安装程序 */
export type InstallPhase = 'version' | 'dependencies' | 'processing' | 'java' | 'modpack' | 'unpack'

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
  /** 原版 Minecraft 版本号 */
  minecraftVersion: string
  /** 是否有自己的版本设置（与全局设置不同） */
  customized: boolean
}

/** 单个版本的设置，保存在 versions/<版本名>/liuli-version.json，未设置的项跟随全局设置 */
export interface VersionConfig {
  /** 最大内存（MB），0 表示跟随全局设置 */
  maxMemory: number
  /** Java：跟随全局设置 / 自动选择 / 使用 javaPath 指定的 Java */
  javaMode: 'global' | 'auto' | 'custom'
  javaPath: string
  /** 版本隔离：跟随全局设置 / 开启 / 关闭 */
  isolation: 'global' | 'on' | 'off'
  /** 游戏窗口大小，0 表示游戏默认大小 */
  windowWidth: number
  windowHeight: number
  /** 全屏启动 */
  fullscreen: boolean
  /** 附加的 JVM 参数（空格分隔，可以用引号包住带空格的参数） */
  jvmArgs: string
  /** 附加的游戏参数 */
  gameArgs: string
  /** 包装命令，例如 gamemoderun、prime-run：游戏通过这个命令启动 */
  wrapperCommand: string
  /** 附加的环境变量，每行一个「名称=值」 */
  envVars: string
  /** 启动前执行的命令（通过系统命令行执行，失败时取消启动） */
  preLaunchCommand: string
  /** 游戏退出后执行的命令 */
  postExitCommand: string
}

/** 游戏运行状态：空闲 / 启动中 / 窗口已出现 / 正常退出 / 崩溃或启动失败 */
export type GameState = 'idle' | 'launching' | 'running' | 'exited' | 'crashed'

export interface GameStatus {
  state: GameState
  versionId: string
  /** 游戏进程开始的时间（毫秒时间戳），用于显示本次游玩时长 */
  startedAt?: number
  /** 进程退出码 */
  exitCode?: number | null
  /** 启动失败或崩溃的原因 */
  error?: string
  /** 崩溃分析结果（游戏进程异常退出时） */
  analysis?: CrashAnalysis
}

/** 崩溃原因对应的界面操作：打开版本设置 / 到「版本」页（修复、管理模组） */
export type CrashAction = 'versionSettings' | 'versions'

export interface CrashCause {
  title: string
  detail: string
  /** 相关的模组（缺少的前置、冲突或出错的模组） */
  mods?: string[]
  suggestions: string[]
  action?: CrashAction
}

export interface CrashAnalysis {
  /** 识别出的原因，按可能性排列；为空表示没能识别 */
  causes: CrashCause[]
  /** 没识别出原因时，从日志中找到的关键错误 */
  keyError?: string
  exitCode: number | null
  hasCrashReport: boolean
  hasNativeLog: boolean
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
  /** 要附加的 Quilt 加载器版本，不安装时为空 */
  quiltLoader?: string
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

/** 可以更新的模组 */
export interface ModUpdate {
  /** 磁盘上的文件名 */
  fileName: string
  projectId: string
  /** Modrinth 上的模组名称 */
  title: string
  currentVersion: string
  newVersion: string
  /** 新版本的 Modrinth 版本 ID */
  newVersionId: string
  newFileName: string
  /** 新版本是否为测试版 */
  prerelease: boolean
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

/** 版本游戏目录里的本地资源：资源包或光影包 */
export type LocalResourceKind = 'resourcepack' | 'shader'

export interface LocalResource {
  /** 文件名（.zip）或文件夹名 */
  fileName: string
  isDirectory: boolean
  /** 文件大小（字节），文件夹为 0 */
  size: number
  /** 资源包的简介（来自 pack.mcmeta） */
  description: string
  /** 资源包格式版本 */
  packFormat?: number
  /** 资源包图标（pack.png 的 data URL） */
  icon?: string
  /** 资源包：是否在游戏中启用（options.txt）；光影包：是否为当前使用的光影 */
  enabled: boolean
}

export interface LocalResourceList {
  versionId: string
  kind: LocalResourceKind
  /** resourcepacks / shaderpacks 文件夹路径 */
  dir: string
  items: LocalResource[]
  /** 光影：检测到的光影加载器配置（没有找到时为空） */
  shaderLoader?: 'iris' | 'oculus' | 'optifine'
  /** 光影：光影是否开启 */
  shadersEnabled?: boolean
}

/** 存档的游戏模式 */
export type WorldGameMode = 'survival' | 'creative' | 'adventure' | 'spectator' | 'unknown'

export interface WorldInfo {
  /** 存档文件夹名 */
  folder: string
  /** 存档名称（level.dat 中的 LevelName，读取失败时为文件夹名） */
  name: string
  gameMode: WorldGameMode
  hardcore: boolean
  /** 是否允许作弊 */
  cheats: boolean
  /** 最后一次游玩该存档的游戏版本 */
  version: string
  /** 最后游玩时间（毫秒时间戳），未知时为 0 */
  lastPlayed: number
  /** 存档图标（icon.png 的 data URL） */
  icon?: string
  /** level.dat 读取失败 */
  damaged: boolean
}

/** 存档备份（游戏目录 backups 文件夹里的 zip） */
export interface WorldBackup {
  file: string
  /** 备份的存档文件夹名 */
  world: string
  /** 备份时间（毫秒时间戳） */
  createdAt: number
  size: number
  /** 原存档是否还在 */
  worldExists: boolean
}

export interface WorldList {
  versionId: string
  /** saves 文件夹 */
  dir: string
  worlds: WorldInfo[]
}

/** 存档中的数据包 */
export interface WorldDatapack {
  fileName: string
  isDirectory: boolean
  size: number
  description: string
  /** 在存档中的状态：已启用 / 已停用 / 尚未加载（下次进入存档时自动启用） */
  state: 'enabled' | 'disabled' | 'new'
}

/** 服务器简介（MOTD）的一段带样式的文字 */
export interface MotdSegment {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
}

/** 收藏的服务器 */
export interface SavedServer {
  id: string
  name: string
  /** 服务器地址：host、host:port 或 [IPv6]:port */
  address: string
  /** 加入时使用的游戏版本，空字符串表示使用主页选择的版本 */
  versionId: string
}

/** 服务器状态查询结果 */
export interface ServerStatus {
  online: boolean
  /** 连接失败的原因 */
  error?: string
  /** 延迟（毫秒） */
  latency?: number
  /** 服务器版本名称，例如 Paper 1.20.4 */
  version: string
  protocol?: number
  players: { online: number; max: number; sample: string[] }
  motd: MotdSegment[]
  /** 服务器图标（PNG 的 data URL） */
  favicon?: string
}

/** 游戏截图 */
export interface Screenshot {
  fileName: string
  size: number
  /** 修改时间（毫秒时间戳） */
  time: number
}

export interface ScreenshotList {
  versionId: string
  /** screenshots 文件夹 */
  dir: string
  items: Screenshot[]
}

/** 某个版本的游玩统计 */
export interface VersionPlayStats {
  /** 累计游玩时长（毫秒） */
  totalMs: number
  /** 启动次数 */
  launches: number
  /** 最后游玩时间（毫秒时间戳） */
  lastPlayed: number
}

/** 一次游玩记录 */
export interface PlaySession {
  versionId: string
  start: number
  durationMs: number
  /** 是否异常退出 */
  crashed: boolean
}

export interface PlayStats {
  versions: Record<string, VersionPlayStats>
  /** 最近的游玩记录（最新的在前） */
  sessions: PlaySession[]
}

/** 导出整合包的格式 */
export type ModpackExportFormat = 'modrinth' | 'curseforge' | 'multimc' | 'mcbbs'

/** 可以放进整合包的内容（游戏目录第一层的文件或文件夹） */
export interface ExportableEntry {
  name: string
  isDirectory: boolean
  /** 总大小（字节） */
  size: number
  /** 文件数量 */
  files: number
  /** 默认是否勾选 */
  recommended: boolean
}

export interface ModpackExportInfo {
  versionId: string
  minecraftVersion: string
  loader: 'fabric' | 'forge' | 'neoforge' | 'quilt' | null
  loaderVersion: string
  entries: ExportableEntry[]
}

export interface ModpackExportOptions {
  versionId: string
  format: ModpackExportFormat
  name: string
  version: string
  author: string
  description: string
  /** 要放进整合包的内容（ExportableEntry.name） */
  include: string[]
  /** Modrinth 格式：Modrinth 上能找到的模组等文件只写下载地址，不打包文件本身 */
  useModrinthLinks: boolean
}

export interface ModpackExportResult {
  path: string
  /** 打包进去的文件数 */
  files: number
  /** 只写了下载地址的文件数 */
  linked: number
  size: number
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

/** 已登录的微软账号（不含令牌） */
export interface MicrosoftAccount {
  /** Minecraft 档案 UUID（无连字符） */
  uuid: string
  /** 游戏内玩家名 */
  name: string
  /** 正版皮肤（PNG 的 data URL），没有自定义皮肤时为空 */
  skin: string
  skinModel: SkinModel
}

/** 自动分配内存的结果（单位 MB） */
export interface MemoryPlan {
  /** 本次分配的最大内存 */
  memory: number
  /** 按版本和模组数量算出的建议值 */
  recommended: number
  total: number
  /** 当前可用内存；macOS 上无法准确获取，为 null */
  free: number | null
  /** 启用的模组数量 */
  mods: number
  /** 是否因为可用内存不足而少分配了 */
  limited: boolean
}

/** 正版账号拥有的披风 */
export interface MsCape {
  id: string
  /** 披风名称，例如 Migrator、Vanilla */
  alias: string
  active: boolean
  /** 披风贴图（PNG 的 data URL） */
  image: string
}

/** 正版账号的皮肤与披风 */
export interface MsSkinProfile {
  uuid: string
  name: string
  skin: string
  skinModel: SkinModel
  capes: MsCape[]
}

/** 外置登录账号（authlib-injector，例如 LittleSkin 皮肤站） */
export interface ExternalAccount {
  /** 账号标识：ygg:<角色 UUID>@<验证服务器地址> */
  id: string
  uuid: string
  /** 角色名 */
  name: string
  skin: string
  skinModel: SkinModel
  /** 验证服务器名称，例如 LittleSkin */
  serverName: string
  /** 验证服务器 API 地址 */
  serverUrl: string
  /** 登录用的邮箱或用户名（只用于显示） */
  username: string
}

/** 外置登录的结果：直接成功，或需要从多个角色中选择一个 */
export type ExternalLoginResult =
  | { account: ExternalAccount }
  | { pendingId: string; profiles: { id: string; name: string }[] }

export interface AccountsInfo {
  /** 当前使用的账号：'offline'、微软账号的 UUID 或外置账号的 id */
  active: string
  accounts: MicrosoftAccount[]
  /** 外置登录账号 */
  external: ExternalAccount[]
  /** 当前构建是否开启了微软登录（构建时配置了 Client ID） */
  loginAvailable: boolean
}

/** 微软登录进度 */
export type MsLoginState = 'idle' | 'waiting' | 'authorizing' | 'success' | 'failed' | 'cancelled'

export interface MsLoginStatus {
  state: MsLoginState
  /** 需要在网页中输入的代码 */
  userCode?: string
  /** 输入代码的网页 */
  verificationUri?: string
  /** 代码过期时间（毫秒时间戳） */
  expiresAt?: number
  error?: string
  /** 登录成功的账号 */
  account?: MicrosoftAccount
}

/** 整合包信息（从 .mrpack 中读取） */
/** 整合包格式 */
export type ModpackFormat = 'modrinth' | 'curseforge' | 'multimc' | 'mcbbs'

export interface ModpackInfo {
  format: ModpackFormat
  /** 文件名 */
  fileName: string
  name: string
  /** 整合包自身的版本号 */
  version: string
  summary: string
  minecraftVersion: string
  /** 模组加载器，原版整合包为 null */
  loader: 'fabric' | 'forge' | 'neoforge' | 'quilt' | null
  loaderVersion: string
  /** 需要下载的文件数（已排除客户端不支持的文件） */
  fileCount: number
  /** 下载文件的总大小（字节），CurseForge 整合包在安装时才知道，为 0 */
  totalSize: number
  /** overrides 中的文件数（配置文件等，不含游戏资源文件） */
  overrideCount: number
  /** 列在整合包清单里、但压缩包里已经有了而不用下载的文件数 */
  skippedDownloads?: number
  /** 整合包里已经带着的模组（mods 文件夹中的 .jar）数量 */
  includedMods?: number
  /** 整合包里带着的游戏资源文件（assets、libraries）数量，安装时直接使用、不再下载 */
  includedGameFiles?: number
}

/** 下载页的社区资源类型（与 Modrinth 的项目类型一致） */
export type ResourceType = 'mod' | 'modpack' | 'datapack' | 'resourcepack' | 'shader'

/** 社区资源搜索的筛选条件 */
export interface ResourceSearchFilters {
  /** Minecraft 版本，例如 1.20.1 */
  gameVersion?: string
  /** 加载器：模组与整合包为 fabric / forge / neoforge / quilt，光影为 iris / optifine 等 */
  loader?: string
  /** Modrinth 分类，例如 optimization */
  category?: string
  /** 排序：relevance / downloads / follows / newest / updated，不填时有关键字按相关度、否则按下载量 */
  sort?: string
}

/** Modrinth 上的项目（搜索结果） */
export interface ModrinthProjectHit {
  projectId: string
  title: string
  description: string
  author: string
  iconUrl?: string
  downloads: number
  /** 支持的模组加载器，例如 fabric、forge */
  loaders: string[]
  /** 支持的最新 Minecraft 版本 */
  latestGameVersion: string
}

/** 项目的一个版本 */
export interface ModrinthProjectVersion {
  id: string
  name: string
  versionNumber: string
  versionType: 'release' | 'beta' | 'alpha'
  gameVersions: string[]
  loaders: string[]
  datePublished: string
  /** 主文件名 */
  fileName: string
  /** 主文件大小（字节） */
  fileSize: number
}

/** 社区资源安装到哪里：某个已安装的版本（数据包还需要选择存档） */
export interface ResourceTarget {
  versionId: string
  /** 数据包安装到的存档文件夹名 */
  world?: string
}
