/**
 * 一键开服 + 联机房间码：让不在同一个局域网的朋友也能加入自己开的服务器。
 * 用「联机」的公开接口创建房主房间（端口填服务器的端口），不改联机本身的逻辑；
 * 服务器停止时自动关掉这个房间
 */
import { getMultiplayerStatus, hostDirect, hostP2P, stopMultiplayer } from './services/multiplayerService'
import { getLocalServerStatus, onLocalServerStatus } from './localServer'
import type { MultiplayerStatus } from '../shared/types'

/** 为开服创建的房间对应的端口 */
let roomPort: number | null = null

function ownsRoom(status: MultiplayerStatus): boolean {
  return roomPort !== null && status.role === 'host' && status.gamePort === roomPort
}

/** 为正在运行的服务器创建联机房间：p2p（推荐，没有内核时自动改用直连）或 direct */
export async function hostServerRoom(mode: unknown): Promise<MultiplayerStatus> {
  const { status } = getLocalServerStatus()
  if (status.state !== 'running' || !status.port) throw new Error('服务器还没有开好')
  const current = getMultiplayerStatus()
  if (current.role !== 'idle' && !ownsRoom(current)) {
    throw new Error('「联机」页正在使用（创建或加入了别的房间），先在联机页结束再来')
  }
  if (ownsRoom(current)) stopMultiplayer()
  roomPort = status.port
  try {
    return mode === 'direct' ? await hostDirect(status.port) : await hostP2P(status.port)
  } catch (e) {
    roomPort = null
    throw e
  }
}

/** 这个服务器的联机房间（没有时为 null） */
export function getServerRoom(): MultiplayerStatus | null {
  const current = getMultiplayerStatus()
  return ownsRoom(current) ? current : null
}

export function stopServerRoom(): void {
  if (ownsRoom(getMultiplayerStatus())) stopMultiplayer()
  roomPort = null
}

/** 服务器停止（或出错）时，关掉为它创建的房间 */
export function setupServerRoom(): void {
  onLocalServerStatus((status) => {
    if (roomPort === null) return
    if (status.state === 'running' && status.port === roomPort) return
    if (status.state === 'starting') return
    stopServerRoom()
  })
}
