/**
 * 地图画导出成 Litematica 投影（.litematic）：一层方块，最北边多一排圆石（让最上面一排的颜色和其他地方一样），
 * 保存到版本游戏目录的 schematics 文件夹，进游戏后用 Litematica 加载即可照着摆
 */
import { mkdir, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { gzipSync } from 'zlib'
import { modsContextOf } from './mods'
import { MAP_ART_BLOCK_IDS } from '../shared/mapColors'

type Tag =
  | { t: 3; v: number }
  | { t: 4; v: bigint }
  | { t: 8; v: string }
  | { t: 9; item: 10; v: Compound[] }
  | { t: 10; v: Compound }
  | { t: 12; v: bigint[] }
type Compound = Record<string, Tag>

function writeTag(tag: Tag, out: Buffer[]): void {
  const u8 = (n: number): void => {
    const b = Buffer.alloc(1)
    b.writeInt8(n)
    out.push(b)
  }
  const i32 = (n: number): void => {
    const b = Buffer.alloc(4)
    b.writeInt32BE(n)
    out.push(b)
  }
  const str = (s: string): void => {
    const d = Buffer.from(s, 'utf-8')
    const b = Buffer.alloc(2)
    b.writeUInt16BE(d.length)
    out.push(b, d)
  }
  switch (tag.t) {
    case 3:
      i32(tag.v)
      break
    case 4: {
      const b = Buffer.alloc(8)
      b.writeBigInt64BE(tag.v)
      out.push(b)
      break
    }
    case 8:
      str(tag.v)
      break
    case 9:
      u8(tag.v.length ? tag.item : 0)
      i32(tag.v.length)
      for (const c of tag.v) writeTag({ t: 10, v: c }, out)
      break
    case 10:
      for (const [name, child] of Object.entries(tag.v)) {
        u8(child.t)
        str(name)
        writeTag(child, out)
      }
      u8(0)
      break
    case 12: {
      i32(tag.v.length)
      for (const v of tag.v) {
        const b = Buffer.alloc(8)
        b.writeBigInt64BE(BigInt.asIntN(64, v))
        out.push(b)
      }
      break
    }
  }
}

/** 按 Litematica 的方式紧密排列（可以跨过两个 long） */
function packStates(values: number[], bits: number): bigint[] {
  const longs = new Array<bigint>(Math.ceil((values.length * bits) / 64)).fill(0n)
  values.forEach((v, i) => {
    const pos = i * bits
    const index = Math.floor(pos / 64)
    const offset = pos % 64
    longs[index] |= BigInt(v) << BigInt(offset)
    if (offset + bits > 64) longs[index + 1] |= BigInt(v) >> BigInt(64 - offset)
  })
  return longs.map((l) => BigInt.asUintN(64, l))
}

/** 数据版本：Litematica 加载时按这个版本升级方块 */
const DATA_VERSIONS: Record<number, number> = { 12: 1343, 16: 2586, 17: 2730, 20: 3465 }

function safeName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f<>:"/\\|?*.]/g, '_')
      .trim()
      .slice(0, 60) || '地图画'
  )
}

export async function exportMapArt(versionId: string, input: unknown): Promise<{ path: string; blocks: number }> {
  const i = (input ?? {}) as {
    name?: unknown
    width?: unknown
    height?: unknown
    palette?: unknown
    pixels?: unknown
    target?: unknown
  }
  const width = Number(i.width)
  const height = Number(i.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) {
    throw new Error('地图画大小无效')
  }
  const palette = Array.isArray(i.palette) ? i.palette.filter((b): b is string => typeof b === 'string') : []
  if (palette.length === 0 || palette.length > 64 || !palette.every((b) => MAP_ART_BLOCK_IDS.has(b))) {
    throw new Error('方块列表无效')
  }
  const pixels = Array.isArray(i.pixels) ? i.pixels : []
  if (pixels.length !== width * height || !pixels.every((p) => Number.isInteger(p) && p >= 0 && p < palette.length)) {
    throw new Error('像素数据无效')
  }
  // 方块调色板：0 是空气，1 是最北边那排圆石，后面是地图画用的方块
  const states: Compound[] = [{ Name: { t: 8, v: 'minecraft:air' } }, { Name: { t: 8, v: 'minecraft:cobblestone' } }]
  for (const block of palette) {
    const entry: Compound = { Name: { t: 8, v: `minecraft:${block}` } }
    // 放下的树叶不会掉，投影里也要标成玩家放的
    if (block.endsWith('_leaves')) entry.Properties = { t: 10, v: { persistent: { t: 8, v: 'true' } } }
    states.push(entry)
  }
  const sizeZ = height + 1
  const values: number[] = []
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < width; x++) values.push(z === 0 ? 1 : 2 + (pixels[(z - 1) * width + x] as number))
  }
  const bits = Math.max(2, 32 - Math.clz32(states.length - 1))
  const name = safeName(typeof i.name === 'string' ? i.name : '')
  const now = BigInt(Date.now())
  const blocks = values.length
  const root: Compound = {
    Version: { t: 3, v: 6 },
    MinecraftDataVersion: { t: 3, v: DATA_VERSIONS[Number(i.target)] ?? 3465 },
    Metadata: {
      t: 10,
      v: {
        Name: { t: 8, v: name },
        Author: { t: 8, v: '琉璃启动器' },
        Description: { t: 8, v: `地图画 ${width}×${height}，平铺` },
        RegionCount: { t: 3, v: 1 },
        TotalBlocks: { t: 3, v: blocks },
        TotalVolume: { t: 3, v: blocks },
        TimeCreated: { t: 4, v: now },
        TimeModified: { t: 4, v: now },
        EnclosingSize: { t: 10, v: { x: { t: 3, v: width }, y: { t: 3, v: 1 }, z: { t: 3, v: sizeZ } } }
      }
    },
    Regions: {
      t: 10,
      v: {
        [name]: {
          t: 10,
          v: {
            Position: { t: 10, v: { x: { t: 3, v: 0 }, y: { t: 3, v: 0 }, z: { t: 3, v: 0 } } },
            Size: { t: 10, v: { x: { t: 3, v: width }, y: { t: 3, v: 1 }, z: { t: 3, v: sizeZ } } },
            BlockStatePalette: { t: 9, item: 10, v: states },
            BlockStates: { t: 12, v: packStates(values, bits) },
            Entities: { t: 9, item: 10, v: [] },
            TileEntities: { t: 9, item: 10, v: [] }
          }
        }
      }
    }
  }
  const out: Buffer[] = [Buffer.from([10, 0, 0])]
  writeTag({ t: 10, v: root }, out)
  const dir = join(dirname((await modsContextOf(versionId)).dir), 'schematics')
  await mkdir(dir, { recursive: true })
  let path = join(dir, `${name}.litematic`)
  for (let n = 2; await stat(path).catch(() => null); n++) path = join(dir, `${name} (${n}).litematic`)
  await writeFile(path, gzipSync(Buffer.concat(out)))
  return { path, blocks }
}
