import { resolveSrv } from 'dns/promises'
import { connect, isIP, type Socket } from 'net'
import type { MotdSegment, ServerStatus } from '../shared/types'

const TIMEOUT = 6000
/** 状态响应最大 1 MB（正常只有几 KB，带图标也不超过 100 KB） */
const MAX_PACKET = 1024 * 1024
const MAX_FAVICON = 128 * 1024
/** 握手时声明的协议版本：-1 表示只查询状态 */
const PROTOCOL = -1

/** 解析服务器地址：支持 host、host:port、[IPv6]:port；没写端口时查询 SRV 记录 */
export function parseAddress(address: string): { host: string; port?: number } {
  const text = address.trim()
  if (!text) throw new Error('请填写服务器地址')
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(text)
  let host: string
  let port: string | undefined
  if (v6) {
    host = v6[1]
    port = v6[2]
  } else if (isIP(text) === 6) {
    host = text
  } else {
    const index = text.lastIndexOf(':')
    host = index >= 0 ? text.slice(0, index) : text
    port = index >= 0 ? text.slice(index + 1) : undefined
  }
  if (!host || /[\s/\\@]/.test(host)) throw new Error('服务器地址格式不正确')
  if (port !== undefined) {
    const n = Number(port)
    if (!/^\d+$/.test(port) || n < 1 || n > 65535) throw new Error('端口号应在 1 ~ 65535 之间')
    return { host, port: n }
  }
  return { host }
}

/** 没写端口时，按 _minecraft._tcp SRV 记录解析真实的地址和端口 */
async function resolveTarget(address: string): Promise<{ host: string; port: number }> {
  const { host, port } = parseAddress(address)
  if (port !== undefined) return { host, port }
  if (!isIP(host)) {
    try {
      const [record] = await resolveSrv(`_minecraft._tcp.${host}`)
      if (record) return { host: record.name, port: record.port }
    } catch {
      // 没有 SRV 记录时使用默认端口
    }
  }
  return { host, port: 25565 }
}

function varint(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  do {
    let byte = v & 0x7f
    v >>>= 7
    if (v !== 0) byte |= 0x80
    bytes.push(byte)
  } while (v !== 0)
  return Buffer.from(bytes)
}

function mcString(text: string): Buffer {
  const data = Buffer.from(text, 'utf-8')
  return Buffer.concat([varint(data.length), data])
}

function packet(id: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat([varint(id), ...parts])
  return Buffer.concat([varint(body.length), body])
}

/** 从缓冲区读 VarInt，数据不够时返回 null */
function readVarint(buf: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null
    const byte = buf[offset + i]
    value |= (byte & 0x7f) << (7 * i)
    if ((byte & 0x80) === 0) return { value, size: i + 1 }
  }
  throw new Error('服务器返回的数据格式不正确')
}

/** 按顺序读取完整的数据包 */
class PacketReader {
  private buf = Buffer.alloc(0)
  private waiters: (() => void)[] = []
  private error: Error | null = null

  constructor(socket: Socket) {
    socket.on('data', (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk])
      if (this.buf.length > MAX_PACKET + 10) this.fail(new Error('服务器返回的数据过大'))
      this.wake()
    })
    socket.on('error', (e) => this.fail(e))
    socket.on('close', () => this.fail(new Error('服务器关闭了连接')))
  }

  private fail(e: Error): void {
    if (!this.error) this.error = e
    this.wake()
  }

  private wake(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const w of waiters) w()
  }

  async next(): Promise<{ id: number; data: Buffer }> {
    for (;;) {
      const length = readVarint(this.buf, 0)
      if (length) {
        if (length.value < 1 || length.value > MAX_PACKET) throw new Error('服务器返回的数据格式不正确')
        const end = length.size + length.value
        if (this.buf.length >= end) {
          const body = this.buf.subarray(length.size, end)
          this.buf = this.buf.subarray(end)
          const id = readVarint(body, 0)
          if (!id) throw new Error('服务器返回的数据格式不正确')
          return { id: id.value, data: body.subarray(id.size) }
        }
      }
      if (this.error) throw this.error
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
  }
}

const COLORS: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF'
}
const CODE_COLORS = '0123456789abcdef'
const CODE_NAMES = Object.keys(COLORS)

interface Style {
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
}

/** 把带 § 格式代码的文字拆成带样式的片段 */
function pushLegacy(segments: MotdSegment[], text: string, base: Style): void {
  let style: Style = { ...base }
  const parts = text.split('§')
  if (parts[0]) segments.push({ text: parts[0], ...style })
  for (const part of parts.slice(1)) {
    const code = part[0]?.toLowerCase()
    const rest = part.slice(1)
    if (code && CODE_COLORS.includes(code)) style = { ...base, color: COLORS[CODE_NAMES[CODE_COLORS.indexOf(code)]] }
    else if (code === 'l') style = { ...style, bold: true }
    else if (code === 'o') style = { ...style, italic: true }
    else if (code === 'n') style = { ...style, underlined: true }
    else if (code === 'm') style = { ...style, strikethrough: true }
    else if (code === 'r') style = { ...base }
    if (rest) segments.push({ text: rest, ...style })
  }
}

