import { join } from 'path'
import type { ModLoader, VersionIsolation } from '../shared/types'

/** 可以加载模组的加载器（OptiFine 本身不加载模组，不算在内） */
const MOD_LOADERS: ModLoader[] = ['fabric', 'quilt', 'forge', 'neoforge']

/** 按设置判断某个版本是否使用独立的游戏目录 */
export function isIsolated(mode: VersionIsolation, loader: ModLoader | undefined): boolean {
  if (mode === 'all') return true
  if (mode === 'modded') return !!loader && MOD_LOADERS.includes(loader)
  return false
}

/**
 * 版本实际使用的游戏目录（存放 mods、saves、config 等）。
 * 隔离时为 versions/<版本名>，否则为游戏目录本身；依赖库与资源文件始终放在游戏目录下共用。
 */
export function versionGameDir(gameDir: string, versionId: string, isolated: boolean): string {
  return isolated ? join(gameDir, 'versions', versionId) : gameDir
}
