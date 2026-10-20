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
  /** 优化 Java 内存回收：用适合游戏的 G1 参数，减少内存占用并降低卡顿（自定义了回收器时不生效） */
  optimizeGc: boolean
  /** 启动前检查游戏文件，自动补全缺失或损坏的文件 */
  checkFiles: boolean
  /** 启动游戏时自动打开日志窗口（默认关闭，可以随时在主页点「日志」打开） */
  openLogOnLaunch: boolean
  /** 主页显示 Minecraft 新闻 */
  showNews: boolean
  /** 主页显示「最近游玩」 */
  showRecentPlays: boolean
  /** 主页的「最近游玩」收起（只显示标题） */
  recentPlaysCollapsed: boolean
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
  /** 添加过的游戏目录（包含当前目录），可以在它们之间切换 */
  gameDirs: GameDirEntry[]
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
  /** 自定义主题色（#rrggbb），accentColor 为 custom 时使用 */
  customAccent: string
  /** 面板不透明度（%），0~60 */
  panelOpacity: number
  /** 面板背景模糊（px），0~40 */
  panelBlur: number
  /** 当前（固定模式下）使用的背景图片（backgrounds 文件夹里的文件名），空字符串表示没有 */
  backgroundImage: string
  /** 背景库：添加过的所有背景图片（backgrounds 文件夹里的文件名） */
  backgroundImages: string[]
  /** 背景模式：不使用 / 固定一张 / 每次启动随机 / 定时轮播 */
  backgroundMode: BackgroundMode
  /** 轮播间隔（分钟） */
  backgroundInterval: number
  /** 背景填充方式 */
  backgroundFit: BackgroundFit
  /** 主题方案（决定底色与动态背景），classic 为原来的经典渐变 */
  themePreset: ThemePreset
  /** 背景粒子特效，auto 为跟随主题方案 */
  particleEffect: ParticleEffect
  /** 粒子数量 */
  particleDensity: ParticleDensity
  /** 粒子速度（%），50~200 */
  particleSpeed: number
  /** 鼠标互动：粒子躲开鼠标 */
  particleInteract: boolean
  /** 鼠标视差：背景随鼠标轻微反向移动 */
  parallax: boolean
  /** 我的主题（最多 20 个） */
  customThemes: CustomTheme[]
  /** 按时间自动切换主题 */
  autoTheme: AutoThemeSettings
  /** 背景模糊程度（像素，0~20） */
  backgroundBlur: number
  /** 背景遮罩浓度（百分比，0~80），让文字在明亮的图片上也看得清 */
  backgroundDim: number
  /** 是否开启界面动画 */
  animations: boolean
  /** 界面字体（字体名称），空字符串表示使用默认字体 */
  fontFamily: string
  /** 界面缩放（%），取值见 UI_SCALES */
  uiScale: number
  /** 是否播放背景音乐 */
  musicEnabled: boolean
  /** 背景音乐音量（0~100） */
  musicVolume: number
  /** 播放顺序 */
  musicOrder: MusicOrder
  /** 游戏运行时暂停背景音乐，游戏退出后继续 */
  musicPauseInGame: boolean
  /** 侧边栏显示的启动器名称（空字符串为默认「琉璃启动器」），同时作为窗口标题 */
  launcherTitle: string
  /** 侧边栏名称下面的小字（空字符串为默认「Liuli Launcher」） */
  launcherSubtitle: string
  /** 侧边栏隐藏的页面（取值见 HIDEABLE_PAGES） */
  hiddenPages: string[]
  /** 主页欢迎语标题，支持 {name} {greeting} {version} {tip}；空字符串为默认 */
  welcomeTitle: string
  /** 主页欢迎语副标题，同上 */
  welcomeSubtitle: string
  /** 游戏窗口出现后启动器的行为 */
  afterLaunch: AfterLaunch
  /** 启动时自动检查更新 */
  autoCheckUpdate: boolean
  /** 更新来源：自动（先官网后 GitHub）/ 只用官网 / 只用 GitHub */
  updateSource: UpdateSource
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
  /** 是否可以在启动器里直接下载并替换更新（开发版本或无法识别运行方式时为 false） */
  autoUpdate: boolean
  /** 这次的版本信息来自哪里 */
  source: 'official' | 'github'
}

