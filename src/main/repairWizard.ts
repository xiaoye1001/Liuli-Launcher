import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getSettings } from './config'
import { assertGameStopped, modsContextOf, setModEnabled } from './mods'
import { applySafeVideoSettings, getGameOptionsInfo } from './optionsTools'
import { getVersionConfig, setVersionConfig } from './versionConfig'
import { restoredModTimes } from './versionSnapshots'
import type { RepairInfo, VersionConfig } from '../shared/types'

/**
 * 游戏打不开修复向导：检查游戏文件（界面直接调用修复版本）、Java 改为自动选择、清除自定义启动参数、
 * 暂时禁用最近添加的模组、画质改成流畅并关闭全屏
 */

/** 最近几天内添加或更新的模组算「最近添加」 */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000

/** 可能让游戏打不开的自定义启动设置 */
const ADVANCED_KEYS = ['jvmArgs', 'gameArgs', 'wrapperCommand', 'envVars', 'preLaunchCommand'] as const

/** 最近添加的已启用模组（新的在前）；复制过来的文件修改时间可能是旧的，所以同时看创建时间 */
async function recentMods(dir: string): Promise<{ recent: string[]; enabled: number }> {
  const found: { file: string; at: number }[] = []
  let enabled = 0
  // 恢复版本快照放回去的模组是复制出来的新文件，只看修改时间
  const restored = await restoredModTimes(dir)
  for (const file of await readdir(dir).catch(() => [] as string[])) {
    if (!file.toLowerCase().endsWith('.jar')) continue
    const info = await stat(join(dir, file)).catch(() => null)
    if (!info?.isFile()) continue
    enabled++
    const at =
      restored.get(file.replace(/\.disabled$/, '')) === info.mtimeMs
        ? info.mtimeMs
        : Math.max(info.mtimeMs, info.birthtimeMs || 0)
    if (Date.now() - at < RECENT_MS) found.push({ file, at })
  }
  return { recent: found.sort((a, b) => b.at - a.at).map((f) => f.file), enabled }
}

export async function getRepairInfo(versionId: string): Promise<RepairInfo> {
  const ctx = await modsContextOf(versionId)
  const { gameDir, javaAuto } = await getSettings()
  const [mods, config, options] = await Promise.all([
    recentMods(ctx.dir),
    getVersionConfig(versionId, gameDir),
    getGameOptionsInfo(versionId).catch(() => null)
  ])
  return {
    recentMods: mods.recent,
    // 全部模组都是最近装的（例如刚装好的整合包）：没法判断是哪个模组的问题
    allModsRecent: mods.enabled > 0 && mods.recent.length === mods.enabled,
    javaMode: config.javaMode,
    javaAuto,
    customArgs: ADVANCED_KEYS.filter((key) => config[key].trim() !== ''),
    hasOptions: options?.hasOptions ?? false,
    fullscreen: config.fullscreen
  }
}

/** 暂时禁用最近添加的模组（只禁用仍在「最近添加」列表里的），返回禁用了的和失败的 */
export async function disableRecentMods(
  versionId: string,
  files: string[]
): Promise<{ done: string[]; failed: string[] }> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  const { recent } = await recentMods(ctx.dir)
  const done: string[] = []
  const failed: string[] = []
  for (const file of Array.isArray(files) ? files : []) {
    if (typeof file !== 'string' || !recent.includes(file)) continue
    try {
      await setModEnabled(versionId, file, false)
      done.push(file)
    } catch {
      failed.push(file)
    }
  }
  return { done, failed }
}

/** Java 改为自动选择（只改这个版本） */
export async function useAutoJava(versionId: string): Promise<void> {
  await setVersionConfig(versionId, { javaMode: 'auto' }, { fromUser: true })
}

/** 清除这个版本的自定义启动参数、包装命令、环境变量和启动前命令 */
export async function clearCustomArgs(versionId: string): Promise<void> {
  const patch: Partial<VersionConfig> = {}
  for (const key of ADVANCED_KEYS) patch[key] = ''
  await setVersionConfig(versionId, patch, { fromUser: true })
}

/** 画质改成流畅、关闭游戏内全屏和启动器的「全屏启动」 */
export async function resetVideoForRepair(versionId: string): Promise<void> {
  const options = await getGameOptionsInfo(versionId)
  if (options.hasOptions) await applySafeVideoSettings(versionId)
  await setVersionConfig(versionId, { fullscreen: false }, { fromUser: true })
}
