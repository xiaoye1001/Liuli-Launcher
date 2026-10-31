/**
 * 多人联机（MultiplayerService）：三种联机方式共用一套「本地转发 + 局域网广播注入」。
 *
 * 一、⚡ 极速直连（MCL-D-…）：纯 Node.js，不依赖任何外部程序
 *    - 房主：扫描本机网卡，取公网 IPv6、网卡上的公网 IPv4、局域网 IPv4，和游戏「对局域网开放」的端口一起编码成房间码
 *    - 房客：解析房间码，同时尝试连接每个地址，用最先连上的那个；在本机开一个 TCP 转发端口，
 *      并不断向 224.0.2.60:4445 发送 Minecraft 局域网广播，让游戏的「多人游戏」列表底部直接出现这个房间
 *
 * 二、🌐 P2P 虚拟组网（MCL-P2P-XXXX-XXXX-XXXX）：调用 EasyTier（开源，LGPL-3.0）的 easytier-core
 *    - 使用无 TUN 模式（--no-tun），不需要管理员权限、不创建虚拟网卡
 *    - 房主：虚拟 IP 10.144.144.1；EasyTier 在无 TUN 模式下会把发往本机虚拟 IP 的连接转到 127.0.0.1 的同一端口，
 *      启动器在 127.0.0.1 的固定端口（由房间码算出）上转发到游戏的局域网端口，所以房间码里不需要带端口
 *    - 房客：EasyTier 的 --port-forward 把本机端口转到房主的虚拟 IP，启动器再接一层本地转发（统计流量）并广播
 *    - 房主本机没有内核时自动改用直连房间码（fallback）；房客本机没有内核时提示一键下载（needsP2PCore）
 *    - 内核从 GitHub 下载固定版本，下载后用写在代码里的 SHA-256 校验，校验不通过不会解压和运行
 *    - EasyTier 会把发往本机虚拟 IP 的连接转到本机 127.0.0.1 的同一端口，所以用它的入站端口白名单把对方限制住：
 *      房主只开放联机转发端口，房客不开放任何端口，好友不能借虚拟网络访问你电脑上只对本机开放的服务
 *    - 网络名和密钥用 scrypt 慢哈希从房间号算出，并通过环境变量传给内核（不出现在进程命令行里）；
 *      管理接口只监听 127.0.0.1
 *
 * 三、☁️ 内网穿透（MCL-T-…）与联机模组
 *    - 房主填写已有的穿透地址（樱花、ChmlFrp、Cloudflare Tunnel 或任意 域名:端口），启动器包装成房间码
 *    - 房客解析后同样开本地转发并广播，不用手动输入地址
 *    - 一键安装 e4mc / World Host：复用 Modrinth 安装（自动匹配加载器和游戏版本、多线程高速下载、出错自动回退）
 *
 * 共用能力：监听 224.0.2.60:4445 自动发现本机「对局域网开放」的世界；每 3 秒测一次延迟；统计转发流量；
 * 房主每 5 秒查询一次本机游戏世界（服务器列表查询），显示在线玩家，世界关闭时提醒。
 *
 * 安全：
 * - 房间码来自别人，所有内容都按不可信数据检查（地址类型、端口范围、主机名格式、中继地址格式），
 *   启动 EasyTier 时参数以数组传入，不经过命令行解释，房间码里的内容无法注入参数
 * - 房客的本地转发端口只接受本机发起的连接（游戏），局域网里的其他电脑不能借它连到房主
 * - 别人的房间码不能让启动器去连接本机回环地址、链路本地地址（如 169.254.169.254）等特殊地址
 * - 房间码只是编码，不是加密：拿到房间码的人就能加入（这正是房间码的用途）
 */
import { app, BrowserWindow } from 'electron'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { createHash, randomBytes, scrypt } from 'crypto'
import { createReadStream, createWriteStream, existsSync } from 'fs'
import { chmod, mkdir, readdir, readFile, readlink, rename, rm, writeFile } from 'fs/promises'
import { createSocket, type Socket as UdpSocket } from 'dgram'
import { connect, createServer, isIP, type Server, type Socket } from 'net'
import { networkInterfaces } from 'os'
import { basename, join } from 'path'
import { pipeline } from 'stream/promises'
import { open as openZip, openEntryReadStream, readAllEntries } from '@xmcl/unzip'
import { downloadWithFallback } from './downloadWithFallback'
import { installFromModrinth } from '../modrinth'
import { modsContextOf } from '../mods'
import { pingServer } from '../serverPing'
import type {
  LanGame,
  LocalAddresses,
  ModrinthInstallResult,
  MultiplayerMod,
  MultiplayerMode,
  MultiplayerStatus,
  P2PCoreStatus
} from '../../shared/types'

// ---------- 常量 ----------

/** Minecraft 局域网发现使用的组播地址与端口 */
const LAN_GROUP = '224.0.2.60'
/** 房客注入的房间广播的世界名前缀（显示为「[琉璃联机] 世界名」） */
const ROOM_MOTD_PREFIX = '琉璃联机'
const LAN_PORT = 4445
/** 游戏自己每 1.5 秒广播一次；超过 6 秒没收到就认为世界已关闭 */
const LAN_EXPIRE = 6000
const BROADCAST_INTERVAL = 1500
const LATENCY_INTERVAL = 3000
const WORLD_CHECK_INTERVAL = 5000
/** P2P 房客这么久还没连上房主时提示可能的原因（内核继续尝试） */
const P2P_JOIN_TIMEOUT = 60000
const STATUS_INTERVAL = 1000
const CONNECT_TIMEOUT = 5000

const PREFIX_DIRECT = 'MCL-D-'
const PREFIX_P2P = 'MCL-P2P-'
const PREFIX_TUNNEL = 'MCL-T-'
const CODE_VERSION = 1
/** P2P 房间号使用的字符（去掉了容易看错的 0 1 I O） */
const BASE32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** P2P：房主的虚拟 IP 与网段 */
const P2P_HOST_IP = '10.144.144.1'
/**
 * P2P：默认中继（EasyTier 社区提供的公共共享节点）。打洞成功后直接连接，失败时由它中转。
 * 房主可以填写自己的中继节点，地址会写进房间码，房客自动使用同一个
 */
const DEFAULT_RELAY = 'tcp://public.easytier.cn:11010'

/** P2P 内核：固定版本，按平台写死文件名与 SHA-256（下载后校验，不一致不使用） */
const CORE_VERSION = '2.7.0'
const CORE_ASSETS: Record<string, { name: string; sha256: string }> = {
  'win32-x64': {
    name: 'windows-x86_64',
    sha256: '790fd9be347b00753570ac2b65f874a591ede9427603fe34e74a86b2b084847f'
  },
  'win32-arm64': {
    name: 'windows-arm64',
    sha256: '65f6ed5f6f747b6ae74a07f55b84cf78127a89b618249626c98f8e82bd35d762'
  },
  'darwin-x64': {
    name: 'macos-x86_64',
    sha256: '4a52b977eba3c29fdf392748318992be766dbab1d144d7f5cb69bfea572e237b'
  },
  'darwin-arm64': {
    name: 'macos-aarch64',
    sha256: 'ff0ad04fd6fcc462021a3b3161ed82270dd9e7927221ecb22009f0df697bdf52'
  },
  'linux-x64': {
    name: 'linux-x86_64',
    sha256: '442238912065537c280869089217303e3d2813e9c5d2a6b14deaf25667065aa2'
  },
  'linux-arm64': {
    name: 'linux-aarch64',
    sha256: '8abc5d850ad140cd071475a2dd2b4b135f7e0e8b7271897f01fc08a5c0a9c1b0'
  }
}
const CORE_EXE = process.platform === 'win32' ? 'easytier-core.exe' : 'easytier-core'
const CORE_ROOT = join(app.getPath('userData'), 'multiplayer', 'easytier')
const CORE_DIR = join(CORE_ROOT, CORE_VERSION)
const CORE_PATH = join(CORE_DIR, CORE_EXE)
/** 正在运行的内核的进程号（正常退出时删除） */
const CORE_PID_FILE = join(CORE_ROOT, 'core.pid')