/** 自动更新的下载状态 */
export interface UpdateDownload {
  state: 'idle' | 'downloading' | 'ready' | 'failed'
  /** 正在下载 / 已下载的版本号 */
  version: string
  progress: number
  total: number
  /** 字节/秒 */
  speed: number
  error?: string
}

/** 上次自动更新的结果（Windows） */
export interface UpdateResult {
  ok: boolean
  version: string
  error?: string
  /** 更新日志的位置 */
  logFile: string
}

/** 主题色 */
export type AccentColor =
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'teal'
  | 'indigo'
  | 'red'
  | 'lime'
  | 'slate'
  /** 自定义颜色（customAccent） */
  | 'custom'

/** 游戏启动后：保持不变 / 最小化 / 隐藏（游戏退出后都会恢复） */
export type AfterLaunch = 'keep' | 'minimize' | 'hide'

/** 版本隔离：关闭 / 只隔离装了模组加载器的版本 / 隔离所有版本 */
export type VersionIsolation = 'off' | 'modded' | 'all'

/** 界面主题：跟随系统 / 深色 / 浅色 */
export type ThemeMode = 'system' | 'dark' | 'light'

/** 皮肤模型 */
export type SkinModel = 'default' | 'slim'

/** 系统信息 */
export type UpdateSource = 'auto' | 'official' | 'github'

/** 主题方案 */
export type ThemePreset = 'classic' | 'aurora' | 'sky' | 'cherry' | 'end' | 'acrylic' | 'nether'
export const THEME_PRESETS: ThemePreset[] = ['classic', 'aurora', 'sky', 'cherry', 'end', 'acrylic', 'nether']

export type ParticleDensity = 'low' | 'normal' | 'high'

/** 一套主题的全部外观参数（我的主题、导入导出、自动切换都使用它） */
export interface ThemeData {
  themePreset: ThemePreset
  theme: ThemeMode
  accentColor: AccentColor
  customAccent: string
  panelOpacity: number
  panelBlur: number
  particleEffect: ParticleEffect
  particleDensity: ParticleDensity
  particleSpeed: number
  particleInteract: boolean
  parallax: boolean
  backgroundMode: BackgroundMode
  /** 壁纸（背景库里的文件名），空字符串表示没有 */
  backgroundImage: string
  backgroundFit: BackgroundFit
  backgroundBlur: number
  backgroundDim: number
}

export interface CustomTheme {
  id: string
  name: string
  createdAt: number
  data: ThemeData
}

/** 自动切换的目标：preset:<主题方案> 或 custom:<我的主题 ID> */
export type ThemeTarget = string

export interface AutoThemeSettings {
  enabled: boolean
  day: ThemeTarget
  night: ThemeTarget
  /** 白天开始时间，HH:MM */
  dayStart: string
  /** 夜晚开始时间，HH:MM */
  nightStart: string
}

/** 背景粒子特效 */
export type ParticleEffect = 'auto' | 'none' | 'sakura' | 'ender' | 'fireflies' | 'rain' | 'embers'
export const PARTICLE_EFFECTS: ParticleEffect[] = ['auto', 'none', 'sakura', 'ender', 'fireflies', 'rain', 'embers']

/** 可以在侧边栏隐藏的页面（主页和设置始终显示） */
export const HIDEABLE_PAGES = ['account', 'versions', 'servers', 'download', 'multiplayer', 'more']

/** 可选的界面缩放比例（%） */
export const UI_SCALES = [80, 90, 100, 110, 125, 150]

/** 背景音乐播放顺序：列表循环 / 随机播放 / 单曲循环 */
export type MusicOrder = 'sequential' | 'shuffle' | 'single'

export type BackgroundMode = 'off' | 'fixed' | 'random' | 'slideshow'
/** 填充（裁剪铺满）/ 适应（完整显示）/ 拉伸 / 居中 / 平铺 */
export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile'

