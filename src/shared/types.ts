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
}

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

/** 安装状态 */
export type InstallState = 'running' | 'success' | 'failed' | 'cancelled'

/** 安装阶段：游戏本体（版本 json 与客户端 jar） → 依赖库与资源文件（并行下载） */
export type InstallPhase = 'version' | 'dependencies'

/** 安装进度，由主进程实时推送到界面 */
export interface InstallStatus {
  versionId: string
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

/** 本地已安装的版本 */
export interface InstalledVersion {
  id: string
  /** 版本类型（来自版本 json 的 type 字段，可能为空） */
  type: string
  releaseTime: string
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
