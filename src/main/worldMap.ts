import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { gunzip, inflate } from 'zlib'
import { promisify } from 'util'
import { worldRegionDir } from './worlds'
import type { WorldMap } from '../shared/types'

/**
 * 存档地图预览：读取主世界的区域文件（region/r.x.z.mca），取每一列最上面的方块画成俯视图，
 * 按高度加明暗、按水深加深水的颜色。支持 1.13 及以后的存档（更早的存档方块用数字保存，格式不同）
 */
const gunzipAsync = promisify(gunzip)
const inflateAsync = promisify(inflate)

/** 区域文件太大时不读（正常的区域文件最多几十 MB） */
const MAX_REGION_SIZE = 96 * 1024 * 1024
/** 一个区块解压后最大的大小 */
const MAX_CHUNK_SIZE = 16 * 1024 * 1024
export const MAP_SIZES = [128, 256, 512] as const

// ---------- 只取需要内容的 NBT 读取（长整数数组不转换，按需从原始数据里取位） ----------

interface LongArray {
  buf: Buffer
  offset: number
  length: number
}
type Tag = number | string | LongArray | Tag[] | { [key: string]: Tag } | null

function isLongArray(v: Tag | undefined): v is LongArray {
  return !!v && typeof v === 'object' && !Array.isArray(v) && (v as LongArray).buf instanceof Buffer
}
function isCompound(v: Tag | undefined): v is { [key: string]: Tag } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !isLongArray(v)
}

class ChunkReader {
  offset = 0
  private count = 0
  constructor(private readonly buf: Buffer) {}

  private need(n: number): void {
    if (n < 0 || this.offset + n > this.buf.length) throw new Error('区块数据不完整')
  }
  private int(): number {
    this.need(4)
    const v = this.buf.readInt32BE(this.offset)
    this.offset += 4
    return v
  }
  private string(): string {
    this.need(2)
    const length = this.buf.readUInt16BE(this.offset)
    this.offset += 2
    this.need(length)
    const v = this.buf.toString('utf-8', this.offset, this.offset + length)
    this.offset += length
    return v
  }
  private array(size: number): number {
    const n = this.int()
    if (n < 0 || n * size > this.buf.length - this.offset) throw new Error('区块数据无效')
    return n
  }

  payload(type: number, depth: number): Tag {
    if (depth > 32 || ++this.count > 2_000_000) throw new Error('区块数据无效')
    switch (type) {
      case 1:
        this.need(1)
        return this.buf.readInt8(this.offset++)
      case 2:
        this.need(2)
        this.offset += 2
        return this.buf.readInt16BE(this.offset - 2)
      case 3:
        return this.int()
      case 4:
        this.need(8)
        this.offset += 8
        return null
      case 5:
        this.need(4)
        this.offset += 4
        return null
      case 6:
        this.need(8)
        this.offset += 8
        return null
      case 7: {
        const n = this.array(1)
        this.offset += n
        return null
      }
      case 8:
        return this.string()
      case 9: {
        this.need(1)
        const itemType = this.buf.readInt8(this.offset++)
        const n = this.array(itemType === 0 ? 0 : 1)
        const list: Tag[] = []
        for (let i = 0; i < n; i++) list.push(this.payload(itemType, depth + 1))
        return list
      }
      case 10: {
        const result = Object.create(null) as { [key: string]: Tag }
        for (;;) {
          this.need(1)
          const tag = this.buf.readInt8(this.offset++)
          if (tag === 0) return result
          const name = this.string()
          result[name] = this.payload(tag, depth + 1)
        }
      }
      case 11: {
        const n = this.array(4)
        this.offset += n * 4
        return null
      }
      case 12: {
        const n = this.array(8)
        const view: LongArray = { buf: this.buf, offset: this.offset, length: n }
        this.offset += n * 8
        return view
      }
      default:
        throw new Error('区块数据无效')
    }
  }

  root(): { [key: string]: Tag } {
    this.need(1)
    if (this.buf.readInt8(this.offset++) !== 10) throw new Error('区块数据无效')
    this.string()
    return this.payload(10, 0) as { [key: string]: Tag }
  }
}