export interface SystemInfo {
  /** 官网地址（构建时配置），没有配置时为空字符串 */
  officialSite: string
  /** 物理内存总量（MB） */
  totalMemory: number
  /** 免安装版的数据文件夹（exe 旁边），安装版为 null */
  portableDir: string | null
  /** Windows 上是否以管理员身份运行（此时无法从资源管理器拖入文件） */
  elevated: boolean
  /** 登录凭证能否用系统安全存储加密保存（Linux 没有密钥环时为 false） */
  tokenEncryption: boolean
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
export type InstallPhase =
  | 'version'
  | 'assets'
  | 'libraries'
  | 'loader'
  | 'dependencies'
  | 'processing'
  | 'java'
  | 'modpack'
  | 'unpack'

/** 安装过程中的一个步骤（同一类下载任务合在一起） */
export interface InstallStep {
  phase: InstallPhase
  progress: number
  total: number
  done: boolean
}

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
  /** 补充说明，例如「还剩 2 个文件：xxx.jar」 */
  detail?: string
  /** 各个步骤的进度（与 PCL 类似，按开始的先后排列） */
  steps?: InstallStep[]
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
  /** 是否收藏（收藏的版本排在前面） */
  favorite: boolean
  /** 图标：内置图标名，或 custom 表示自定义图片；没有时用默认图标 */
  icon?: string
  /** 自定义图标（PNG 的 data URL） */
  iconUrl?: string
}

