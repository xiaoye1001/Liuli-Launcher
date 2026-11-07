/**
 * 模组同步码：把一个版本启用的模组（Modrinth 上有的）做成一串码，发给朋友，
 * 朋友粘贴后一键装上完全相同版本的模组，开模组服、一起玩时不用再一个个对。
 * 码的格式：LIULI-MODS-1. + base64url(deflate(JSON { mc, loader, v: [Modrinth 版本 ID] }))
 * 只包含公开的 Modrinth 版本 ID，没有文件路径和个人信息
 */
import { deflateRawSync, inflateRawSync } from 'zlib'
import { assertGameStopped, modsContextOf } from './mods'
import {
  downloadModrinthVersion,
  getModrinthProjectTitles,
  getModrinthVersions,
  identifyEnabledModVersions,
  updateMod
} from './modrinth'
import { autoSnapshot } from './versionSnapshots'
import type { ModSyncItem, ModSyncPreview, ModSyncResult } from '../shared/types'

const PREFIX = 'LIULI-MODS-1.'
const MAX_MODS = 500
const ID = /^[A-Za-z0-9]{8}$/

interface Payload {
  mc: string
  loader: string
  v: string[]
}

export async function createModSyncCode(
  versionId: string
): Promise<{ code: string; count: number; unknown: string[] }> {
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader || ctx.loader === 'optifine') throw new Error('这个版本没有模组加载器')
  const { versions, unknown } = await identifyEnabledModVersions(versionId)
  if (versions.length === 0) {
    throw new Error(
      unknown.length > 0 ? '这个版本的模组都不是从 Modrinth 下载的，没法生成同步码' : '这个版本没有启用的模组'
    )
  }
  const payload: Payload = {
    mc: ctx.minecraftVersion,
    loader: ctx.loader,
    v: [...new Set(versions.map((v) => v.versionId))].slice(0, MAX_MODS)
  }
  const code = PREFIX + deflateRawSync(Buffer.from(JSON.stringify(payload))).toString('base64url')
  return { code, count: payload.v.length, unknown }
}

function decode(code: unknown): Payload {
  if (typeof code !== 'string') throw new Error('请粘贴同步码')
  const text = code.trim().replace(/\s+/g, '')
  if (!text.startsWith(PREFIX)) throw new Error('这不是琉璃启动器的模组同步码')
  if (text.length > 64 * 1024) throw new Error('同步码太长了')
  let raw: unknown
  try {
    raw = JSON.parse(
      inflateRawSync(Buffer.from(text.slice(PREFIX.length), 'base64url'), { maxOutputLength: 256 * 1024 }).toString(
        'utf-8'
      )
    )
  } catch {
    throw new Error('同步码不完整或已损坏，请重新复制')
  }
  const p = raw as Partial<Payload>
  const ids = Array.isArray(p?.v) ? p.v.filter((x): x is string => typeof x === 'string' && ID.test(x)) : []
  if (ids.length === 0) throw new Error('同步码里没有模组')
  return {
    mc: typeof p.mc === 'string' ? p.mc.slice(0, 32) : '',
    loader: typeof p.loader === 'string' ? p.loader.slice(0, 16) : '',
    v: [...new Set(ids)].slice(0, MAX_MODS)
  }
}

/** 看看同步码里有什么、和这个版本比哪些已经装了 */
export async function previewModSyncCode(versionId: string, code: unknown): Promise<ModSyncPreview> {
  const payload = decode(code)
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader || ctx.loader === 'optifine')
    throw new Error('这个版本没有模组加载器，先装 Fabric、Forge 或 NeoForge')
  const [versions, mine] = await Promise.all([getModrinthVersions(payload.v), identifyEnabledModVersions(versionId)])
  const titles = await getModrinthProjectTitles([...new Set(versions.map((v) => v.projectId))])
  const byProject = new Map(mine.versions.map((v) => [v.projectId, v]))
  const items: ModSyncItem[] = versions.map((v) => {
    const have = byProject.get(v.projectId)
    return {
      versionId: v.id,
      projectId: v.projectId,
      title: titles.get(v.projectId) ?? v.name,
      versionNumber: v.versionNumber,
      status: !have ? 'new' : have.versionId === v.id ? 'same' : 'different',
      currentFile: have?.fileName,
      fits: v.gameVersions.includes(ctx.minecraftVersion) && v.loaders.includes(ctx.loader!)
    }
  })
  const wanted = new Set(versions.map((v) => v.projectId))
  return {
    minecraftVersion: payload.mc,
    loader: payload.loader,
    targetMinecraftVersion: ctx.minecraftVersion,
    targetLoader: ctx.loader,
    items: items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    missing: payload.v.length - versions.length,
    extra: mine.versions.filter((v) => !wanted.has(v.projectId)).map((v) => v.fileName)
  }
}

/** 装上同步码里的模组：新的下载，replace 为 true 时把版本不一样的换成同步码里的版本 */
export async function applyModSyncCode(versionId: string, code: unknown, replace: unknown): Promise<ModSyncResult> {
  assertGameStopped(versionId)
  const preview = await previewModSyncCode(versionId, code)
  const wanted = preview.items.filter((i) => i.status === 'new' || (replace === true && i.status === 'different'))
  // 不适合这个游戏版本或加载器的模组装上去游戏多半打不开：不装，告诉用户
  const todo = wanted.filter((i) => i.fits)
  if (todo.length > 0) await autoSnapshot(versionId, '使用模组同步码')
  const ctx = await modsContextOf(versionId)
  const result: ModSyncResult = {
    installed: [],
    replaced: [],
    failed: wanted
      .filter((i) => !i.fits)
      .map((i) => ({ title: i.title, error: '不适合这个版本（游戏版本或加载器不一样），没有安装' })),
    skipped: preview.items.length - wanted.length
  }
  for (const item of todo) {
    try {
      if (item.status === 'new') {
        await downloadModrinthVersion(item.versionId, ctx.dir)
        result.installed.push(item.title)
      } else if (item.currentFile) {
        // 和更新模组一样：旧文件先备份，有问题可以退回
        await updateMod(versionId, item.currentFile, item.versionId)
        result.replaced.push(item.title)
      }
    } catch (e) {
      result.failed.push({ title: item.title, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