/** 从一个 64 位长整数（大端）里取 start 开始的 bits 位（start + bits ≤ 64） */
function bitsOf(arr: LongArray, longIndex: number, start: number, bits: number): number {
  const at = arr.offset + longIndex * 8
  const hi = arr.buf.readUInt32BE(at)
  const lo = arr.buf.readUInt32BE(at + 4)
  const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1
  if (start >= 32) return (hi >>> (start - 32)) & mask
  if (start + bits <= 32) return (lo >>> start) & mask
  return ((lo >>> start) | (hi << (32 - start))) & mask
}

/** 压缩存放的整数数组：1.16 起每个长整数里放整数个值，更早的可以跨两个长整数 */
function packed(arr: LongArray, index: number, bits: number, spanning: boolean): number {
  if (!spanning) {
    const perLong = Math.floor(64 / bits)
    const longIndex = Math.floor(index / perLong)
    if (longIndex >= arr.length) return 0
    return bitsOf(arr, longIndex, (index % perLong) * bits, bits)
  }
  const bitIndex = index * bits
  const longIndex = Math.floor(bitIndex / 64)
  const start = bitIndex % 64
  if (longIndex >= arr.length) return 0
  if (start + bits <= 64) return bitsOf(arr, longIndex, start, bits)
  const lowBits = 64 - start
  const low = bitsOf(arr, longIndex, start, lowBits)
  const high = longIndex + 1 < arr.length ? bitsOf(arr, longIndex + 1, 0, bits - lowBits) : 0
  return low | (high << lowBits)
}

// ---------- 方块颜色 ----------

const DYES: Record<string, number> = {
  white: 0xe9ecec,
  orange: 0xf07613,
  magenta: 0xbd44b3,
  light_blue: 0x3aafd9,
  yellow: 0xf8c627,
  lime: 0x70b919,
  pink: 0xed8dac,
  gray: 0x3e4447,
  light_gray: 0x8e8e86,
  cyan: 0x158991,
  purple: 0x792aac,
  blue: 0x35399d,
  brown: 0x724728,
  green: 0x546d1b,
  red: 0xa12722,
  black: 0x141519
}

const EXACT: Record<string, number> = {
  water: 0x3f76e4,
  bubble_column: 0x3f76e4,
  kelp: 0x3a6fd8,
  kelp_plant: 0x3a6fd8,
  seagrass: 0x3a6fd8,
  tall_seagrass: 0x3a6fd8,
  lava: 0xd96415,
  grass_block: 0x7fb238,
  short_grass: 0x6fa83a,
  grass: 0x6fa83a,
  tall_grass: 0x6fa83a,
  fern: 0x5f9a35,
  large_fern: 0x5f9a35,
  sand: 0xdbd3a0,
  sandstone: 0xd8cf9b,
  red_sand: 0xbe6621,
  red_sandstone: 0xb5612a,
  snow: 0xf8fdfd,
  snow_block: 0xf8fdfd,
  powder_snow: 0xf8fdfd,
  ice: 0xa0b4f5,
  packed_ice: 0x8fb0ef,
  blue_ice: 0x74a7fd,
  stone: 0x7d7d7d,
  cobblestone: 0x7a7a7a,
  mossy_cobblestone: 0x6e7f5f,
  andesite: 0x888888,
  diorite: 0xbcbcbc,
  granite: 0x9a6b54,
  deepslate: 0x505055,
  cobbled_deepslate: 0x4d4d50,
  tuff: 0x6c6d66,
  calcite: 0xdfe0dc,
  dripstone_block: 0x866b5c,
  dirt: 0x976d4d,
  coarse_dirt: 0x77553b,
  rooted_dirt: 0x8f6747,
  podzol: 0x6a4418,
  mycelium: 0x6f6265,
  mud: 0x3c3a3d,
  farmland: 0x8f5f37,
  dirt_path: 0x947a41,
  gravel: 0x837e7c,
  clay: 0xa4a8b8,
  moss_block: 0x5c7a2f,
  moss_carpet: 0x5c7a2f,
  bedrock: 0x555555,
  obsidian: 0x15111f,
  pumpkin: 0xe38a1d,
  melon: 0x6f9b2c,
  cactus: 0x5a8a2a,
  sugar_cane: 0x88b45a,
  bamboo: 0x5d8a1d,
  lily_pad: 0x208030,
  terracotta: 0x985e43,
  hay_block: 0xc9a62c,
  netherrack: 0x6f3332,
  soul_sand: 0x51402f,
  end_stone: 0xdbdea0,
  mangrove_roots: 0x5f4b33,
  muddy_mangrove_roots: 0x4a3f33,
  glass: 0xc0d8e0
}

