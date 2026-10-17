import { gunzipSync, inflateSync } from 'zlib'

/** NBT 解析结果：复合标签为对象，列表与数组为数组，long 转为 number */
export type NbtValue = number | string | NbtValue[] | { [key: string]: NbtValue } | number[]
export type NbtCompound = { [key: string]: NbtValue }

const MAX_DEPTH = 64
/** level.dat 解压后不会很大，限制大小防止异常文件占满内存 */
const MAX_SIZE = 32 * 1024 * 1024

class Reader {
  offset = 0
  constructor(private readonly buf: Buffer) {}

  private need(n: number): void {
    if (n < 0 || this.offset + n > this.buf.length) throw new Error('NBT 数据不完整')
  }
  byte(): number {
    this.need(1)
    return this.buf.readInt8(this.offset++)
  }
  short(): number {
    this.need(2)
    const v = this.buf.readInt16BE(this.offset)
    this.offset += 2
    return v
  }
  int(): number {
    this.need(4)
    const v = this.buf.readInt32BE(this.offset)
    this.offset += 4
    return v
  }
  long(): number {
    this.need(8)
    const v = this.buf.readBigInt64BE(this.offset)
    this.offset += 8
    return Number(v)
  }
  float(): number {
    this.need(4)
    const v = this.buf.readFloatBE(this.offset)
    this.offset += 4
    return v
  }
  double(): number {
    this.need(8)
    const v = this.buf.readDoubleBE(this.offset)
    this.offset += 8
    return v
  }
  string(): string {
    const length = this.buf.readUInt16BE((this.need(2), this.offset))
    this.offset += 2
    this.need(length)
    // NBT 使用 Java 的 modified UTF-8，普通文字与标准 UTF-8 相同
    const v = this.buf.toString('utf-8', this.offset, this.offset + length)
    this.offset += length
    return v
  }
  /** 数组长度：不能为负，也不能超过剩余数据 */
  length(itemSize: number): number {
    const n = this.int()
    if (n < 0 || n * itemSize > this.buf.length - this.offset) throw new Error('NBT 数组长度无效')
    return n
  }

  payload(type: number, depth: number): NbtValue {
    if (depth > MAX_DEPTH) throw new Error('NBT 嵌套过深')
    switch (type) {
      case 1:
        return this.byte()
      case 2:
        return this.short()
      case 3:
        return this.int()
      case 4:
        return this.long()
      case 5:
        return this.float()
      case 6:
        return this.double()
      case 7: {
        const n = this.length(1)
        return Array.from({ length: n }, () => this.byte())
      }
      case 8:
        return this.string()
      case 9: {
        const itemType = this.byte()
        const n = this.length(itemType === 0 ? 0 : 1)
        if (itemType === 0) return []
        return Array.from({ length: n }, () => this.payload(itemType, depth + 1))
      }
      case 10: {
        const result: NbtCompound = {}
        for (;;) {
          const tag = this.byte()
          if (tag === 0) return result
          const name = this.string()
          result[name] = this.payload(tag, depth + 1)
        }
      }
      case 11: {
        const n = this.length(4)
        return Array.from({ length: n }, () => this.int())
      }
      case 12: {
        const n = this.length(8)
        return Array.from({ length: n }, () => this.long())
      }
      default:
        throw new Error(`未知的 NBT 类型：${type}`)
    }
  }
}

/** 解析 NBT 文件（自动识别 gzip / zlib 压缩），返回根复合标签 */
export function parseNbt(data: Buffer): NbtCompound {
  let buf = data
  if (data[0] === 0x1f && data[1] === 0x8b) buf = gunzipSync(data, { maxOutputLength: MAX_SIZE })
  else if (data[0] === 0x78) buf = inflateSync(data, { maxOutputLength: MAX_SIZE })
  const reader = new Reader(buf)
  if (reader.byte() !== 10) throw new Error('不是有效的 NBT 文件')
  reader.string()
  return reader.payload(10, 0) as NbtCompound
}