/** 可以一键安装的联机模组在 Modrinth 上的项目名 */
const MOD_PROJECTS: Record<MultiplayerMod, string> = {
  e4mc: 'e4mc',
  'world-host': 'world-host'
}

// ---------- 状态 ----------

function idleStatus(lanGame: LanGame | null): MultiplayerStatus {
  return {
    role: 'idle',
    mode: null,
    state: 'idle',
    message: '',
    code: '',
    fallback: false,
    lanGame,
    localPort: null,
    target: null,
    latency: null,
    bytesUp: 0,
    bytesDown: 0,
    connections: 0,
    needsP2PCore: false,
    gamePort: null,
    worldOnline: null,
    players: null,
    relay: null
  }
}

let status: MultiplayerStatus = idleStatus(null)

let coreDownloading = false
let coreError = ''

/** 当前房间用到的所有资源，结束房间时统一释放 */
interface Session {
  forwarders: Forwarder[]
  broadcaster: Broadcaster | null
  core: ChildProcess | null
  timers: NodeJS.Timeout[]
  /** 结束后不再更新状态 */
  stopped: boolean
  /** 已经因为出错结束（之后的错误不再覆盖第一次出错的原因） */
  failed?: boolean
}
let session: Session | null = null

function emit(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('multiplayer:status', getMultiplayerStatus())
  }
}

function update(patch: Partial<MultiplayerStatus>): void {
  status = { ...status, ...patch }
  emit()
}

export function getMultiplayerStatus(): MultiplayerStatus {
  // 流量和连接数由转发器实时累计。转发器的「上行」是接入方发出的数据：
  // 房客这一侧接入方是本机游戏；房主这一侧接入方是好友，所以房主要对调过来，表示本机发出 / 收到
  const forwarders = session?.forwarders ?? []
  const fromClient = forwarders.reduce((sum, f) => sum + f.bytesUp, 0)
  const toClient = forwarders.reduce((sum, f) => sum + f.bytesDown, 0)
  const host = status.role === 'host'
  return {
    ...status,
    bytesUp: host ? toClient : fromClient,
    bytesDown: host ? fromClient : toClient,
    connections: forwarders.reduce((sum, f) => sum + f.connections, 0)
  }
}

// ---------- 地址工具 ----------

function normalizeAddress(address: string): string {
  return address.replace(/^::ffff:/i, '').toLowerCase()
}

/** 本机所有网卡上的地址（含回环），用来判断连接是否来自本机 */
function localAddressSet(): Set<string> {
  const set = new Set<string>(['127.0.0.1', '::1'])
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) set.add(normalizeAddress(item.address.split('%')[0]))
  }
  return set
}

function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false
  const value = normalizeAddress(address.split('%')[0])
  return value.startsWith('127.') || localAddressSet().has(value)
}

function ipv4Parts(address: string): number[] {
  return address.split('.').map((n) => Number(n))
}

/** 局域网 / 保留地址（不是公网 IPv4） */
function isPrivateIpv4(address: string): boolean {
  const [a, b] = ipv4Parts(address)
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    // 文档示例与测试用的保留地址
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  )
}

/** 公网 IPv6（全球单播 2000::/3），排除文档地址 2001:db8::/32 */
function isGlobalIpv6(address: string): boolean {
  const value = address.toLowerCase()
  if (!/^[23]/.test(value)) return false
  return !value.startsWith('2001:db8:') && !value.startsWith('2001:0db8:')
}

/** 扫描本机网卡，找出可以用于直连的地址 */
export function listLocalAddresses(): LocalAddresses {
  const result: LocalAddresses = { ipv6: [], ipv4Public: [], ipv4Lan: [] }
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.internal) continue
      const address = item.address.split('%')[0]
      if (item.family === 'IPv6') {
        if (isGlobalIpv6(address) && !result.ipv6.includes(address)) result.ipv6.push(address)
      } else if (item.family === 'IPv4') {
        const [a, b] = ipv4Parts(address)
        // 169.254 是没有获取到地址时系统自动分配的，不能用
        if (a === 169 && b === 254) continue
        if (isPrivateIpv4(address)) {
          if (!result.ipv4Lan.includes(address)) result.ipv4Lan.push(address)
        } else if (!result.ipv4Public.includes(address)) {
          result.ipv4Public.push(address)
        }
      }
    }
  }
  return result
}

function checkPort(value: unknown): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须是 1 ~ 65535 之间的数字')
  return port
}

/** 主机名或 IP（来自玩家输入或房间码） */
function checkHost(value: string): string {
  const host = value.trim().replace(/^\[|\]$/g, '')
  if (isIP(host)) return host
  if (
    host.length > 253 ||
    !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host)
  ) {
    throw new Error('地址格式不正确，例如 mc.example.com:25565')
  }
  return host
}

/**
 * 房间码 / 中继里不允许出现的地址：本机回环、未指定地址、链路本地（含云服务器元数据地址 169.254.169.254）、组播。
 * 防止别人的房间码让启动器去连接你电脑上或内网里的特殊服务
 */
function isForbiddenRemote(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, '')
  if (value === 'localhost' || value.endsWith('.localhost')) return true
  const v4 = isIP(value) === 4 ? value : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)?.[1]
  if (v4) {
    const [a, b] = ipv4Parts(v4)
    return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224
  }
  if (isIP(value) === 6) {
    return value === '::' || value === '::1' || /^fe[89ab]/.test(value) || value.startsWith('ff')
  }
  return false
}

/** 别人能看到的地址（穿透地址、中继）：格式检查 + 不能是特殊地址 */
function checkRemoteHost(value: string): string {
  const host = checkHost(value)
  if (isForbiddenRemote(host)) throw new Error('不能使用本机或保留地址，请填写公网可以访问的地址')
  return host
}

