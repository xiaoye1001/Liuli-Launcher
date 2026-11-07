/**
 * 存档体积分析与瘦身。
 * - 分析：主世界、下界、末地、其他维度、玩家数据等各占多少空间
 * - 瘦身：游戏给每个区块记着玩家在附近待了多久（InhabitedTime，单位游戏刻）。一个区域文件（32×32 个区块）里
 *   所有区块都几乎没待过、而且离出生点和玩家位置都远时，可以删掉，下次走过去时游戏会按种子重新生成。
 *   删之前先完整备份存档；同时删掉同名的实体、兴趣点区域文件
 */
import { open, readdir, rm, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { inflateSync, gunzipSync } from 'zlib'
import { backupWorld, getWorldDetails, worldRegionDir } from './worlds'
import { assertGameDirFree } from './gameUsage'
import type { WorldSizeReport, WorldTrimPlan } from '../shared/types'

async function worldPath(versionId: string, folder: string): Promise<string> {
  return dirname(await worldRegionDir(versionId, folder))
}

async function sizeOf(path: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0
  const entries = await readdir(path, { withFileTypes: true, recursive: true }).catch(() => [])
  for (const e of entries) {
    if (!e.isFile()) continue
    const info = await stat(join(e.parentPath ?? path, e.name)).catch(() => null)
    if (info) {
      bytes += info.size
      files++
    }
  }
  return { bytes, files }
}

/** 维度文件夹（相对存档文件夹）：名字 → 路径 */
async function dimensions(world: string): Promise<{ key: string; name: string; dir: string }[]> {
  const list = [
    { key: 'overworld', name: '主世界', dir: world },
    { key: 'the_nether', name: '下界', dir: join(world, 'DIM-1') },
    { key: 'the_end', name: '末地', dir: join(world, 'DIM1') }
  ]
  // 模组或数据包加的维度：dimensions/<命名空间>/<名字>
  for (const ns of await readdir(join(world, 'dimensions')).catch(() => [] as string[])) {
    for (const name of await readdir(join(world, 'dimensions', ns)).catch(() => [] as string[])) {
      list.push({ key: `${ns}:${name}`, name: `${ns}:${name}`, dir: join(world, 'dimensions', ns, name) })
    }
  }
  return list
}

export async function analyzeWorldSize(versionId: string, folder: string): Promise<WorldSizeReport> {
  const world = await worldPath(versionId, folder)
  const parts: WorldSizeReport['parts'] = []
  for (const d of await dimensions(world)) {
    let bytes = 0
    let regions = 0
    for (const sub of ['region', 'entities', 'poi']) {
      const s = await sizeOf(join(d.dir, sub))
      bytes += s.bytes
      if (sub === 'region') regions = s.files
    }
    if (bytes > 0) parts.push({ key: d.key, name: d.name, bytes, regions })
  }
  for (const [key, name] of [
    ['playerdata', '玩家数据'],
    ['data', '地图、袭击等数据'],
    ['datapacks', '数据包']
  ] as const) {
    const s = await sizeOf(join(world, key))
    if (s.bytes > 0) parts.push({ key, name, bytes: s.bytes, regions: 0 })
  }
  const total = (await sizeOf(world)).bytes
  const known = parts.reduce((n, p) => n + p.bytes, 0)
  if (total - known > 0) parts.push({ key: 'other', name: '其他', bytes: total - known, regions: 0 })
  return { total, parts: parts.sort((a, b) => b.bytes - a.bytes) }
}

const MARKER = Buffer.from([0x04, 0x00, 0x0d, ...Buffer.from('InhabitedTime')])

/** 一个区域文件里所有区块待过的最长时间（游戏刻）；读不出时返回 Infinity（当作有人待过，不删） */
async function maxInhabited(path: string): Promise<number> {
  const file = await open(path, 'r')
  try {
    const header = Buffer.alloc(4096)
    const { bytesRead } = await file.read(header, 0, 4096, 0)
    if (bytesRead < 4096) return 0
    let max = 0
    for (let i = 0; i < 1024; i++) {
      const loc = header.readUInt32BE(i * 4)
      if (loc === 0) continue
      const offset = (loc >>> 8) * 4096
      const sectors = loc & 0xff
      if (sectors === 0) continue
      const buf = Buffer.alloc(Math.min(sectors * 4096, 4 * 1024 * 1024))
      const read = await file.read(buf, 0, buf.length, offset)
      if (read.bytesRead < 5) return Infinity
      const length = buf.readUInt32BE(0)
      const type = buf[4]
      // 外置区块（.mcc）或者不认识的压缩方式：保守起见当作有人待过
      if (type & 0x80 || length < 1 || length > buf.length - 4) return Infinity
      const body = buf.subarray(5, 4 + length)
      let data: Buffer
      try {
        data =
          type === 2
            ? inflateSync(body, { maxOutputLength: 32 * 1024 * 1024 })
            : type === 1
              ? gunzipSync(body, { maxOutputLength: 32 * 1024 * 1024 })
              : type === 3
                ? body
                : (() => {
                    throw new Error('压缩方式不支持')
                  })()
      } catch {
        return Infinity
      }
      const at = data.indexOf(MARKER)
      if (at < 0 || at + MARKER.length + 8 > data.length) return Infinity
      const ticks = Number(data.readBigInt64BE(at + MARKER.length))
      if (ticks > max) max = ticks
    }
    return max
  } finally {
    await file.close()
  }
}

/** 区域文件 r.X.Z.mca 的中心方块坐标 */
function regionCenter(name: string): { x: number; z: number } | null {
  const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(name)
  return m ? { x: Number(m[1]) * 512 + 256, z: Number(m[2]) * 512 + 256 } : null
}

/** 正在玩的游戏（包括多开的窗口、共用同一个存档文件夹的其他版本）用着存档时不能删 */
function assertStopped(versionId: string): Promise<void> {
  return assertGameDirFree(versionId, '整理存档')
}

/**
 * 算出可以删掉的区域文件：所有区块都待了不到 maxMinutes 分钟，并且区域中心离出生点、玩家位置都超过 keepRadius 格
 */
export async function planWorldTrim(
  versionId: string,
  folder: string,
  maxMinutes: unknown,
  keepRadius: unknown
): Promise<WorldTrimPlan> {
  const minutes = Number(maxMinutes)
  const radius = Number(keepRadius)
  if (![0, 1, 5].includes(minutes)) throw new Error('无效的时间')
  if (![256, 512, 1024, 2048].includes(radius)) throw new Error('无效的范围')
  const world = await worldPath(versionId, folder)
  const details = await getWorldDetails(versionId, folder).catch(() => null)
  const keep: { dim: string; x: number; z: number }[] = []
  if (details?.spawn) keep.push({ dim: 'overworld', x: details.spawn.x, z: details.spawn.z })
  if (details?.player) {
    keep.push({ dim: details.player.dimension.replace(/^minecraft:/, ''), x: details.player.x, z: details.player.z })
  }
  // 末地的主岛在原点附近，下界没有出生点；原点附近都保留
  for (const dim of ['overworld', 'the_nether', 'the_end']) keep.push({ dim, x: 0, z: 0 })
  const limit = minutes * 60 * 20
  const regions: WorldTrimPlan['regions'] = []
  let scanned = 0
  for (const d of await dimensions(world)) {
    const dir = join(d.dir, 'region')
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const center = regionCenter(name)
      if (!center) continue
      scanned++
      const near = keep.some(
        (k) => k.dim === d.key && Math.max(Math.abs(k.x - center.x), Math.abs(k.z - center.z)) < radius + 256
      )
      if (near) continue
      const ticks = await maxInhabited(join(dir, name)).catch(() => Infinity)
      if (ticks > limit) continue
      let bytes = 0
      for (const sub of ['region', 'entities', 'poi'])
        bytes += (await stat(join(d.dir, sub, name)).catch(() => null))?.size ?? 0
      regions.push({ dimension: d.key, dimensionName: d.name, file: name, bytes, ticks })
    }
  }
  return { scanned, regions, bytes: regions.reduce((n, r) => n + r.bytes, 0), minutes, radius }
}

/** 按计划删除：先完整备份存档，再删区域文件和同名的实体、兴趣点文件 */
export async function applyWorldTrim(
  versionId: string,
  folder: string,
  maxMinutes: unknown,
  keepRadius: unknown
): Promise<{ removed: number; bytes: number; backup: string }> {
  await assertStopped(versionId)
  const plan = await planWorldTrim(versionId, folder, maxMinutes, keepRadius)
  if (plan.regions.length === 0) throw new Error('没有可以删掉的区域')
  const backup = await backupWorld(versionId, folder)
  const world = await worldPath(versionId, folder)
  const dims = new Map((await dimensions(world)).map((d) => [d.key, d.dir]))
  let removed = 0
  for (const r of plan.regions) {
    const dir = dims.get(r.dimension)
    if (!dir) continue
    for (const sub of ['region', 'entities', 'poi']) await rm(join(dir, sub, r.file), { force: true })
    removed++
  }
  return { removed, bytes: plan.bytes, backup: backup.path }
}
