/**
 * 投影文件管理（Litematica）：版本游戏目录下 schematics 文件夹里的 .litematic 文件。
 * .litematic 是 gzip 压缩的 NBT：
 *   Metadata { Name, Author, Description, EnclosingSize{x,y,z}, TotalBlocks, TotalVolume, RegionCount,
 *              TimeCreated, TimeModified, PreviewImageData(int[] ARGB) }
 *   Regions { <名字> { Size{x,y,z}, BlockStatePalette[{Name, Properties}], BlockStates(long[]) } }
 * BlockStates 把每个方块在调色板里的序号按位紧密排列（每个占 max(2, ceil(log2(调色板大小))) 位，
 * 可以跨过两个 long），统计各序号出现的次数就得到材料清单。
 * 这里用一个专门的 NBT 读取器：long 数组保留原始字节，不转成数字（投影可能很大）
 */
import { BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { copyFile, lstat, mkdir, readdir, readFile, stat } from 'fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'path'
import { gunzipSync } from 'zlib'
import { getSettings } from './config'
import { listMods, modsContextOf } from './mods'
import type { SchematicDetails, SchematicFile, SchematicList, SchematicMaterial } from '../shared/types'

const EXTENSIONS = ['.litematic', '.schem', '.schematic', '.nbt']
const MAX_FILES = 500
const MAX_DEPTH = 4
/** 压缩文件最大大小、解压后最大大小 */
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_UNPACKED = 256 * 1024 * 1024
/** 最多统计多少个方块（太大的投影只显示基本信息） */
const MAX_COUNT_VOLUME = 80_000_000
const MAX_ELEMENTS = 4_000_000
const MAX_NBT_DEPTH = 64

// ---------- NBT 读取（long 数组保留为 Buffer） ----------

type Tag = number | bigint | string | Tag[] | { [key: string]: Tag } | number[] | Buffer

class Reader {
  offset = 0
  private elements = 0
  constructor(private readonly buf: Buffer) {}
  private need(n: number): void {
    if (n < 0 || this.offset + n > this.buf.length) throw new Error('投影文件不完整')
  }
  private count(n: number): void {
    this.elements += n
    if (this.elements > MAX_ELEMENTS) throw new Error('投影文件太复杂')
  }
  private len(itemSize: number): number {
    this.need(4)
    const n = this.buf.readInt32BE(this.offset)
    this.offset += 4
    if (n < 0 || n * itemSize > this.buf.length - this.offset) throw new Error('投影文件已损坏')
    return n
  }
  byte(): number {
    this.need(1)
    return this.buf.readInt8(this.offset++)
  }
  string(): string {
    this.need(2)
    const length = this.buf.readUInt16BE(this.offset)
    this.offset += 2
    this.need(length)
    const v = this.buf.toString('utf-8', this.offset, this.offset + length)
    this.offset += length
    return v
  }
  payload(type: number, depth: number): Tag {
    if (depth > MAX_NBT_DEPTH) throw new Error('投影文件已损坏')
    this.count(1)
    const b = this.buf
    switch (type) {
      case 1:
        return this.byte()
      case 2:
        this.need(2)
        this.offset += 2
        return b.readInt16BE(this.offset - 2)
      case 3:
        this.need(4)
        this.offset += 4
        return b.readInt32BE(this.offset - 4)
      case 4:
        this.need(8)
        this.offset += 8
        return b.readBigInt64BE(this.offset - 8)
      case 5:
        this.need(4)
        this.offset += 4
        return b.readFloatBE(this.offset - 4)
      case 6:
        this.need(8)
        this.offset += 8
        return b.readDoubleBE(this.offset - 8)
      case 7: {
        const n = this.len(1)
        this.offset += n
        return []
      }
      case 8:
        return this.string()
      case 9: {
        const itemType = this.byte()
        const n = this.len(itemType === 0 ? 0 : 1)
        this.count(n)
        if (itemType === 0) return []
        return Array.from({ length: n }, () => this.payload(itemType, depth + 1))
      }
      case 10: {
        const result = Object.create(null) as { [key: string]: Tag }
        for (;;) {
          const tag = this.byte()
          if (tag === 0) return result
          const name = this.string()
          result[name] = this.payload(tag, depth + 1)
        }
      }
      case 11: {
        const n = this.len(4)
        this.count(n)
        const out = new Array<number>(n)
        for (let i = 0; i < n; i++) out[i] = b.readInt32BE(this.offset + i * 4)
        this.offset += n * 4
        return out
      }
      case 12: {
        const n = this.len(8)
        const raw = b.subarray(this.offset, this.offset + n * 8)
        this.offset += n * 8
        return raw
      }
      default:
        throw new Error('投影文件已损坏')
    }
  }
}

function parse(data: Buffer): { [key: string]: Tag } {
  let buf = data
  if (data[0] === 0x1f && data[1] === 0x8b) {
    try {
      buf = gunzipSync(data, { maxOutputLength: MAX_UNPACKED })
    } catch {
      throw new Error('投影文件太大或已损坏')
    }
  }
  const reader = new Reader(buf)
  if (reader.byte() !== 10) throw new Error('不是有效的投影文件')
  reader.string()
  return reader.payload(10, 0) as { [key: string]: Tag }
}

const obj = (v: Tag | undefined): { [key: string]: Tag } =>
  v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) ? (v as { [key: string]: Tag }) : {}