/** 把服务器简介（字符串或文本组件）转成带颜色的片段 */
export function motdSegments(
  value: unknown,
  inherited: Style = {},
  segments: MotdSegment[] = [],
  depth = 0
): MotdSegment[] {
  if (depth > 16 || segments.length > 200) return segments
  if (typeof value === 'string') {
    pushLegacy(segments, value, inherited)
  } else if (Array.isArray(value)) {
    for (const item of value) motdSegments(item, inherited, segments, depth + 1)
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const color =
      typeof obj.color === 'string'
        ? (COLORS[obj.color] ?? (/^#[0-9a-f]{6}$/i.test(obj.color) ? obj.color : undefined))
        : undefined
    const style: Style = {
      color: color ?? inherited.color,
      bold: typeof obj.bold === 'boolean' ? obj.bold : inherited.bold,
      italic: typeof obj.italic === 'boolean' ? obj.italic : inherited.italic,
      underlined: typeof obj.underlined === 'boolean' ? obj.underlined : inherited.underlined,
      strikethrough: typeof obj.strikethrough === 'boolean' ? obj.strikethrough : inherited.strikethrough
    }
    if (typeof obj.text === 'string' || typeof obj.text === 'number') pushLegacy(segments, String(obj.text), style)
    else if (typeof obj.translate === 'string') pushLegacy(segments, obj.translate, style)
    if (obj.extra) motdSegments(obj.extra, style, segments, depth + 1)
  }
  return segments
}

/** 查询服务器状态（Server List Ping，1.7 及以上的服务器） */
export async function pingServer(address: string): Promise<ServerStatus> {
  const { host, port } = await resolveTarget(address)
  const socket = connect({ host, port })
  socket.setNoDelay(true)
  const timer = setTimeout(() => socket.destroy(new Error('连接超时')), TIMEOUT)
  try {
    const reader = new PacketReader(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    const handshake = packet(
      0x00,
      varint(PROTOCOL),
      mcString(host),
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      varint(1)
    )
    const requestedAt = Date.now()
    socket.write(Buffer.concat([handshake, packet(0x00)]))
    const response = await reader.next()
    const statusTime = Date.now() - requestedAt
    if (response.id !== 0x00) throw new Error('服务器返回的数据格式不正确')
    const length = readVarint(response.data, 0)
    if (!length) throw new Error('服务器返回的数据格式不正确')
    const json = JSON.parse(response.data.subarray(length.size, length.size + length.value).toString('utf-8')) as {
      version?: { name?: unknown; protocol?: unknown }
      players?: { online?: unknown; max?: unknown; sample?: { name?: unknown }[] }
      description?: unknown
      favicon?: unknown
    }

    // 再发一个 ping 包测量延迟
    const sentAt = Date.now()
    const payload = Buffer.alloc(8)
    payload.writeBigInt64BE(BigInt(sentAt))
    socket.write(packet(0x01, payload))
    let latency: number | undefined
    try {
      // 部分服务器不回应 ping，最多等 2 秒，之后只显示状态
      const pong = await Promise.race([
        reader.next(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
      ])
      if (pong?.id === 0x01) latency = Date.now() - sentAt
    } catch {
      // 回应 ping 时断开连接也不影响状态
    }

    const favicon =
      typeof json.favicon === 'string' &&
      json.favicon.startsWith('data:image/png;base64,') &&
      json.favicon.length <= MAX_FAVICON
        ? json.favicon
        : undefined
    const sample = Array.isArray(json.players?.sample)
      ? json.players.sample
          .map((p) => (typeof p?.name === 'string' ? p.name.replace(/§./g, '') : ''))
          .filter(Boolean)
          .slice(0, 12)
      : []
    return {
      online: true,
      // 服务器不回应 ping 时，用状态查询的耗时代替
      latency: latency ?? statusTime,
      version: typeof json.version?.name === 'string' ? json.version.name.replace(/§./g, '').slice(0, 80) : '',
      protocol: typeof json.version?.protocol === 'number' ? json.version.protocol : undefined,
      players: {
        online: typeof json.players?.online === 'number' ? json.players.online : 0,
        max: typeof json.players?.max === 'number' ? json.players.max : 0,
        sample
      },
      motd: motdSegments(json.description).slice(0, 100),
      favicon
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const code = (e as NodeJS.ErrnoException).code
    const friendly =
      code === 'ENOTFOUND' || code === 'EAI_AGAIN'
        ? '找不到这个服务器地址'
        : code === 'ECONNREFUSED'
          ? '服务器拒绝连接（可能没有开启）'
          : code === 'ETIMEDOUT' || message === '连接超时'
            ? '连接超时'
            : code === 'ENETUNREACH' || code === 'EHOSTUNREACH'
              ? '网络不可达'
              : e instanceof SyntaxError
                ? '服务器返回的数据格式不正确'
                : message
    return { online: false, error: friendly, motd: [], version: '', players: { online: 0, max: 0, sample: [] } }
  } finally {
    clearTimeout(timer)
    socket.destroy()
  }
}