/** 版本的收藏与图标 */
export interface VersionDisplay {
  favorite: boolean
  icon?: string
  iconUrl?: string
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
/** 保存的一个游戏目录 */
export interface GameDirEntry {
  path: string
  /** 显示的名字 */
  name: string
  /** 切换走时该目录选中的版本，切换回来时恢复 */
  selectedVersion?: string
}

/** 游戏目录列表中的一项（含统计信息） */
export interface GameDirSummary {
  path: string
  name: string
  current: boolean
  exists: boolean
  versionCount: number
  isDefault: boolean
  isOfficial: boolean
}

export interface GameDirInfo {
  /** 添加过的所有游戏目录，当前目录在其中 */
  dirs: GameDirSummary[]
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
  /** 模组之间的问题（缺少前置、重复模组） */
  issues: ModIssue[]
}

/** 模组之间的问题 */
export type ModIssue =
  | {
      /** 缺少前置模组 */
      kind: 'missing'
      /** 缺少的模组 ID */
      dependency: string
      /** 也可以用这些模组代替 */
      alternatives: string[]
      /** 需要它的模组 */
      requiredBy: { fileName: string; name: string; range: string }[]
      /** 已经装了但被禁用了 */
      disabled?: { fileName: string; name: string }
    }
  | {
      /** 同一个模组装了多个 */
      kind: 'duplicate'
      modId: string
      mods: { fileName: string; name: string; version: string }[]
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

export type WorldDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard'

/** 存档详情（读取自 level.dat） */
export interface WorldDetails {
  folder: string
  /** 世界种子（十进制字符串，64 位整数不能用普通数字表示） */
  seed?: string
  difficulty?: WorldDifficulty
  difficultyLocked: boolean
  /** 世界类型：normal / flat / large_biomes / amplified / single_biome / debug，或其他生成器的 ID */
  worldType?: string
  /** 游戏内第几天 */
  day?: number
  /** 游戏内时刻（例如 06:30） */
  timeOfDay?: string
  weather: 'clear' | 'rain' | 'thunder'
  spawn?: { x: number; y: number; z: number }
  /** 单人游戏的玩家信息 */
  player?: { x: number; y: number; z: number; dimension: string; health?: number; food?: number; level?: number }
  /** 游戏规则（按 level.dat 中的顺序） */
  gameRules: { key: string; value: string }[]
  /** 存档文件夹占用的空间（字节） */
  size: number
  /** 启用的数据包数量 */
  datapacks: number
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
  /** 建议值超过了本机能给的上限（给系统留出内存后） */
  capped: boolean
  /** 本机最多能分配的内存（MB），给系统和其他程序留出内存后 */
  upper: number
  /** 建议值的组成：基础、模组、光影、材质包、渲染距离等 */
  factors: MemoryFactor[]
}

/** 自动分配内存时考虑的一项 */
export interface MemoryFactor {
  label: string
  /** 这一项需要的内存（MB） */
  mb: number
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
  /** 资源来源，默认 Modrinth */
  source?: ResourceSource
}

export type ResourceSource = 'modrinth' | 'curseforge'

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

/** 上传到 mclo.gs 的日志 */
export interface SharedLog {
  /** 日志的名字，例如「游戏日志」「崩溃报告」 */
  label: string
  /** 公开链接（https://mclo.gs/xxxx） */
  url: string
}

// ---------- 高速多线程下载（FastDownloadEngine） ----------

/** 下载任务的来源：模组 / 整合包 / 资源包等 / 百宝箱直链 / 新引擎失败后改用原下载方式 */
export type FastDownloadSource = 'mod' | 'modpack' | 'resource' | 'toolbox' | 'fallback' | 'multiplayer'

export type FastDownloadStatus =
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled'
  /** 高速引擎失败，正在用原来的下载方式重新下载 */
  | 'fallback_retrying'

/** 推送给界面的下载任务状态（主进程每 250 毫秒推送一次所有任务） */
export interface FastDownloadTask {
  taskId: string
  fileName: string
  source: FastDownloadSource
  /** 回退到原下载方式前的来源（source 为 fallback 时有值） */
  originalSource?: FastDownloadSource
  /** 保存位置（完整路径） */
  destination: string
  url: string
  /** 总大小（字节），0 表示服务器没有告知 */
  totalBytes: number
  downloadedBytes: number
  /** 总进度（0~100） */
  progress: number
  /** 实时网速（字节 / 秒） */
  speed: number
  /** 实时网速文字，例如「3.2 MB/s」「512 KB/s」 */
  speedText: string
  /** 剩余时间（秒），无法估计时为 null */
  eta: number | null
  /** 剩余时间文字，例如「1 分 20 秒」 */
  etaText: string
  /** 每个线程分块的进度（0~100），单线程下载时只有一项 */
  chunks: number[]
  /** 是否按分块多线程下载 */
  chunked: boolean
  status: FastDownloadStatus
  error?: string
  /** 回退原因（高速引擎失败的原因） */
  fallbackReason?: string
  createdAt: number
  finishedAt?: number
}

/** 百宝箱新建直链下载的选项 */
export interface DirectDownloadOptions {
  /** 保存到的文件夹，不填时使用系统的「下载」文件夹 */
  directory?: string
  /** 线程数（1~32），不填时为 8 */
  threads?: number
  /** 保存的文件名，不填时用服务器提供的文件名或地址中的文件名；同名文件不会被覆盖，会自动改名 */
  fileName?: string
}

// ---------- 百宝箱：清理游戏垃圾缓存 ----------

/** 可以清理的内容 */
export type CleanCategory = 'logs' | 'crash' | 'partial' | 'cache' | 'assets'

export interface CleanItem {
  category: CleanCategory
  /** 文件数量 */
  count: number
  /** 合计大小（字节） */
  bytes: number
}

export interface CleanScan {
  /** 扫描的游戏目录 */
  gameDir: string
  items: CleanItem[]
  /** 无法判断哪些资源文件没用到时（例如有版本的 json 损坏）为 false，不提供「未使用的资源文件」 */
  assetsReliable: boolean
}

export interface CleanResult {
  /** 删除的文件数 */
  count: number
  /** 释放的空间（字节） */
  bytes: number
  /** 删除失败（例如被占用）的文件数 */
  failed: number
}

// ---------- 百宝箱：Java 环境深度检测 ----------

export type JavaIssueLevel = 'error' | 'warning' | 'info'

export interface JavaIssue {
  level: JavaIssueLevel
  message: string
}

export interface JavaDetail {
  path: string
  version: string
  majorVersion: number
  /** 发行方，例如 Eclipse Adoptium、Microsoft、Azul Systems */
  vendor: string
  /** 虚拟机名称，例如 OpenJDK 64-Bit Server VM */
  vmName: string
  /** 32 或 64 */
  bits: number
  /** CPU 架构，例如 amd64、aarch64、x86 */
  arch: string
  /** 适合运行的游戏版本说明 */
  suitable: string
  /** 启动器下载的 Java */
  managed: boolean
  /** 当前设置里选择的 Java */
  selected: boolean
  issues: JavaIssue[]
}

export interface JavaVersionNeed {
  versionId: string
  /** 需要的 Java 主版本 */
  required: number
  /** 本机有合适的 Java */
  satisfied: boolean
}

export interface JavaCheckReport {
  /** 系统信息，例如 Windows 11 x64 */
  system: string
  /** 自动选择 Java 是否开启 */
  javaAuto: boolean
  javas: JavaDetail[]
  /** 已安装版本对 Java 的需求 */
  versions: JavaVersionNeed[]
  /** 整体的问题与建议 */
  issues: JavaIssue[]
}

// ---------- 百宝箱：下载源测速 ----------

export interface SpeedTestResult {
  /** 'mojang' 官方源，'bmclapi' 国内镜像（与下载源设置对应） */
  source: DownloadSource
  /** 测试项：游戏文件 / 模组 */
  target: 'game' | 'mods'
  host: string
  /** 连接延迟（毫秒），失败时为 null */
  latency: number | null
  /** 下载速度（字节/秒），失败时为 null */
  speed: number | null
  error?: string
}

export interface SpeedTestReport {
  results: SpeedTestResult[]
  /** 推荐使用的下载源；都失败时为 null */
  recommended: DownloadSource | null
  /** 当前设置的下载源 */
  current: DownloadSource
}

// ---------- 多人联机 ----------

/** 联机方式：极速直连 / P2P 虚拟组网（EasyTier）/ 内网穿透地址 */
export type MultiplayerMode = 'direct' | 'p2p' | 'tunnel'

/** 本机在游戏里「对局域网开放」的世界（监听 224.0.2.60:4445 得到） */
export interface LanGame {
  /** 世界名（MOTD） */
  motd: string
  port: number
  /** 最后一次收到广播的时间 */
  seenAt: number
}

/** 本机可用于直连的地址 */
export interface LocalAddresses {
  /** 公网 IPv6（不含 fe80 链路本地、ULA 等） */
  ipv6: string[]
  /** 网卡上直接配置的公网 IPv4（大多数家庭网络没有） */
  ipv4Public: string[]
  /** 局域网 IPv4 */
  ipv4Lan: string[]
}

/** P2P 联机内核（EasyTier）的状态 */
export interface P2PCoreStatus {
  /** 本机系统是否有可用的内核版本 */
  supported: boolean
  installed: boolean
  version: string
  /** 正在下载 */
  downloading: boolean
  /** 下载失败的原因 */
  error?: string
}

export interface MultiplayerStatus {
  role: 'idle' | 'host' | 'guest'
  mode: MultiplayerMode | null
  state: 'idle' | 'starting' | 'running' | 'error'
  /** 给玩家看的状态说明 */
  message: string
  /** 房主：生成的房间码；房客：加入的房间码 */
  code: string
  /** 房主选择 P2P 但本机没有内核时改用了直连房间码 */
  fallback: boolean
  /** 本机「对局域网开放」的世界 */
  lanGame: LanGame | null
  /** 房客：游戏里连接的本地端口（同时会出现在多人游戏列表底部） */
  localPort: number | null
  /** 房客：实际连接的远端地址（直连 / 穿透模式） */
  target: string | null
  /** 与房主之间的延迟（毫秒） */
  latency: number | null
  /** 已转发的流量（字节）：上行为本机发出，下行为本机收到 */
  bytesUp: number
  bytesDown: number
  /** 当前通过联机通道的连接数 */
  connections: number
  /** P2P 模式下需要先下载内核 */
  needsP2PCore: boolean
  /** 房主：本机游戏的局域网端口（内网穿透房间没有检测到时为 null） */
  gamePort: number | null
  /** 房主：本机游戏世界还在不在（定时查询）；null 为还没查询或无法查询 */
  worldOnline: boolean | null
  /** 房主：游戏世界里的在线玩家（包括房主自己） */
  players: { online: number; max: number; names: string[] } | null
  /** P2P：使用的中继服务器（房主降级为直连时为原本要用的中继） */
  relay: string | null
  error?: string
}

/** 可以一键安装的联机模组 */
export type MultiplayerMod = 'e4mc' | 'world-host'