const num = (v: Tag | undefined): number => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : 0)
const str = (v: Tag | undefined, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '')

// ---------- 文件位置 ----------

async function dirOf(versionId: string): Promise<string> {
  const ctx = await modsContextOf(versionId)
  return join(dirname(ctx.dir), 'schematics')
}

/** 文件只能在投影文件夹里，不能用 ../ 跳出去，也不跟随符号链接 */
async function resolveFile(versionId: string, name: unknown): Promise<string> {
  if (typeof name !== 'string' || !name || name.includes('\0')) throw new Error('无效的文件名')
  const dir = await dirOf(versionId)
  const path = resolve(dir, name)
  if (!path.startsWith(dir + sep)) throw new Error('无效的文件名')
  if (!EXTENSIONS.includes(extname(path).toLowerCase())) throw new Error('不是投影文件')
  const info = await lstat(path).catch(() => null)
  if (!info || !info.isFile()) throw new Error('找不到这个投影文件')
  return path
}

// ---------- 读取信息 ----------

interface Meta {
  title: string
  author: string
  description: string
  size: { x: number; y: number; z: number } | null
  totalBlocks: number
  regions: number
  created: number
}

const metaCache = new Map<string, { key: string; meta: Meta | null }>()

function readMeta(root: { [key: string]: Tag }): Meta {
  const m = obj(root.Metadata)
  const size = obj(m.EnclosingSize)
  return {
    title: str(m.Name, 100),
    author: str(m.Author, 60),
    description: str(m.Description, 500),
    size: m.EnclosingSize ? { x: Math.abs(num(size.x)), y: Math.abs(num(size.y)), z: Math.abs(num(size.z)) } : null,
    totalBlocks: num(m.TotalBlocks),
    regions: num(m.RegionCount) || Object.keys(obj(root.Regions)).length,
    created: num(m.TimeCreated)
  }
}

async function walk(dir: string, base: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path, base, depth + 1, out)
    else if (entry.isFile() && EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
      out.push(relative(base, path))
    }
  }
}

/** Litematica 模组装了没有（只是提示用） */
async function hasLitematica(versionId: string): Promise<boolean | null> {
  try {
    const list = await listMods(versionId)
    if (!list.loader || list.loader === 'optifine') return null
    return list.mods.some((m) => m.enabled && m.modId.toLowerCase() === 'litematica')
  } catch {
    return null
  }
}

export async function listSchematics(versionId: string): Promise<SchematicList> {
  const dir = await dirOf(versionId)
  const names: string[] = []
  await walk(dir, dir, 0, names)
  const files: SchematicFile[] = []
  for (const name of names) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const format = extname(name).slice(1).toLowerCase()
    const file: SchematicFile = { name, format, size: info.size, modified: info.mtimeMs }
    if (format === 'litematic' && info.size <= MAX_FILE_BYTES) {
      const key = `${info.size}:${info.mtimeMs}`
      let cached = metaCache.get(path)
      if (cached?.key !== key) {
        let meta: Meta | null = null
        try {
          meta = readMeta(parse(await readFile(path)))
        } catch {
          meta = null
        }
        cached = { key, meta }
        metaCache.set(path, cached)
      }
      const meta = cached.meta
      if (meta) {
        Object.assign(file, {
          title: meta.title,
          author: meta.author,
          description: meta.description,
          dims: meta.size,
          totalBlocks: meta.totalBlocks,
          regions: meta.regions,
          created: meta.created
        })
      } else {
        file.broken = true
      }
    }
    files.push(file)
  }
  files.sort((a, b) => b.modified - a.modified)
  return { dir, files, litematica: await hasLitematica(versionId), truncated: names.length >= MAX_FILES }
}

// ---------- 材料清单 ----------

const SKIP = new Set([
  'air',
  'cave_air',
  'void_air',
  'piston_head',
  'moving_piston',
  'nether_portal',
  'end_portal',
  'end_gateway',
  'fire',
  'soul_fire',
  'bubble_column',
  'light'
])