function formatEndpoint(host: string, port: number): string {
  return isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`
}

/** 解析「域名:端口」「IP:端口」「[IPv6]:端口」；没写端口时为 25565 */
export function parseEndpoint(input: string): { host: string; port: number } {
  const text = input
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '')
  if (!text) throw new Error('请填写穿透地址，例如 mc.example.com:25565')
  const bracket = /^\[([0-9a-f:.]+)\](?::(\d+))?$/i.exec(text)
  if (bracket) return { host: checkHost(bracket[1]), port: bracket[2] ? checkPort(bracket[2]) : 25565 }
  if (isIP(text) === 6) return { host: text, port: 25565 }
  const index = text.lastIndexOf(':')
  if (index > 0) return { host: checkHost(text.slice(0, index)), port: checkPort(text.slice(index + 1)) }
  return { host: checkHost(text), port: 25565 }
}

/** 世界名：去掉控制字符和会破坏广播格式的方括号，最多 32 个字符 */
function cleanMotd(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f[\]]/g, '')
    .trim()
    .slice(0, 32)
}

// ---------- 房间码 ----------

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('房间码格式不对')
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** 2 字节校验，抄错房间码时能发现 */
function checksum(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest().subarray(0, 2)
}

function withChecksum(body: Buffer): Buffer {
  return Buffer.concat([body, checksum(body)])
}

function verifyChecksum(buf: Buffer): Buffer {
  if (buf.length < 3) throw new Error('房间码不完整')
  const body = buf.subarray(0, buf.length - 2)
  if (!checksum(body).equals(buf.subarray(buf.length - 2))) throw new Error('房间码不完整或抄错了，请重新复制')
  return body
}

function ipv6Bytes(address: string): Buffer {
  // 展开 :: 缩写
  const [head, tail] = address.includes('::') ? address.split('::') : [address, '']
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const parts = [...headParts, ...Array(8 - headParts.length - tailParts.length).fill('0'), ...tailParts]
  const buf = Buffer.alloc(16)
  parts.forEach((part, i) => buf.writeUInt16BE(parseInt(part || '0', 16), i * 2))
  return buf
}

function ipv6FromBytes(buf: Buffer): string {
  const parts: string[] = []
  for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(i).toString(16))
  return parts.join(':').replace(/(^|:)0(:0)+(:|$)/, '::')
}

interface DirectRoom {
  port: number
  addresses: string[]
  motd: string
}

export function encodeDirectCode(room: DirectRoom): string {
  const parts: Buffer[] = [Buffer.from([CODE_VERSION]), Buffer.alloc(2), Buffer.from([room.addresses.length])]
  parts[1].writeUInt16BE(room.port)
  for (const address of room.addresses) {
    if (isIP(address) === 6) parts.push(Buffer.from([6]), ipv6Bytes(address))
    else parts.push(Buffer.from([4]), Buffer.from(ipv4Parts(address)))
  }
  const motd = Buffer.from(cleanMotd(room.motd), 'utf-8').subarray(0, 64)
  parts.push(Buffer.from([motd.length]), motd)
  return PREFIX_DIRECT + base64url(withChecksum(Buffer.concat(parts)))
}

export function decodeDirectCode(code: string): DirectRoom {
  const buf = verifyChecksum(fromBase64url(code.slice(PREFIX_DIRECT.length)))
  let offset = 0
  const need = (n: number): void => {
    if (offset + n > buf.length) throw new Error('房间码不完整')
  }
  need(4)
  if (buf[offset++] !== CODE_VERSION) throw new Error('房间码来自更新版本的启动器，请先更新')
  const port = checkPort(buf.readUInt16BE(offset))
  offset += 2
  const count = buf[offset++]
  if (count === 0 || count > 8) throw new Error('房间码里没有可用的地址')
  const addresses: string[] = []
  for (let i = 0; i < count; i++) {
    need(1)
    const type = buf[offset++]
    if (type === 6) {
      need(16)
      const address = ipv6FromBytes(buf.subarray(offset, offset + 16))
      offset += 16
      if (isGlobalIpv6(address)) addresses.push(address)
    } else if (type === 4) {
      need(4)
      const address = [...buf.subarray(offset, offset + 4)].join('.')
      offset += 4
      const [a] = ipv4Parts(address)
      // 不接受回环、0.0.0.0、链路本地、组播等地址
      if (!isForbiddenRemote(address) && a < 224) addresses.push(address)
    } else {
      throw new Error('房间码格式不对')
    }
  }
  need(1)
  const motdLength = buf[offset++]
  need(motdLength)
  const motd = cleanMotd(buf.subarray(offset, offset + motdLength).toString('utf-8'))
  if (addresses.length === 0) throw new Error('房间码里没有可用的地址')
  return { port, addresses, motd }
}

interface TunnelRoom {
  host: string
  port: number
  motd: string
}

export function encodeTunnelCode(room: TunnelRoom): string {
  const host = Buffer.from(room.host, 'utf-8')
  const motd = Buffer.from(cleanMotd(room.motd), 'utf-8').subarray(0, 64)
  const port = Buffer.alloc(2)
  port.writeUInt16BE(room.port)
  const body = Buffer.concat([
    Buffer.from([CODE_VERSION]),
    port,
    Buffer.from([host.length]),
    host,
    Buffer.from([motd.length]),
    motd
  ])
  return PREFIX_TUNNEL + base64url(withChecksum(body))
}

export function decodeTunnelCode(code: string): TunnelRoom {
  const buf = verifyChecksum(fromBase64url(code.slice(PREFIX_TUNNEL.length)))
  if (buf.length < 5 || buf[0] !== CODE_VERSION) throw new Error('房间码来自更新版本的启动器，请先更新')
  const port = checkPort(buf.readUInt16BE(1))
  const hostLength = buf[3]
  if (4 + hostLength + 1 > buf.length) throw new Error('房间码不完整')
  const host = checkRemoteHost(buf.subarray(4, 4 + hostLength).toString('utf-8'))
  const motdLength = buf[4 + hostLength]
  const motd = cleanMotd(buf.subarray(5 + hostLength, 5 + hostLength + motdLength).toString('utf-8'))
  return { host, port, motd }
}

interface P2PRoom {
  /** 12 位房间号（不含分隔符） */
  id: string
  relay: string
}

/** 中继地址：只允许 EasyTier 支持的协议和 主机:端口，防止房间码里夹带其他参数 */
function checkRelay(value: string): string {
  const match = /^(tcp|udp|ws|wss|quic):\/\/([^/\s:]+|\[[0-9a-f:.]+\]):(\d{1,5})\/?$/i.exec(value.trim())
  if (!match) throw new Error('中继地址格式不对，例如 tcp://example.com:11010')
  checkRemoteHost(match[2])
  checkPort(match[3])
  return `${match[1].toLowerCase()}://${match[2]}:${Number(match[3])}`
}

export function encodeP2PCode(room: P2PRoom): string {
  const groups = room.id.match(/.{4}/g)!.join('-')
  return room.relay === DEFAULT_RELAY
    ? `${PREFIX_P2P}${groups}`
    : `${PREFIX_P2P}${groups}-${base64url(Buffer.from(room.relay, 'utf-8'))}`
}

export function decodeP2PCode(code: string): P2PRoom {
  const rest = code.slice(PREFIX_P2P.length)
  const match = /^([2-9A-Z]{4})-([2-9A-Z]{4})-([2-9A-Z]{4})(?:-([A-Za-z0-9_-]+))?$/.exec(rest)
  if (!match) throw new Error('P2P 房间码格式不对，应为 MCL-P2P-XXXX-XXXX-XXXX')
  const id = `${match[1]}${match[2]}${match[3]}`
  if ([...id].some((c) => !BASE32.includes(c))) throw new Error('P2P 房间码里有无效的字符')
  const relay = match[4] ? checkRelay(fromBase64url(match[4]).toString('utf-8')) : DEFAULT_RELAY
  return { id, relay }
}

