import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { assertGameStopped, listModFiles, modsContextOf, setModEnabled } from './mods'
import type { ModProfile, ModProfileResult } from '../shared/types'

/**
 * 模组启用方案：把这个版本 mods 文件夹里每个模组的开关状态存成方案（例如「生存」「光影」「建筑」），
 * 一键切换。保存在游戏目录的 liuli-mod-profiles.json，跟着版本走（不隔离的版本共用 mods 文件夹，也共用方案）
 */
export const MOD_PROFILES_FILE = 'liuli-mod-profiles.json'
const MAX_PROFILES = 30

const base = (name: string): string => name.replace(/\.disabled$/, '')
const cleanName = (name: unknown): string =>
  typeof name === 'string'
    ? name
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 30)
    : ''

async function fileOf(versionId: string): Promise<{ dir: string; file: string }> {
  const { dir } = await modsContextOf(versionId)
  return { dir, file: join(dirname(dir), MOD_PROFILES_FILE) }
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 255).slice(0, 2000) : []
}

async function load(file: string): Promise<ModProfile[]> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p): p is ModProfile => !!p && typeof p.id === 'string' && Number.isFinite(p.createdAt))
      .map((p) => ({
        id: p.id,
        name: cleanName(p.name) || '方案',
        createdAt: p.createdAt,
        enabled: stringList(p.enabled),
        disabled: stringList(p.disabled)
      }))
      .slice(0, MAX_PROFILES)
  } catch {
    return []
  }
}

async function save(file: string, list: ModProfile[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(list, null, 2), 'utf-8')
  await rename(`${file}.tmp`, file)
}

/** 方案列表，以及哪个方案和现在的开关状态一样 */
export async function listModProfiles(versionId: string): Promise<{ profiles: ModProfile[]; current: string | null }> {
  const { dir, file } = await fileOf(versionId)
  const profiles = await load(file)
  const files = await listModFiles(dir)
  // 方案里记录的每个模组都是方案里的开关状态（之后新加的模组不算；至少要有一个方案里的模组还在）
  const matches = (p: ModProfile): boolean =>
    files.some((f) => p.enabled.includes(base(f)) || p.disabled.includes(base(f))) &&
    files.every((f) => {
      const name = base(f)
      const on = !f.endsWith('.disabled')
      if (p.enabled.includes(name)) return on
      if (p.disabled.includes(name)) return !on
      return true
    })
  const current = profiles.find(matches)?.id ?? null
  return { profiles, current }
}

/** 把现在的开关状态存成方案（同名的方案会被更新） */
export async function saveModProfile(versionId: string, name: string): Promise<ModProfile> {
  const profileName = cleanName(name)
  if (!profileName) throw new Error('请输入方案名称')
  const { dir, file } = await fileOf(versionId)
  const files = await listModFiles(dir)
  if (files.length === 0) throw new Error('这个版本还没有模组')
  const list = await load(file)
  const existing = list.find((p) => p.name === profileName)
  const profile: ModProfile = {
    id: existing?.id ?? randomUUID(),
    name: profileName,
    createdAt: Date.now(),
    enabled: files.filter((f) => !f.endsWith('.disabled')).map(base),
    disabled: files.filter((f) => f.endsWith('.disabled')).map(base)
  }
  if (!existing && list.length >= MAX_PROFILES) throw new Error(`最多保存 ${MAX_PROFILES} 个方案，请先删除一些`)
  await save(file, existing ? list.map((p) => (p.id === existing.id ? profile : p)) : [...list, profile])
  return profile
}

/** 应用方案：只改方案里记录的模组，之后新加的模组不动 */
export async function applyModProfile(versionId: string, id: string): Promise<ModProfileResult> {
  assertGameStopped(versionId)
  const { dir, file } = await fileOf(versionId)
  const profile = (await load(file)).find((p) => p.id === id)
  if (!profile) throw new Error('找不到这个方案')
  const files = await listModFiles(dir)
  const want = new Map<string, boolean>([
    ...profile.disabled.map((m) => [m, false] as [string, boolean]),
    ...profile.enabled.map((m) => [m, true] as [string, boolean])
  ])
  const result: ModProfileResult = { enabled: 0, disabled: 0, untouched: 0, missing: 0, failed: [] }
  const present = new Set<string>()
  for (const f of files) {
    const name = base(f)
    present.add(name)
    const target = want.get(name)
    if (target === undefined) {
      result.untouched++
      continue
    }
    const isEnabled = !f.endsWith('.disabled')
    if (isEnabled === target) continue
    try {
      await setModEnabled(versionId, f, target)
      if (target) result.enabled++
      else result.disabled++
    } catch {
      result.failed.push(name)
    }
  }
  result.missing = [...want.keys()].filter((m) => !present.has(m)).length
  return result
}

export async function deleteModProfile(versionId: string, id: string): Promise<void> {
  const { file } = await fileOf(versionId)
  const list = await load(file)
  await save(
    file,
    list.filter((p) => p.id !== id)
  )
}