/** 方块对应的物品（墙上的火把、农作物、红石线等） */
const ITEM_OF: Record<string, string> = {
  wall_torch: 'torch',
  soul_wall_torch: 'soul_torch',
  redstone_wall_torch: 'redstone_torch',
  redstone_wire: 'redstone',
  tripwire: 'string',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  wheat: 'wheat_seeds',
  cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries',
  melon_stem: 'melon_seeds',
  attached_melon_stem: 'melon_seeds',
  pumpkin_stem: 'pumpkin_seeds',
  attached_pumpkin_stem: 'pumpkin_seeds',
  bamboo_sapling: 'bamboo',
  kelp_plant: 'kelp',
  cave_vines: 'glow_berries',
  cave_vines_plant: 'glow_berries',
  twisting_vines_plant: 'twisting_vines',
  weeping_vines_plant: 'weeping_vines',
  big_dripleaf_stem: 'big_dripleaf',
  powder_snow: 'powder_snow_bucket',
  water: 'water_bucket',
  lava: 'lava_bucket',
  torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod',
  tall_seagrass: 'seagrass'
}

/** 一个方块状态算几个物品；0 表示不算（门的上半、床头、流动的水） */
function itemFor(name: string, props: { [key: string]: Tag }): { id: string; count: number } {
  const id = name.replace(/^minecraft:/, '')
  if (!name.startsWith('minecraft:') && name.includes(':')) return { id: name, count: 1 }
  if (SKIP.has(id)) return { id, count: 0 }
  const p = (k: string): string => str(props[k], 20)
  if (p('half') === 'upper') return { id, count: 0 }
  if (id.endsWith('_bed') && p('part') === 'head') return { id, count: 0 }
  if ((id === 'water' || id === 'lava') && p('level') !== '0' && p('level') !== '') return { id, count: 0 }
  if (id.startsWith('potted_')) return { id: 'flower_pot', count: 1 }
  let item = ITEM_OF[id] ?? id
  // 墙上的告示牌、旗帜、头颅、珊瑚扇
  item = item
    .replace(/_wall_hanging_sign$/, '_hanging_sign')
    .replace(/_wall_sign$/, '_sign')
    .replace(/_wall_banner$/, '_banner')
    .replace(/_wall_head$/, '_head')
    .replace(/_wall_skull$/, '_skull')
    .replace(/_wall_fan$/, '_fan')
  let count = 1
  if (id.endsWith('_slab') && p('type') === 'double') count = 2
  const amount = Number(p('candles') || p('pickles') || p('eggs') || p('layers') || p('flower_amount') || 0)
  if (Number.isInteger(amount) && amount > 1 && amount <= 8) count = amount
  return { id: item, count }
}

/** 游戏语言文件里的中文名（从已经下载的游戏资源里读，没有时显示 ID） */
let zhNames: { dir: string; names: Map<string, string> } | null = null

async function chineseNames(): Promise<Map<string, string>> {
  const assets = join((await getSettings()).gameDir, 'assets')
  if (zhNames?.dir === assets) return zhNames.names
  const names = new Map<string, string>()
  try {
    const indexes = join(assets, 'indexes')
    const files = await Promise.all(
      (await readdir(indexes))
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => ({ f, t: (await stat(join(indexes, f))).mtimeMs }))
    )
    files.sort((a, b) => b.t - a.t)
    for (const { f } of files) {
      const index = JSON.parse(await readFile(join(indexes, f), 'utf-8')) as {
        objects?: Record<string, { hash?: string }>
      }
      const hash = index.objects?.['minecraft/lang/zh_cn.json']?.hash
      if (!hash || !/^[0-9a-f]{40}$/.test(hash)) continue
      const lang = JSON.parse(await readFile(join(assets, 'objects', hash.slice(0, 2), hash), 'utf-8')) as Record<
        string,
        unknown
      >
      for (const [key, value] of Object.entries(lang)) {
        const m = /^(block|item)\.minecraft\.([a-z0-9_]+)$/.exec(key)
        if (m && typeof value === 'string' && (m[1] === 'item' || !names.has(m[2]))) names.set(m[2], value)
      }
      break
    }
  } catch {
    // 没有下载过游戏资源
  }
  zhNames = { dir: assets, names }
  return names
}