function randomRoomId(): string {
  const bytes = randomBytes(12)
  return [...bytes].map((b) => BASE32[b % 32]).join('')
}

interface P2PParams {
  networkName: string
  secret: string
  virtualPort: number
}

let p2pCache: { id: string; params: P2PParams } | null = null

/**
 * 由房间号算出 EasyTier 的网络名、密钥，以及房主转发用的固定端口。
 * 中继服务器能看到网络名，房间号只有 60 位：先用 scrypt 慢哈希，让离线暴力猜房间号（进而算出密钥）的成本高到不可行
 */
async function p2pParams(id: string): Promise<P2PParams> {
  if (p2pCache?.id === id) return p2pCache.params
  const master = await new Promise<Buffer>((resolve, reject) => {
    scrypt(id, 'liuli-p2p-room-v1', 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e ? reject(e) : resolve(key)
    )
  })
  const hash = (label: string): Buffer => createHash('sha256').update(master).update(label).digest()
  const params: P2PParams = {
    networkName: `liuli-${hash('network').toString('hex').slice(0, 20)}`,
    secret: hash('secret').toString('hex'),
    virtualPort: 20000 + (hash('port').readUInt16BE(0) % 40000)
  }
  p2pCache = { id, params }
  return params
}

/** 识别房间码类型（大小写、首尾空格不影响） */
function normalizeCode(input: string): { mode: MultiplayerMode; code: string } {
  if (input.length > 2048) throw new Error('房间码太长，请检查是否复制了多余的内容')
  const text = input.trim().replace(/\s+/g, '')
  const upper = text.toUpperCase()
  if (upper.startsWith(PREFIX_P2P)) {
    // 房间号部分不区分大小写；自定义中继部分是 base64，保留原样
    const rest = text.slice(PREFIX_P2P.length)
    const groups = rest.slice(0, 14).toUpperCase()
    return { mode: 'p2p', code: PREFIX_P2P + groups + rest.slice(14) }
  }
  if (upper.startsWith(PREFIX_DIRECT)) return { mode: 'direct', code: PREFIX_DIRECT + text.slice(PREFIX_DIRECT.length) }
  if (upper.startsWith(PREFIX_TUNNEL)) return { mode: 'tunnel', code: PREFIX_TUNNEL + text.slice(PREFIX_TUNNEL.length) }
  throw new Error('无法识别的房间码，应以 MCL-D-、MCL-P2P- 或 MCL-T- 开头')
}

// ---------- TCP 转发 ----------

interface ForwarderOptions {
  /** 监听地址：房客为 0.0.0.0（游戏通过广播里的本机地址连接），房主 P2P 为 127.0.0.1 */
  bindHost: string
  /** 0 为随机端口 */
  bindPort: number
  target: { host: string; port: number }
  /** 只接受本机发起的连接 */
  localOnly: boolean
}

class Forwarder {
  bytesUp = 0
  bytesDown = 0
  connections = 0
  private server: Server | null = null
  private sockets = new Set<Socket>()
  private stopped = false

  constructor(private options: ForwarderOptions) {}

  /** 开始监听，返回实际端口 */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((client) => this.handle(client))
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
          const error = new Error(
            e.code === 'EADDRINUSE'
              ? `本机端口 ${this.options.bindPort} 已被占用`
              : `本机端口 ${this.options.bindPort} 被系统保留，无法使用`
          ) as NodeJS.ErrnoException
          error.code = e.code
          reject(error)
        } else {
          reject(e)
        }
      })
      server.listen(this.options.bindPort, this.options.bindHost, () => {
        server.removeAllListeners('error')
        server.on('error', (e) => console.error('联机转发出错：', e))
        // 监听完成前房间已经结束：立刻关掉，不留下没人管的端口
        if (this.stopped) {
          server.close()
          reject(new Error('房间已结束'))
          return
        }
        this.server = server
        resolve((server.address() as { port: number }).port)
      })
    })
  }

  private handle(client: Socket): void {
    if (this.options.localOnly && !isLocalAddress(client.remoteAddress)) {
      client.destroy()
      return
    }
    const upstream = connect({ host: this.options.target.host, port: this.options.target.port })
    client.setNoDelay(true)
    upstream.setNoDelay(true)
    this.connections++
    this.sockets.add(client)
    this.sockets.add(upstream)
    const timer = setTimeout(() => upstream.destroy(new Error('连接房主超时')), CONNECT_TIMEOUT)
    upstream.once('connect', () => clearTimeout(timer))
    client.on('data', (chunk: Buffer) => {
      this.bytesUp += chunk.length
    })
    upstream.on('data', (chunk: Buffer) => {
      this.bytesDown += chunk.length
    })
    client.pipe(upstream)
    upstream.pipe(client)
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      this.connections--
      this.sockets.delete(client)
      this.sockets.delete(upstream)
      client.destroy()
      upstream.destroy()
    }
    client.on('error', close)
    upstream.on('error', close)
    client.on('close', close)
    upstream.on('close', close)
  }

  stop(): void {
    this.stopped = true
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
  }
}

/** 找一个本机可用的随机 TCP 端口 */
function freePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}

/** UDP 端口是否可用 */
function udpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    socket.once('error', () => {
      socket.close()
      resolve(false)
    })
    socket.bind(port, '0.0.0.0', () => socket.close(() => resolve(true)))
  })
}

/** EasyTier 的监听端口：TCP 和 UDP 都要可用，并且不能和已经选好的端口重复 */
async function freeListenPort(exclude: number[] = []): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const port = await freePort('0.0.0.0')
    if (!exclude.includes(port) && (await udpPortFree(port))) return port
  }
  throw new Error('找不到可用的网络端口，请稍后重试')
}

/** TCP 握手耗时（毫秒） */
function tcpLatency(host: string, port: number, timeout = CONNECT_TIMEOUT): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const socket = connect({ host, port })
    const timer = setTimeout(() => socket.destroy(new Error('连接超时')), timeout)
    socket.once('connect', () => {
      clearTimeout(timer)
      const ms = Math.max(1, Math.round(performance.now() - started))
      socket.destroy()
      resolve(ms)
    })
    socket.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

// ---------- 局域网广播注入（房客） ----------

class Broadcaster {
  private socket: UdpSocket | null = null
  private timer: NodeJS.Timeout | null = null
  private warned = false

  constructor(
    private motd: string,
    private port: number
  ) {}

  start(): void {
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('error', (e) => this.warn(e))
    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(1)
        socket.setMulticastLoopback(true)
      } catch (e) {
        this.warn(e)
      }
      this.send()
    })
    this.socket = socket
    this.timer = setInterval(() => this.send(), BROADCAST_INTERVAL)
  }

  private send(): void {
    const message = Buffer.from(`[MOTD]${this.motd}[/MOTD][AD]${this.port}[/AD]`, 'utf-8')
    this.socket?.send(message, LAN_PORT, LAN_GROUP, (e) => {
      if (e) this.warn(e)
    })
  }

  private warn(e: unknown): void {
    if (this.warned) return
    this.warned = true
    console.warn('发送局域网广播失败（游戏列表里可能看不到房间，可以手动添加服务器）：', e)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.socket?.close()
    this.socket = null
  }
}

// ---------- 局域网端口嗅探（房主） ----------

let sniffer: UdpSocket | null = null
let snifferExpire: NodeJS.Timeout | null = null

