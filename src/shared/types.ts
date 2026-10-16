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
}

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
