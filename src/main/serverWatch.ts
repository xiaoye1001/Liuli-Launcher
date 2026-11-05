import { listServers } from './servers'
import { pingServer } from './serverPing'
import { notify } from './notify'

/**
 * 服务器上线提醒：每隔几分钟查询打开了提醒的服务器，从连不上变成能连上、或者从没人变成有人时，
 * 弹系统通知（启动器在后台时才弹，设置里关闭系统通知后不弹）。第一次查询只记下状态，不通知
 */
const INTERVAL = Math.max(1000, Number(process.env.LIULI_SERVER_WATCH_INTERVAL) || 3 * 60_000)
/** 同一个服务器同一种提醒，至少隔这么久才再提醒一次（服务器反复断线时不刷屏） */
const COOLDOWN = 30 * 60_000

interface WatchState {
  online: boolean
  players: number
}

const states = new Map<string, WatchState>()
const lastNotified = new Map<string, number>()
let checking = false

const clean = (text: string, max: number): string =>
  text
    .replace(/§./g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)

function remind(key: string, title: string, body: string): void {
  const now = Date.now()
  if (now - (lastNotified.get(key) ?? 0) < COOLDOWN) return
  lastNotified.set(key, now)
  void notify(title, body)
}

/** 查询一遍打开了提醒的服务器 */
export async function checkWatchedServers(): Promise<void> {
  if (checking) return
  checking = true
  try {
    const watched = (await listServers()).filter((s) => s.watch)
    const ids = new Set(watched.map((s) => s.id))
    for (const id of [...states.keys()]) if (!ids.has(id)) states.delete(id)
    for (const server of watched) {
      const status = await pingServer(server.address).catch(() => null)
      // 查询期间关掉了提醒或删掉了服务器
      if (!(await listServers()).some((s) => s.id === server.id && s.watch)) continue
      const next: WatchState = { online: !!status?.online, players: status?.online ? status.players.online : 0 }
      const before = states.get(server.id)
      states.set(server.id, next)
      if (!before || !status?.online) continue
      const name = clean(server.name || server.address, 40) || server.address
      if (!before.online) {
        remind(
          `${server.id}:online`,
          `${name} 上线了`,
          next.players > 0 ? `现在 ${next.players} 人在线，可以加入了` : '服务器已经可以加入了'
        )
      } else if (before.players === 0 && next.players > 0) {
        const names = status.players.sample
          .map((n) => clean(n, 32))
          .filter(Boolean)
          .slice(0, 5)
        remind(
          `${server.id}:players`,
          `${name} 有人了`,
          `${next.players} 人在线${names.length > 0 ? `：${names.join('、')}` : ''}`
        )
      }
    }
  } finally {
    checking = false
  }
}

/** 打开提醒时马上查一次，记下现在的状态 */
export function watchChanged(): void {
  void checkWatchedServers()
}

export function setupServerWatch(): void {
  setTimeout(() => void checkWatchedServers(), Math.min(INTERVAL, 20_000))
  setInterval(() => void checkWatchedServers(), INTERVAL)
}