/** 解析 Minecraft 局域网广播：[MOTD]世界名[/MOTD][AD]端口[/AD] */
export function parseLanAnnouncement(text: string): { motd: string; port: number } | null {
  const motd = /\[MOTD\]([\s\S]*?)\[\/MOTD\]/.exec(text)?.[1]
  const ad = /\[AD\]([\s\S]*?)\[\/AD\]/.exec(text)?.[1]
  if (motd === undefined || ad === undefined) return null
  // 端口一般只有数字；个别模组会写成 地址:端口
  const port = Number(ad.trim().split(':').pop())
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return { motd: cleanMotd(motd), port }
}

/** 联机页面是否打开着（打开时一直检测；离开页面后只有进行中的房间需要检测） */
let pageWantsSniffer = false

/** 有正常进行中的房间（不包括出错结束的）：离开联机页面后也继续检测 */
function roomNeedsSniffer(): boolean {
  return !!session && !session.stopped && !session.failed && status.role !== 'idle' && status.state !== 'error'
}

/** 根据联机页面和房间状态决定是否继续监听 4445 端口 */
function syncSniffer(): void {
  setLanSniffer(pageWantsSniffer || roomNeedsSniffer())
}

/** 联机页面打开 / 关闭时调用（是否继续监听由这里统一决定，页面不用自己判断） */
export function setPageLanSniffer(wanted: boolean): void {
  pageWantsSniffer = wanted
  syncSniffer()
}

/** 开始 / 停止监听本机「对局域网开放」的世界 */
export function setLanSniffer(enabled: boolean): void {
  if (!enabled) {
    sniffer?.close()
    sniffer = null
    if (snifferExpire) clearInterval(snifferExpire)
    snifferExpire = null
    // 不再监听后检测结果会过时，清掉，避免下次用到旧端口
    if (status.lanGame) update({ lanGame: null })
    return
  }
  if (sniffer) return
  const socket = createSocket({ type: 'udp4', reuseAddr: true })
  socket.on('error', (e) => {
    console.warn('监听局域网广播失败：', e)
    if (sniffer === socket) {
      sniffer = null
      // 监听已经失败：过期检查的定时器也一起停掉
      if (snifferExpire) clearInterval(snifferExpire)
      snifferExpire = null
    }
    socket.close()
  })
  socket.on('message', (msg, rinfo) => {
    // 正常的广播只有几十字节，过大的包直接丢掉
    if (msg.length > 1024) return
    // 只看本机游戏发出的广播；忽略启动器自己注入的房间广播
    if (!isLocalAddress(rinfo.address)) return
    const parsed = parseLanAnnouncement(msg.toString('utf-8'))
    if (!parsed) return
    // 启动器（本次或之前）注入的房间广播不是本机的世界
    if (parsed.motd.startsWith(ROOM_MOTD_PREFIX)) return
    if (status.role === 'guest' && parsed.port === status.localPort) return
    const lanGame: LanGame = { motd: parsed.motd, port: parsed.port, seenAt: Date.now() }
    const changed = status.lanGame?.port !== lanGame.port || status.lanGame?.motd !== lanGame.motd
    status = { ...status, lanGame }
    if (changed) emit()
  })
  socket.bind(LAN_PORT, () => {
    try {
      socket.addMembership(LAN_GROUP)
    } catch (e) {
      console.warn('加入局域网组播失败：', e)
    }
  })
  sniffer = socket
  if (snifferExpire) clearInterval(snifferExpire)
  snifferExpire = setInterval(() => {
    if (status.lanGame && Date.now() - status.lanGame.seenAt > LAN_EXPIRE) update({ lanGame: null })
  }, 1000)
}

// ---------- 房间生命周期 ----------

function newSession(): Session {
  return { forwarders: [], broadcaster: null, core: null, timers: [], stopped: false }
}

/**
 * 结束当前房间（房主或房客），释放端口、停止广播和内核进程。
 * releaseSniffer：离开联机页面后不再需要时停止监听 4445 端口（开始新房间前结束旧房间时不停）
 */
export function stopMultiplayer(releaseSniffer = true): MultiplayerStatus {
  const current = session
  session = null
  if (current) {
    current.stopped = true
    for (const timer of current.timers) clearInterval(timer)
    for (const forwarder of current.forwarders) forwarder.stop()
    current.broadcaster?.stop()
    killCore(current)
  }
  status = idleStatus(status.lanGame)
  emit()
  if (releaseSniffer) syncSniffer()
  return getMultiplayerStatus()
}

function killCore(current: Session): void {
  const core = current.core
  current.core = null
  if (core && core.exitCode === null && core.signalCode === null) {
    core.kill()
    // 内核卡住不响应结束信号时，2 秒后强制结束（Windows 上 kill 本来就是强制结束）
    const force = setTimeout(() => {
      if (core.exitCode === null && core.signalCode === null) core.kill('SIGKILL')
    }, 2000)
    force.unref()
  }
}

/** 开始新房间前结束旧的 */
function begin(role: MultiplayerStatus['role'], mode: MultiplayerMode, message: string): Session {
  stopMultiplayer(false)
  const next = newSession()
  session = next
  status = { ...idleStatus(status.lanGame), role, mode, state: 'starting', message }
  emit()
  // 每秒推送一次流量和连接数
  next.timers.push(
    setInterval(() => {
      if (!next.stopped) emit()
    }, STATUS_INTERVAL)
  )
  return next
}

/** 出错时释放转发、广播、内核和定时器，只保留错误状态（让玩家看到原因、可以重新加入） */
function teardown(current: Session): void {
  current.failed = true
  for (const timer of current.timers) clearInterval(timer)
  current.timers = []
  for (const forwarder of current.forwarders) forwarder.stop()
  current.forwarders = []
  current.broadcaster?.stop()
  current.broadcaster = null
  killCore(current)
}

function fail(current: Session, error: unknown, extra: Partial<MultiplayerStatus> = {}): never {
  const message = error instanceof Error ? error.message : String(error)
  // 已经因为别的错误结束（例如内核启动失败后转发也跟着报错）：保留第一次出错的原因
  if (!current.stopped && !current.failed) {
    teardown(current)
    update({ state: 'error', message, error: message, ...extra })
    syncSniffer()
  }
  throw error instanceof Error ? error : new Error(message)
}

/** 房主使用的端口：参数优先，否则用嗅探到的「对局域网开放」端口 */
function hostPort(port: unknown): { port: number; motd: string } {
  if (port !== undefined && port !== null && port !== '') {
    return { port: checkPort(port), motd: status.lanGame?.port === Number(port) ? status.lanGame.motd : '' }
  }
  if (status.lanGame) return { port: status.lanGame.port, motd: status.lanGame.motd }
  throw new Error('还没有检测到对局域网开放的世界：请先进入游戏，按 Esc 点「对局域网开放」，或手动填写端口')
}

/** 每隔一段时间测一次延迟 */
function startLatencyLoop(current: Session, measure: () => Promise<number>): void {
  // 上一次还没测完（超时比间隔长）时跳过，避免旧结果覆盖新结果
  let running = false
  const run = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const latency = await measure()
      if (!current.stopped) update({ latency })
    } catch {
      if (!current.stopped) update({ latency: null })
    } finally {
      running = false
    }
  }
  void run()
  current.timers.push(setInterval(() => void run(), LATENCY_INTERVAL))
}