/** 木头种类对应的木板颜色（台阶、楼梯、栅栏等去掉后缀后按这个找） */
const WOODS: Record<string, number> = {
  oak: 0xa2834f,
  spruce: 0x725431,
  birch: 0xc4b07c,
  jungle: 0xa0734f,
  acacia: 0xa85a32,
  dark_oak: 0x4c331a,
  mangrove: 0x773632,
  cherry: 0xe3b3ad,
  bamboo: 0xc3ad55,
  crimson: 0x6a344b,
  warped: 0x2b6963
}

const LEAVES: Record<string, number> = {
  birch: 0x80a755,
  spruce: 0x3d6a3d,
  cherry: 0xe8b4c8,
  azalea: 0x5f7e2b,
  flowering_azalea: 0x6e7f3a,
  mangrove: 0x5f8a2d
}

const colorCache = new Map<string, number>()

function lookup(name: string): number | undefined {
  if (EXACT[name] !== undefined) return EXACT[name]
  const leaves = /^(.+)_leaves$/.exec(name)
  if (leaves) return LEAVES[leaves[1]] ?? 0x48a02a
  const wood = /^(?:stripped_)?(.+?)_(?:log|wood|stem|hyphae)$/.exec(name)
  if (wood) return WOODS[wood[1]] !== undefined ? Math.max(0, WOODS[wood[1]] - 0x202020) : 0x6b5130
  const planks = /^(.+)_planks$/.exec(name)
  if (planks) return WOODS[planks[1]] ?? 0xa2834f
  const dyed = /^(.+?)_(?:wool|carpet|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|bed)$/.exec(
    name
  )
  if (dyed && DYES[dyed[1]] !== undefined) return DYES[dyed[1]]
  if (/_ore$/.test(name)) return name.startsWith('deepslate') ? 0x505055 : 0x7d7d7d
  if (/coral/.test(name)) return 0xd36aa0
  if (
    /(flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose_bush|peony|lilac|sunflower|bush|sapling|vine|petals)/.test(
      name
    )
  ) {
    return 0x6fa83a
  }
  if (/glass/.test(name)) return 0xc0d8e0
  if (WOODS[name] !== undefined) return WOODS[name]
  return undefined
}

export function blockColor(fullName: string): number {
  const cached = colorCache.get(fullName)
  if (cached !== undefined) return cached
  const name = fullName.replace(/^minecraft:/, '')
  let color = lookup(name)
  if (color === undefined) {
    // 台阶、楼梯、墙、栅栏等：按原来的方块找颜色
    const base = name.replace(
      /_(?:stairs|slab|wall|fence|fence_gate|door|trapdoor|pressure_plate|button|sign|wall_sign|hanging_sign)$/,
      ''
    )
    color = lookup(base) ?? lookup(`${base}s`) ?? lookup(base.replace(/^(?:polished|smooth|cut|chiseled)_/, ''))
  }
  if (color === undefined) {
    // 认不出的方块（例如模组方块）：按名字算一个柔和的颜色，同一种方块颜色固定
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const gray = 0x70 + (h % 0x30)
    color = (gray << 16) | ((gray - 6) << 8) | (gray - 12)
  }
  colorCache.set(fullName, color)
  return color
}

// ---------- 区块 ----------

interface Section {
  names: string[]
  data: LongArray | null
  bits: number
}

interface ChunkColumns {
  /** 每一列最上面方块的 y，没有方块时为 null */
  top: (number | null)[]
  /** 每一列最上面方块的名字 */
  names: string[]
  /** 水下的地面高度（OCEAN_FLOOR），没有时为 null */
  floor: (number | null)[]
}

/** 高度图每个值的位数：按数组长度推算（世界高度 256 / 384 时是 9 位） */
function heightBits(arr: LongArray, spanning: boolean): number {
  if (spanning) return Math.round((arr.length * 64) / 256)
  for (let bits = 9; bits <= 16; bits++) if (Math.ceil(256 / Math.floor(64 / bits)) === arr.length) return bits
  return 9
}

function blockBits(paletteLength: number, data: LongArray, spanning: boolean): number {
  if (spanning) return Math.max(4, Math.round((data.length * 64) / 4096))
  const minimum = Math.max(4, Math.ceil(Math.log2(Math.max(2, paletteLength))))
  for (let bits = minimum; bits <= 16; bits++) {
    if (Math.ceil(4096 / Math.floor(64 / bits)) === data.length) return bits
  }
  return minimum
}

