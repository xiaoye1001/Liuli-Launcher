/**
 * 坐标笔记本：给存档记下家、刷怪塔、要塞、下界传送门等坐标。
 * 保存在存档文件夹里的 liuli-waypoints.json（游戏不会读它），所以存档备份、复制到别的版本时一起带着
 */
import { randomUUID } from 'crypto'
import { readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { worldRegionDir } from './worlds'
import type { Waypoint, WaypointDimension } from '../shared/types'

const FILE = 'liuli-waypoints.json'
const MAX = 500
const DIMENSIONS: WaypointDimension[] = ['overworld', 'the_nether', 'the_end']
const COLORS = ['emerald', 'sky', 'violet', 'rose', 'amber', 'slate']

async function fileOf(versionId: string, folder: string): Promise<string> {
  return join(dirname(await worldRegionDir(versionId, folder)), FILE)
}

const clean = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : ''

function coord(value: unknown, name: string): number {
  const n = Math.round(Number(value))
  if (value === '' || value === null || !Number.isFinite(n) || Math.abs(n) > 30_000_000)
    throw new Error(`${name} 坐标无效`)
  return n
}

function sanitize(raw: unknown, keepId = true): Waypoint | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  try {
    const y = Math.round(Number(w.y))
    return {
      id: keepId && typeof w.id === 'string' && /^[\w-]{1,64}$/.test(w.id) ? w.id : randomUUID(),
      name: clean(w.name, 40) || '未命名地点',
      x: coord(w.x, 'X'),
      y: Number.isFinite(y) && Math.abs(y) <= 4096 ? y : 64,
      z: coord(w.z, 'Z'),
      dimension: DIMENSIONS.includes(w.dimension as WaypointDimension)
        ? (w.dimension as WaypointDimension)
        : 'overworld',
      note: clean(w.note, 200),
      color: COLORS.includes(String(w.color)) ? String(w.color) : 'emerald',
      createdAt: Number.isFinite(Number(w.createdAt)) ? Number(w.createdAt) : Date.now()
    }
  } catch {
    return null
  }
}

export async function listWaypoints(versionId: string, folder: string): Promise<Waypoint[]> {
  const file = await fileOf(versionId, folder)
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as unknown
    return (Array.isArray(raw) ? raw : [])
      .map((w) => sanitize(w))
      .filter((w): w is Waypoint => !!w)
      .slice(0, MAX)
  } catch {
    return []
  }
}

async function save(versionId: string, folder: string, list: Waypoint[]): Promise<Waypoint[]> {
  const file = await fileOf(versionId, folder)
  await writeFile(`${file}.tmp`, JSON.stringify(list, null, 2), 'utf-8')
  await rename(`${file}.tmp`, file)
  return list
}

/** 添加或修改（有 id 时修改） */
export async function saveWaypoint(versionId: string, folder: string, input: unknown): Promise<Waypoint[]> {
  const list = await listWaypoints(versionId, folder)
  const id = input && typeof input === 'object' ? (input as { id?: unknown }).id : undefined
  const existing = typeof id === 'string' ? list.findIndex((w) => w.id === id) : -1
  // 先检查坐标，给出具体哪个坐标不对
  if (input && typeof input === 'object') {
    coord((input as { x?: unknown }).x, 'X')
    coord((input as { z?: unknown }).z, 'Z')
  }
  const next = sanitize(
    { ...(input as object), ...(existing < 0 ? { id: undefined, createdAt: Date.now() } : {}) },
    existing >= 0
  )
  if (!next) throw new Error('坐标无效')
  if (existing >= 0) {
    next.createdAt = list[existing].createdAt
    list[existing] = next
  } else {
    if (list.length >= MAX) throw new Error(`一个存档最多记 ${MAX} 个地点`)
    list.push(next)
  }
  return save(versionId, folder, list)
}

export async function deleteWaypoint(versionId: string, folder: string, id: unknown): Promise<Waypoint[]> {
  const list = await listWaypoints(versionId, folder)
  return save(
    versionId,
    folder,
    list.filter((w) => w.id !== id)
  )
}