/** 读取投影的详细信息和材料清单 */
export async function schematicDetails(versionId: string, name: unknown): Promise<SchematicDetails> {
  const path = await resolveFile(versionId, name)
  if (extname(path).toLowerCase() !== '.litematic') throw new Error('只能查看 .litematic 投影的材料清单')
  const info = await stat(path)
  if (info.size > MAX_FILE_BYTES) throw new Error('投影文件太大，无法读取')
  const root = parse(await readFile(path))
  const meta = readMeta(root)
  const counts = new Map<string, number>()
  let volume = 0
  let counted = true
  for (const region of Object.values(obj(root.Regions))) {
    const r = obj(region)
    const size = obj(r.Size)
    const v = Math.abs(num(size.x)) * Math.abs(num(size.y)) * Math.abs(num(size.z))
    volume += v
    const palette = Array.isArray(r.BlockStatePalette) ? (r.BlockStatePalette as Tag[]) : []
    const states = r.BlockStates
    // 太大的投影不统计（只显示基本信息）
    if (volume > MAX_COUNT_VOLUME) {
      counted = false
      continue
    }
    if (palette.length === 0 || !Buffer.isBuffer(states) || v === 0) continue
    const bits = Math.max(2, 32 - Math.clz32(palette.length - 1))
    if (states.length < Math.ceil((v * bits) / 8)) throw new Error('投影文件已损坏')
    // long 是大端存储；把每个 long 拆成低 32 位、高 32 位，按位顺序排成一串
    const words = new Uint32Array(states.length / 4 + 1)
    for (let j = 0; j < states.length / 8; j++) {
      words[2 * j] = states.readUInt32BE(j * 8 + 4)
      words[2 * j + 1] = states.readUInt32BE(j * 8)
    }
    const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1
    const perIndex = new Float64Array(palette.length)
    for (let i = 0, pos = 0; i < v; i++, pos += bits) {
      const w = Math.floor(pos / 32)
      const off = pos % 32
      let value = words[w] >>> off
      if (off + bits > 32) value |= words[w + 1] << (32 - off)
      value = (value & mask) >>> 0
      if (value < palette.length) perIndex[value]++
    }
    palette.forEach((entry, index) => {
      if (perIndex[index] === 0) return
      const e = obj(entry)
      const { id, count } = itemFor(str(e.Name, 100), obj(e.Properties))
      if (count === 0) return
      counts.set(id, (counts.get(id) ?? 0) + perIndex[index] * count)
    })
  }
  const zh = await chineseNames()
  const materials: SchematicMaterial[] = [...counts.entries()]
    .map(([id, count]) => ({ id, name: zh.get(id) ?? '', count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
  return { ...meta, name: String(name), volume, materials, counted, preview: previewImage(obj(root.Metadata)) }
}

/** Litematica 保存的预览图（ARGB 整数数组，正方形） */
function previewImage(meta: { [key: string]: Tag }): string {
  const data = meta.PreviewImageData
  if (!Array.isArray(data) || data.length === 0) return ''
  const side = Math.round(Math.sqrt(data.length))
  if (side * side !== data.length || side > 512) return ''
  const bgra = Buffer.alloc(data.length * 4)
  ;(data as number[]).forEach((argb, i) => {
    bgra[i * 4] = argb & 0xff
    bgra[i * 4 + 1] = (argb >> 8) & 0xff
    bgra[i * 4 + 2] = (argb >> 16) & 0xff
    bgra[i * 4 + 3] = (argb >>> 24) & 0xff
  })
  try {
    return nativeImage.createFromBitmap(bgra, { width: side, height: side }).toDataURL()
  } catch {
    return ''
  }
}

// ---------- 文件操作 ----------

export async function addSchematics(versionId: string, win: BrowserWindow | null): Promise<number> {
  const options: Electron.OpenDialogOptions = {
    title: '添加投影文件',
    filters: [{ name: '投影文件', extensions: EXTENSIONS.map((e) => e.slice(1)) }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return 0
  const dir = await dirOf(versionId)
  await mkdir(dir, { recursive: true })
  let added = 0
  for (const source of result.filePaths.slice(0, 100)) {
    const ext = extname(source).toLowerCase()
    if (!EXTENSIONS.includes(ext)) continue
    const info = await stat(source).catch(() => null)
    if (!info?.isFile() || info.size > MAX_FILE_BYTES) continue
    // 同名时加上序号，不覆盖已有的投影
    const stem = basename(source, extname(source))
    let target = join(dir, basename(source))
    for (let i = 2; await stat(target).catch(() => null); i++) target = join(dir, `${stem} (${i})${ext}`)
    await copyFile(source, target)
    added++
  }
  return added
}

export async function deleteSchematic(versionId: string, name: unknown): Promise<void> {
  const path = await resolveFile(versionId, name)
  await shell.trashItem(path)
  metaCache.delete(path)
}

export async function openSchematicsDir(versionId: string): Promise<void> {
  const dir = await dirOf(versionId)
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

/** 在文件管理器里选中这个投影 */
export async function showSchematic(versionId: string, name: unknown): Promise<void> {
  shell.showItemInFolder(await resolveFile(versionId, name))
}