function parseChunk(root: { [key: string]: Tag }): ChunkColumns | null {
  const dataVersion = typeof root.DataVersion === 'number' ? root.DataVersion : 0
  // 1.13（17w47a）之前方块用数字保存，不支持
  if (dataVersion < 1451) return null
  const modern = dataVersion >= 2844
  const level = modern ? root : root.Level
  if (!isCompound(level)) return null
  const spanning = dataVersion < 2527
  const heightmaps = level.Heightmaps
  if (!isCompound(heightmaps)) return null
  const surface = heightmaps.WORLD_SURFACE ?? heightmaps.MOTION_BLOCKING
  if (!isLongArray(surface)) return null
  const oceanFloor = isLongArray(heightmaps.OCEAN_FLOOR) ? heightmaps.OCEAN_FLOOR : null
  const minY = modern && typeof level.yPos === 'number' ? level.yPos * 16 : 0

  const sections = new Map<number, Section>()
  const list = modern ? level.sections : level.Sections
  for (const raw of Array.isArray(list) ? list : []) {
    if (!isCompound(raw) || typeof raw.Y !== 'number') continue
    const states = modern ? raw.block_states : raw
    if (!isCompound(states)) continue
    const palette = modern ? states.palette : states.Palette
    const data = modern ? states.data : states.BlockStates
    if (!Array.isArray(palette) || palette.length === 0) continue
    const names = palette.map((p) => (isCompound(p) && typeof p.Name === 'string' ? p.Name : 'minecraft:air'))
    const view = isLongArray(data) ? data : null
    sections.set(raw.Y, { names, data: view, bits: view ? blockBits(names.length, view, spanning) : 0 })
  }

  const hBits = heightBits(surface, spanning)
  const fBits = oceanFloor ? heightBits(oceanFloor, spanning) : 0
  const top: (number | null)[] = new Array(256).fill(null)
  const names: string[] = new Array(256).fill('')
  const floor: (number | null)[] = new Array(256).fill(null)
  for (let i = 0; i < 256; i++) {
    const height = packed(surface, i, hBits, spanning)
    if (oceanFloor) {
      const f = packed(oceanFloor, i, fBits, spanning)
      floor[i] = f > 0 ? minY + f - 1 : null
    }
    if (height <= 0) continue
    const y = minY + height - 1
    const section = sections.get(Math.floor(y / 16))
    if (!section) continue
    const x = i & 15
    const z = i >> 4
    let name = section.names[0]
    if (section.data && section.names.length > 1) {
      const index = ((y & 15) * 16 + z) * 16 + x
      name = section.names[packed(section.data, index, section.bits, spanning)] ?? 'minecraft:air'
    }
    top[i] = y
    names[i] = name
  }
  return { top, names, floor }
}

/** 读取一个区块：还没有生成时返回 undefined，格式不支持或数据损坏时返回 null */
async function readChunk(region: Buffer, localX: number, localZ: number): Promise<ChunkColumns | null | undefined> {
  const entry = 4 * ((localX & 31) + (localZ & 31) * 32)
  const location = region.readUInt32BE(entry)
  const offset = (location >>> 8) * 4096
  const sectors = location & 0xff
  if (location === 0) return undefined
  if (offset < 8192 || sectors === 0 || offset + 5 > region.length) return null
  const length = region.readUInt32BE(offset)
  const compression = region[offset + 4]
  if (length < 1 || offset + 4 + length > region.length) return null
  const body = region.subarray(offset + 5, offset + 4 + length)
  let raw: Buffer
  // 1 gzip、2 zlib、3 不压缩；LZ4（1.20.5 起可选）和放在单独文件里的大区块不支持
  if (compression === 1) raw = await gunzipAsync(body, { maxOutputLength: MAX_CHUNK_SIZE })
  else if (compression === 2) raw = await inflateAsync(body, { maxOutputLength: MAX_CHUNK_SIZE })
  else if (compression === 3) raw = body
  else return null
  return parseChunk(new ChunkReader(raw).root())
}

// ---------- 画图 ----------

const shade = (color: number, factor: number): [number, number, number] => [
  Math.min(255, Math.round(((color >> 16) & 255) * factor)),
  Math.min(255, Math.round(((color >> 8) & 255) * factor)),
  Math.min(255, Math.round((color & 255) * factor))
]