/**
 * 房主：定时向本机游戏发送「服务器列表查询」，显示在线玩家；
 * 世界关闭（退出世界或关闭游戏）时提醒房主，重新打开后自动恢复
 */
function startWorldMonitor(current: Session, port: number): void {
  let running = false
  const run = async (): Promise<void> => {
    if (running) return
    running = true
    const result = await pingServer(`127.0.0.1:${port}`).catch(() => null)
    running = false
    if (current.stopped) return
    if (result?.online) {
      update({
        worldOnline: true,
        players: { online: result.players.online, max: result.players.max, names: result.players.sample }
      })
    } else {
      update({ worldOnline: false, players: null })
    }
  }
  void run()
  current.timers.push(setInterval(() => void run(), WORLD_CHECK_INTERVAL))
}

// ---------- 方式一：极速直连 ----------

/** 房主：生成直连房间码 */
export async function hostDirect(port?: unknown): Promise<MultiplayerStatus> {
  setLanSniffer(true)
  const target = hostPort(port)
  const local = listLocalAddresses()
  // 优先公网 IPv6，其次网卡上的公网 IPv4，最后是局域网 IPv4（同一个局域网的玩家可以用）
  const addresses = [...local.ipv6.slice(0, 2), ...local.ipv4Public.slice(0, 1), ...local.ipv4Lan.slice(0, 2)]
  if (addresses.length === 0) throw new Error('没有找到可用的网络地址，请检查网络连接')
  const current = begin('host', 'direct', '')
  const code = encodeDirectCode({ port: target.port, addresses, motd: target.motd })
  if (current.stopped) return getMultiplayerStatus()
  const message =
    local.ipv4Public.length > 0
      ? '房间已创建：把房间码发给好友即可。本机有公网 IPv4，好友可以直接连接（如果连不上，请检查防火墙是否放行了 Java）'
      : local.ipv6.length > 0
        ? '房间已创建：把房间码发给好友。本机有公网 IPv6，好友也需要有 IPv6 才能跨网络直连，否则请改用 P2P'
        : '房间已创建，但本机没有公网地址：只有同一局域网的玩家能直连，跨网络请改用 P2P 或内网穿透'
  update({ state: 'running', code, message, gamePort: target.port })
  startWorldMonitor(current, target.port)
  return getMultiplayerStatus()
}

/** 同时连接房间码里的每个地址，返回最先连上的 */
async function pickReachable(addresses: string[], port: number): Promise<{ host: string; latency: number }> {
  const attempts = addresses.map(async (host) => ({ host, latency: await tcpLatency(host, port) }))
  try {
    return await Promise.any(attempts)
  } catch {
    throw new Error(
      '连不上房主：房主的游戏可能已关闭局域网，或者双方没有可直连的网络（需要 IPv6 或同一局域网）。可以改用 P2P 或内网穿透'
    )
  }
}

/** 房客：开启本地转发和局域网广播，返回游戏里使用的本地端口 */
async function startGuestBridge(
  current: Session,
  target: { host: string; port: number },
  motd: string
): Promise<number> {
  const forwarder = new Forwarder({ bindHost: '0.0.0.0', bindPort: 0, target, localOnly: true })
  current.forwarders.push(forwarder)
  const localPort = await forwarder.start()
  // 等待端口期间房间已经结束：不再开始广播
  if (current.stopped) return localPort
  const broadcaster = new Broadcaster(`[${ROOM_MOTD_PREFIX}] ${motd || '好友的世界'}`, localPort)
  current.broadcaster = broadcaster
  broadcaster.start()
  return localPort
}

async function joinDirect(current: Session, code: string): Promise<void> {
  const room = decodeDirectCode(code)
  update({ message: '正在连接房主…' })
  const best = await pickReachable(room.addresses, room.port)
  if (current.stopped) return
  const target = { host: best.host, port: room.port }
  const localPort = await startGuestBridge(current, target, room.motd)
  if (current.stopped) return
  update({
    state: 'running',
    localPort,
    target: formatEndpoint(target.host, target.port),
    latency: best.latency,
    message: `已连接：打开游戏的「多人游戏」，房间会出现在列表底部；也可以直接连接 127.0.0.1:${localPort}`
  })
  startLatencyLoop(current, () => tcpLatency(target.host, target.port))
}

// ---------- 方式二：P2P 虚拟组网（EasyTier） ----------

function coreAsset(): { name: string; sha256: string } | null {
  return CORE_ASSETS[`${process.platform}-${process.arch}`] ?? null
}

export function getP2PCoreStatus(): P2PCoreStatus {
  return {
    supported: coreAsset() !== null,
    installed: existsSync(CORE_PATH),
    version: CORE_VERSION,
    downloading: coreDownloading,
    ...(coreError ? { error: coreError } : {})
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/**
 * 下载 P2P 内核：用多线程高速下载（失败自动回退），GitHub 优先，镜像备用；
 * 下载后校验 SHA-256，只解压 easytier-core 和它需要的 dll
 */
export async function downloadP2PCore(): Promise<P2PCoreStatus> {
  const asset = coreAsset()
  if (!asset) throw new Error('当前系统暂时没有可用的 P2P 联机内核')
  if (existsSync(CORE_PATH)) return getP2PCoreStatus()
  if (coreDownloading) return getP2PCoreStatus()
  coreDownloading = true
  coreError = ''
  emit()
  const fileName = `easytier-${asset.name}-v${CORE_VERSION}.zip`
  const zipPath = join(CORE_ROOT, fileName)
  const tempDir = join(CORE_ROOT, `.${CORE_VERSION}-${Date.now()}`)
  try {
    await mkdir(CORE_ROOT, { recursive: true })
    // 清理上次下载中途退出留下的临时文件夹和压缩包
    for (const name of await readdir(CORE_ROOT).catch(() => [] as string[])) {
      if (name.startsWith('.') || name.endsWith('.zip')) {
        await rm(join(CORE_ROOT, name), { recursive: true, force: true }).catch(() => undefined)
      }
    }
    const url = `https://github.com/EasyTier/EasyTier/releases/download/v${CORE_VERSION}/${fileName}`
    // 镜像只用来加速，文件内容由 SHA-256 保证
    await downloadWithFallback({ url: [url, `https://ghfast.top/${url}`], destination: zipPath }, 'multiplayer')
    if ((await sha256Of(zipPath)) !== asset.sha256)
      throw new Error('下载的联机内核校验失败（SHA-256 不一致），已删除，请重试')

    // 只要 easytier-core，以及 Windows 上它旁边的 dll（不解压子文件夹，文件名只能是普通名字）
    const folder = `easytier-${asset.name}/`
    const wanted = (name: string): boolean => {
      if (!name.startsWith(folder)) return false
      const base = name.slice(folder.length)
      if (base === CORE_EXE) return true
      return process.platform === 'win32' && /^[\w.-]+\.dll$/i.test(base)
    }
    await mkdir(tempDir, { recursive: true })
    const zip = await openZip(zipPath)
    try {
      for (const entry of await readAllEntries(zip)) {
        if (!wanted(entry.fileName)) continue
        const target = join(tempDir, entry.fileName.slice(folder.length))
        await pipeline(await openEntryReadStream(zip, entry), createWriteStream(target))
      }
    } finally {
      zip.close()
    }
    if (!existsSync(join(tempDir, CORE_EXE))) throw new Error('联机内核压缩包里没有找到 easytier-core')
    if (process.platform !== 'win32') await chmod(join(tempDir, CORE_EXE), 0o755)
    await rm(CORE_DIR, { recursive: true, force: true })
    // Windows 上杀毒软件扫描新文件时可能暂时无法改名，稍等重试
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tempDir, CORE_DIR)
        break
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  } catch (e) {
    coreError = e instanceof Error ? e.message : String(e)
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    throw e
  } finally {
    await rm(zipPath, { force: true }).catch(() => undefined)
    coreDownloading = false
    emit()
  }
  return getP2PCoreStatus()
}

/** 进程号对应的程序是不是联机内核（进程号可能已经被别的程序重用，不能直接结束） */
function isCoreProcess(pid: number): Promise<boolean> {
  if (process.platform === 'linux') {
    return readlink(`/proc/${pid}/exe`).then(
      (exe) => exe === CORE_PATH || (exe.startsWith(CORE_ROOT) && basename(exe) === CORE_EXE),
      () => false
    )
  }
  return new Promise((resolve) => {
    const windows = process.platform === 'win32'
    const command = windows ? 'tasklist' : 'ps'
    const args = windows ? ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'] : ['-p', String(pid), '-o', 'comm=']
    execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(false)
      const out = String(stdout).trim()
      resolve(windows ? out.toLowerCase().startsWith(`"${CORE_EXE}"`) : out === CORE_PATH || basename(out) === CORE_EXE)
    })
  })
}

