import { open, readdir, readFile, rename, rm, stat } from 'fs/promises'
import { join } from 'path'
import { crc32, deflateRaw } from 'zlib'
import { promisify } from 'util'

const deflate = promisify(deflateRaw)
/** 不使用 ZIP64，单个 zip 的大小与文件数有上限 */
const MAX_OFFSET = 0xffffffff
const MAX_ENTRIES = 0xffff

/** 转换为 zip 使用的 DOS 日期时间 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

interface CentralEntry {
  name: Buffer
  method: number
  crc: number
  compressedSize: number
  size: number
  time: number
  date: number
  offset: number
  directory: boolean
}

/** 递归列出文件夹内容（相对路径，使用 /），文件夹以 / 结尾 */
async function walk(root: string, skip: (rel: string) => boolean, rel = ''): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(join(root, rel), { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (skip(path)) continue
    if (entry.isDirectory()) {
      result.push(`${path}/`)
      result.push(...(await walk(root, skip, path)))
    } else if (entry.isFile()) {
      result.push(path)
    }
  }
  return result
}

/**
 * 把文件夹打包成 zip（zip 内的文件放在 rootName 文件夹下）。
 * 先写临时文件，完成后再改名，中途失败不会留下损坏的 zip
 */
export async function zipDirectory(
  srcDir: string,
  destFile: string,
  rootName: string,
  skip: (rel: string) => boolean = () => false
): Promise<{ files: number; size: number }> {
  const paths = await walk(srcDir, skip)
  if (paths.length + 1 > MAX_ENTRIES) throw new Error('文件太多，无法打包，请手动备份')
  const tmp = `${destFile}.tmp`
  const handle = await open(tmp, 'w')
  const central: CentralEntry[] = []
  let offset = 0
  let files = 0
  const write = async (buf: Buffer): Promise<void> => {
    await handle.write(buf)
    offset += buf.length
    if (offset > MAX_OFFSET) throw new Error('存档太大（超过 4 GB），请手动备份')
  }

  try {
    for (const rel of [`${rootName}/`, ...paths.map((p) => `${rootName}/${p}`)]) {
      const directory = rel.endsWith('/')
      const source = join(srcDir, rel.slice(rootName.length + 1))
      const info = await stat(source)
      const data = directory ? Buffer.alloc(0) : await readFile(source)
      if (data.length > MAX_OFFSET) throw new Error('存档中有超过 4 GB 的文件，请手动备份')
      const crc = directory ? 0 : crc32(data)
      let body = data
      let method = 0
      if (!directory && data.length > 0) {
        const compressed = await deflate(data)
        if (compressed.length < data.length) {
          body = compressed
          method = 8
        }
      }
      const name = Buffer.from(rel, 'utf-8')
      const { time, date } = dosDateTime(info.mtime)
      const header = Buffer.alloc(30)
      header.writeUInt32LE(0x04034b50, 0)
      header.writeUInt16LE(20, 4)
      header.writeUInt16LE(0x0800, 6) // 文件名使用 UTF-8
      header.writeUInt16LE(method, 8)
      header.writeUInt16LE(time, 10)
      header.writeUInt16LE(date, 12)
      header.writeUInt32LE(crc, 14)
      header.writeUInt32LE(body.length, 18)
      header.writeUInt32LE(data.length, 22)
      header.writeUInt16LE(name.length, 26)
      header.writeUInt16LE(0, 28)
      central.push({
        name,
        method,
        crc,
        compressedSize: body.length,
        size: data.length,
        time,
        date,
        offset,
        directory
      })
      await write(header)
      await write(name)
      if (body.length > 0) await write(body)
      if (!directory) files++
    }

    const centralStart = offset
    for (const entry of central) {
      const record = Buffer.alloc(46)
      record.writeUInt32LE(0x02014b50, 0)
      record.writeUInt16LE(20, 4)
      record.writeUInt16LE(20, 6)
      record.writeUInt16LE(0x0800, 8)
      record.writeUInt16LE(entry.method, 10)
      record.writeUInt16LE(entry.time, 12)
      record.writeUInt16LE(entry.date, 14)
      record.writeUInt32LE(entry.crc, 16)
      record.writeUInt32LE(entry.compressedSize, 20)
      record.writeUInt32LE(entry.size, 24)
      record.writeUInt16LE(entry.name.length, 28)
      record.writeUInt32LE(entry.directory ? 0x10 : 0, 38)
      record.writeUInt32LE(entry.offset, 42)
      await write(record)
      await write(entry.name)
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(central.length, 8)
    end.writeUInt16LE(central.length, 10)
    end.writeUInt32LE(offset - centralStart, 12)
    end.writeUInt32LE(centralStart, 16)
    await write(end)
    await handle.close()
    await rename(tmp, destFile)
    return { files, size: offset }
  } catch (e) {
    await handle.close().catch(() => undefined)
    await rm(tmp, { force: true })
    throw e
  }
}