const WATERY = new Set([
  'minecraft:water',
  'minecraft:bubble_column',
  'minecraft:kelp',
  'minecraft:kelp_plant',
  'minecraft:seagrass',
  'minecraft:tall_seagrass'
])

/**
 * 画出以 (centerX, centerZ) 为中心、边长 size 格的俯视图，返回 RGBA 像素（没有生成的区块透明）
 */
export async function renderWorldMap(
  versionId: string,
  folder: string,
  centerX: number,
  centerZ: number,
  size: number
): Promise<WorldMap> {
  if (!MAP_SIZES.includes(size as (typeof MAP_SIZES)[number])) throw new Error('无效的地图大小')
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ) || Math.abs(centerX) > 3e7 || Math.abs(centerZ) > 3e7) {
    throw new Error('无效的坐标')
  }
  const regionDir = await worldRegionDir(versionId, folder)
  const originX = Math.floor(centerX) - size / 2
  const originZ = Math.floor(centerZ) - size / 2
  const heights = new Int32Array(size * size).fill(-100000)
  const pixels = new Uint8Array(size * size * 4)
  const colors: number[] = new Array(size * size).fill(-1)
  const depths = new Float32Array(size * size)
  let chunks = 0
  let unsupported = 0

  const chunkX0 = Math.floor(originX / 16)
  const chunkZ0 = Math.floor(originZ / 16)
  const chunkX1 = Math.floor((originX + size - 1) / 16)
  const chunkZ1 = Math.floor((originZ + size - 1) / 16)
  const regions = new Map<string, Buffer | null>()
  const regionOf = async (rx: number, rz: number): Promise<Buffer | null> => {
    const key = `${rx},${rz}`
    if (!regions.has(key)) {
      const path = join(regionDir, `r.${rx}.${rz}.mca`)
      const info = await stat(path).catch(() => null)
      regions.set(
        key,
        info && info.isFile() && info.size >= 8192 && info.size <= MAX_REGION_SIZE ? await readFile(path) : null
      )
    }
    return regions.get(key) ?? null
  }

  const jobs: { cx: number; cz: number }[] = []
  for (let cz = chunkZ0; cz <= chunkZ1; cz++) for (let cx = chunkX0; cx <= chunkX1; cx++) jobs.push({ cx, cz })
  // 一次解压一批，解压在线程池里进行，不会卡住界面
  for (let i = 0; i < jobs.length; i += 32) {
    await Promise.all(
      jobs.slice(i, i + 32).map(async ({ cx, cz }) => {
        const region = await regionOf(Math.floor(cx / 32), Math.floor(cz / 32))
        if (!region) return
        let columns: ChunkColumns | null | undefined
        try {
          columns = await readChunk(region, cx & 31, cz & 31)
        } catch {
          columns = null
        }
        if (columns === undefined) return
        if (!columns) {
          unsupported++
          return
        }
        chunks++
        for (let j = 0; j < 256; j++) {
          const y = columns.top[j]
          if (y === null) continue
          const px = cx * 16 + (j & 15) - originX
          const pz = cz * 16 + (j >> 4) - originZ
          if (px < 0 || pz < 0 || px >= size || pz >= size) continue
          const k = pz * size + px
          heights[k] = y
          colors[k] = blockColor(columns.names[j])
          const floor = columns.floor[j]
          depths[k] = WATERY.has(columns.names[j]) && floor !== null ? Math.max(0, y - floor) : -1
        }
      })
    )
  }

  for (let k = 0; k < size * size; k++) {
    if (colors[k] < 0) continue
    let factor = 1
    if (depths[k] >= 0) {
      // 水越深颜色越深
      factor = Math.max(0.55, 1.05 - depths[k] * 0.035)
    } else if (k >= size) {
      // 和北边一格比较：高的亮一些、低的暗一些（和游戏里的地图一样）
      const north = heights[k - size]
      if (north > -100000) factor = heights[k] > north ? 1.12 : heights[k] < north ? 0.84 : 1
    }
    const [r, g, b] = shade(colors[k], factor)
    pixels[k * 4] = r
    pixels[k * 4 + 1] = g
    pixels[k * 4 + 2] = b
    pixels[k * 4 + 3] = 255
  }

  return {
    size,
    originX,
    originZ,
    pixels,
    chunks,
    unsupported: chunks === 0 && unsupported > 0
  }
}