/**
 * 启动时清理上次留下的联机内核：启动器被强制结束（任务管理器结束任务、崩溃）时来不及关闭内核，
 * 它会一直在后台连着中继服务器、占着端口
 */
export async function cleanupOrphanCore(): Promise<void> {
  const text = await readFile(CORE_PID_FILE, 'utf-8').catch(() => null)
  if (text === null) return
  await rm(CORE_PID_FILE, { force: true }).catch(() => undefined)
  const pid = Number(text.trim())
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
  if (!(await isCoreProcess(pid))) return
  try {
    process.kill(pid)
    console.info(`已结束上次留下的联机内核（进程 ${pid}）`)
  } catch {
    // 已经退出
  }
}

/** 启动 easytier-core，进程意外退出时把最后的输出显示给玩家 */
function startCore(current: Session, args: string[], params: P2PParams): ChildProcess {
  // 不继承玩家电脑上已有的 EasyTier 环境变量（ET_*），避免被意外改变行为；网络名和密钥通过环境变量传入，不出现在命令行里
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^ET_/i.test(key)) env[key] = value
  }
  env.ET_NETWORK_NAME = params.networkName
  env.ET_NETWORK_SECRET = params.secret
  const child = spawn(CORE_PATH, args, {
    cwd: CORE_DIR,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  current.core = child
  const lines: string[] = []
  const collect = (chunk: Buffer): void => {
    for (const line of chunk.toString('utf-8').split(/\r?\n/)) {
      const text = line.replace(/\u001b\[[0-9;]*m/g, '').trim()
      if (text) lines.push(text)
    }
    if (lines.length > 30) lines.splice(0, lines.length - 30)
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  child.on('error', (e) => {
    if (current.stopped || current.core !== child) return
    teardown(current)
    update({ state: 'error', message: `无法启动 P2P 联机内核：${e.message}`, error: e.message })
    syncSniffer()
  })
  child.on('exit', (code) => {
    if (current.stopped || current.core !== child) return
    // 内核退出后联机通道已经断了：同时停掉本地转发和广播，游戏列表里不再显示失效的房间
    teardown(current)
    const last = lines.filter((l) => /error|failed|错误|失败/i.test(l)).pop() ?? lines[lines.length - 1] ?? ''
    const message = `P2P 联机内核已退出（退出码 ${code ?? '未知'}）${last ? `：${last.slice(0, 200)}` : ''}`
    update({ state: 'error', message, error: message })
    syncSniffer()
  })
  // 记下内核的进程号：启动器被强制结束（任务管理器、崩溃）时内核会留在后台，下次启动时据此清理
  if (child.pid) {
    const pid = child.pid
    void writeFile(CORE_PID_FILE, String(pid)).catch(() => undefined)
    child.once('exit', () => {
      void readFile(CORE_PID_FILE, 'utf-8')
        .then((text) => (text.trim() === String(pid) ? rm(CORE_PID_FILE, { force: true }) : undefined))
        .catch(() => undefined)
    })
  }
  return child
}

/**
 * 公共参数：无 TUN（不需要管理员权限）、指定中继、随机监听端口；管理接口只允许本机访问。
 * 入站端口白名单：无 TUN 模式下发往本机虚拟 IP 的连接会被转到本机 127.0.0.1 的同一端口，
 * 所以房主只开放联机转发端口，房客只「开放」不可能被监听的 0 端口（等于全部拒绝）；本机主动发起的连接的回包不受影响
 */
function coreArgs(room: P2PRoom, role: 'host' | 'guest', listenPort: number, params: P2PParams): string[] {
  return [
    '--no-tun',
    `--tcp-whitelist=${role === 'host' ? params.virtualPort : 0}`,
    '--udp-whitelist=0',
    '--rpc-portal-whitelist=127.0.0.1/32,::1/128',
    '-p',
    room.relay,
    '-l',
    `tcp://0.0.0.0:${listenPort}`,
    `udp://0.0.0.0:${listenPort}`,
    '-r',
    '127.0.0.1:0',
    '-m',
    `liuli-${role}-${process.pid}`,
    '--hostname',
    `liuli-${role}`,
    '--console-log-level',
    'warn'
  ]
}

/** 房主：创建 P2P 房间；本机没有内核时改用直连房间码 */
export async function hostP2P(port?: unknown, relay?: unknown): Promise<MultiplayerStatus> {
  setLanSniffer(true)
  const target = hostPort(port)
  const relayUrl = typeof relay === 'string' && relay.trim() ? checkRelay(relay) : DEFAULT_RELAY
  if (!existsSync(CORE_PATH)) {
    // 智能降级：先用直连房间码，下载内核后可以再创建 P2P 房间
    const result = await hostDirect(target.port)
    update({
      fallback: true,
      needsP2PCore: true,
      relay: relayUrl,
      message: `本机还没有 P2P 联机内核，已先生成直连房间码（${result.message}）。下载内核后点「改用 P2P 房间」即可切换`
    })
    return getMultiplayerStatus()
  }
  let room: P2PRoom = { id: randomRoomId(), relay: relayUrl }
  const current = begin('host', 'p2p', '正在启动 P2P 联机…')
  try {
    // 房间号决定转发端口；端口被占用或被系统保留（Windows 常见）时换一个房间号重试
    let params = await p2pParams(room.id)
    for (let attempt = 0; ; attempt++) {
      if (current.stopped) return getMultiplayerStatus()
      // EasyTier 会把发往房主虚拟 IP 的连接转到 127.0.0.1 的同一端口；这里把它接到游戏的局域网端口
      const forwarder = new Forwarder({
        bindHost: '127.0.0.1',
        bindPort: params.virtualPort,
        target: { host: '127.0.0.1', port: target.port },
        localOnly: true
      })
      current.forwarders.push(forwarder)
      try {
        await forwarder.start()
        break
      } catch (e) {
        current.forwarders = current.forwarders.filter((f) => f !== forwarder)
        const code = (e as NodeJS.ErrnoException).code
        if (attempt >= 4 || (code !== 'EADDRINUSE' && code !== 'EACCES')) throw e
        room = { id: randomRoomId(), relay: relayUrl }
        params = await p2pParams(room.id)
      }
    }
    const listenPort = await freeListenPort()
    // 等待期间房间已经被关闭或替换：不再启动内核，否则会留下没人管的进程
    if (current.stopped) return getMultiplayerStatus()
    startCore(current, [...coreArgs(room, 'host', listenPort, params), '--ipv4', P2P_HOST_IP], params)
  } catch (e) {
    if (current.stopped) return getMultiplayerStatus()
    fail(current, e)
  }
  if (current.stopped) return getMultiplayerStatus()
  update({
    state: 'running',
    code: encodeP2PCode(room),
    gamePort: target.port,
    relay: relayUrl,
    message: '房间已创建：把房间码发给好友，好友加入后会自动打洞直连，打洞失败时通过中继服务器连接'
  })
  startWorldMonitor(current, target.port)
  return getMultiplayerStatus()
}

async function joinP2P(current: Session, code: string): Promise<void> {
  const room = decodeP2PCode(code)
  if (!existsSync(CORE_PATH)) {
    update({ needsP2PCore: true })
    throw new Error('加入 P2P 房间需要先下载 P2P 联机内核（约 40 MB），下载完成后重新加入')
  }
  const params = await p2pParams(room.id)
  const tunnelPort = await freePort('127.0.0.1')
  const listenPort = await freeListenPort([tunnelPort])
  // 等待期间房间已经被关闭或替换：不再启动内核
  if (current.stopped) return
  startCore(
    current,
    [
      ...coreArgs(room, 'guest', listenPort, params),
      '-d',
      '--port-forward',
      `tcp://127.0.0.1:${tunnelPort}/${P2P_HOST_IP}:${params.virtualPort}`
    ],
    params
  )
  const localPort = await startGuestBridge(current, { host: '127.0.0.1', port: tunnelPort }, '')
  if (current.stopped) return
  update({
    localPort,
    target: `${P2P_HOST_IP}（P2P 虚拟网络）`,
    relay: room.relay,
    message: '正在打洞连接房主，通常需要几秒到半分钟…'
  })
  // 通过隧道向房主的游戏发送一次「服务器列表查询」，收到回复说明已经连通，同时得到真实延迟
  let connected = false
  // 很久还没连上：提示可能的原因；内核继续尝试，之后连上了会自动变成已连接
  const timeout = setTimeout(() => {
    if (connected || current.stopped || status.state !== 'starting') return
    update({
      state: 'error',
      message:
        '一分钟内没有连上房主：请确认房主的房间还开着、房间码没有抄错；如果双方网络限制较多，可以让房主换一个中继服务器。启动器会继续尝试'
    })
  }, P2P_JOIN_TIMEOUT)
  current.timers.push(timeout)
  startLatencyLoop(current, async () => {
    const result = await pingServer(`127.0.0.1:${tunnelPort}`)
    if (!result.online || result.latency === undefined) throw new Error(result.error ?? '未连通')
    if (!connected && !current.stopped) {
      connected = true
      clearTimeout(timeout)
      update({
        state: 'running',
        message: `已连接：打开游戏的「多人游戏」，房间会出现在列表底部；也可以直接连接 127.0.0.1:${localPort}`
      })
    }
    return result.latency
  })
}

// ---------- 方式三：内网穿透地址 ----------

/** 房主：把已有的穿透地址包装成房间码 */
export async function hostTunnel(address: unknown, motd?: unknown): Promise<MultiplayerStatus> {
  if (typeof address !== 'string') throw new Error('请填写穿透地址')
  const endpoint = parseEndpoint(address)
  checkRemoteHost(endpoint.host)
  const name = typeof motd === 'string' && motd.trim() ? motd : (status.lanGame?.motd ?? '')
  // 穿透工具映射的是本机哪个端口启动器不知道，只能用检测到的「对局域网开放」端口查询世界状态
  const gamePort = status.lanGame?.port ?? null
  const current = begin('host', 'tunnel', '')
  if (current.stopped) return getMultiplayerStatus()
  update({
    state: 'running',
    code: encodeTunnelCode({ ...endpoint, motd: name }),
    target: formatEndpoint(endpoint.host, endpoint.port),
    gamePort,
    message: '房间码已生成：好友加入后，房间会直接出现在游戏的多人游戏列表里'
  })
  if (gamePort !== null) startWorldMonitor(current, gamePort)
  return getMultiplayerStatus()
}

async function joinTunnel(current: Session, code: string): Promise<void> {
  const room = decodeTunnelCode(code)
  update({ message: '正在连接穿透地址…' })
  let latency: number
  try {
    latency = await tcpLatency(room.host, room.port)
  } catch {
    throw new Error(`连不上 ${formatEndpoint(room.host, room.port)}：请确认房主的穿透服务正在运行，地址和端口正确`)
  }
  if (current.stopped) return
  const localPort = await startGuestBridge(current, { host: room.host, port: room.port }, room.motd)
  if (current.stopped) return
  update({
    state: 'running',
    localPort,
    target: formatEndpoint(room.host, room.port),
    latency,
    message: `已连接：打开游戏的「多人游戏」，房间会出现在列表底部；也可以直接连接 127.0.0.1:${localPort}`
  })
  startLatencyLoop(current, () => tcpLatency(room.host, room.port))
}

/** 一键安装联机模组（e4mc / World Host）到指定版本 */
export async function installMultiplayerMod(versionId: string, mod: unknown): Promise<ModrinthInstallResult> {
  if (typeof mod !== 'string' || !Object.hasOwn(MOD_PROJECTS, mod)) throw new Error('不支持的联机模组')
  const project = MOD_PROJECTS[mod as MultiplayerMod]
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader || ctx.loader === 'optifine') {
    throw new Error('原版不能安装模组：请先为这个版本安装 Fabric、Quilt、Forge 或 NeoForge')
  }
  return installFromModrinth(versionId, project)
}

// ---------- 加入房间 ----------

/** 房客：加入房间（自动识别三种房间码） */
export async function joinRoom(input: unknown): Promise<MultiplayerStatus> {
  if (typeof input !== 'string' || !input.trim()) throw new Error('请填写房间码')
  const { mode, code } = normalizeCode(input)
  const current = begin('guest', mode, '正在加入房间…')
  update({ code })
  try {
    if (mode === 'direct') await joinDirect(current, code)
    else if (mode === 'p2p') await joinP2P(current, code)
    else await joinTunnel(current, code)
  } catch (e) {
    if (current.stopped) return getMultiplayerStatus()
    fail(current, e, status.needsP2PCore ? { needsP2PCore: true } : {})
  }
  return getMultiplayerStatus()
}

/** 启动器退出时结束联机（不留下后台的内核进程） */
export function shutdownMultiplayer(): void {
  pageWantsSniffer = false
  stopMultiplayer()
  setLanSniffer(false)
}
