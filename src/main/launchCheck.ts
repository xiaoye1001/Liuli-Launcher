/**
 * 启动前检查：点启动前看看容易出错的情况，有问题时界面先提示，用户可以仍然启动。
 * - 内存：手动分配的内存比电脑的内存还多，或者比现在剩下的可用内存多很多（自动分配会自己避开，不检查）
 * - 模组：给别的加载器 / 别的游戏版本用的模组、缺少前置模组、必定冲突的模组、同一个模组装了多个
 * - 磁盘：游戏文件夹所在的磁盘快满了（存档、日志写不进去时游戏会崩溃或丢进度）
 * 检查本身出错时不提示（不能因为检查失败挡住启动）
 */
import { freemem, totalmem } from 'os'
import { statfs } from 'fs/promises'
import { getSettings } from './config'
import { getVersionConfig } from './versionConfig'
import { checkModIssues, modsContextOf } from './mods'
import { assertSafeId } from './versionManage'
import type { LaunchCheckIssue, ModIssue } from '../shared/types'

const MB = 1024 * 1024
/** 磁盘剩下不到这么多时提示 */
const DISK_LOW = 1024 * MB

const gb = (mb: number): string => `${(mb / 1024).toFixed(mb < 10240 ? 1 : 0)} GB`

/** 内存：只检查手动分配（版本单独设置的，或者全局关掉了自动分配） */
export function memoryIssue(maxMemory: number, total: number, free: number | null): LaunchCheckIssue | null {
  if (maxMemory > total * 0.85) {
    return {
      kind: 'memory',
      title: '分配的内存太多了',
      detail: `给游戏分配了 ${gb(maxMemory)}，电脑总共只有 ${gb(total)} 内存，系统和其他程序会不够用，游戏可能打不开或者很卡。建议调到 ${gb(Math.floor((total * 0.6) / 256) * 256)} 以下，或者打开自动分配`
    }
  }
  // macOS 的空闲内存不准（缓存也算占用），不检查
  if (free !== null && maxMemory > free + 1024) {
    return {
      kind: 'memory',
      title: '分配的内存比电脑现在剩下的多',
      detail: `给游戏分配了 ${gb(maxMemory)}，电脑现在只剩大约 ${gb(free)} 可用内存，可能会卡顿或崩溃。可以先关掉一些程序，或者调小内存、打开自动分配`
    }
  }
  return null
}

function modIssueText(issue: ModIssue): string | null {
  switch (issue.kind) {
    case 'incompatible':
      return `${issue.mod.name}：${issue.detail}`
    case 'missing':
      return `缺少前置模组 ${issue.dependency}（${issue.requiredBy.map((m) => m.name).join('、')} 需要）`
    case 'duplicate':
      return `${issue.mods[0]?.name ?? issue.modId} 装了 ${issue.mods.length} 个`
    case 'conflict':
      return issue.hard ? `${issue.mods.map((m) => m.name).join(' 和 ')} 互相冲突：${issue.reason}` : null
    default:
      return null
  }
}

/** 模组：只挑会让游戏打不开的问题，最多列 5 条 */
export function modsIssue(issues: ModIssue[]): LaunchCheckIssue | null {
  const lines = issues.map(modIssueText).filter((x): x is string => !!x)
  if (lines.length === 0) return null
  const shown = lines.slice(0, 5)
  return {
    kind: 'mods',
    title: `有 ${lines.length} 个模组问题，游戏可能打不开`,
    detail: shown.join('；') + (lines.length > shown.length ? `；还有 ${lines.length - shown.length} 个` : '')
  }
}

export function diskIssue(freeBytes: number): LaunchCheckIssue | null {
  if (freeBytes >= DISK_LOW) return null
  return {
    kind: 'disk',
    title: '磁盘快满了',
    detail: `游戏文件夹所在的磁盘只剩 ${Math.max(0, Math.round(freeBytes / MB))} MB，存档和日志写不进去时游戏可能崩溃或丢失进度。可以先清理一些文件（「更多 → 维护与排查 → 清理」）`
  }
}

export async function preLaunchCheck(versionId: string): Promise<LaunchCheckIssue[]> {
  assertSafeId(versionId)
  const settings = await getSettings()
  if (!settings.preLaunchCheck) return []
  const out: LaunchCheckIssue[] = []
  try {
    const config = await getVersionConfig(versionId, settings.gameDir)
    const manual = config.maxMemory || (settings.memoryAuto ? 0 : settings.maxMemory)
    if (manual > 0) {
      const issue = memoryIssue(
        manual,
        Math.floor(totalmem() / MB),
        process.platform === 'darwin' ? null : Math.floor(freemem() / MB)
      )
      if (issue) out.push(issue)
    }
  } catch {
    // 读不到版本设置时跳过
  }
  try {
    const { loader } = await modsContextOf(versionId)
    if (loader) {
      const issue = modsIssue(await checkModIssues(versionId))
      if (issue) out.push(issue)
    }
  } catch {
    // 读不到模组时跳过
  }
  try {
    const info = await statfs(settings.gameDir)
    const issue = diskIssue(info.bavail * info.bsize)
    if (issue) out.push(issue)
  } catch {
    // 读不到磁盘信息时跳过
  }
  return out
}
