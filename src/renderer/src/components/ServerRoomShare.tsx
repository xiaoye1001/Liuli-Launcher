import { useEffect, useState } from 'react'
import { Check, Copy, Globe2, Loader2, X } from 'lucide-react'
import type { MultiplayerStatus } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 一键开服：生成联机房间码，让不在同一个局域网的朋友也能加入 */
function ServerRoomShare(): JSX.Element {
  const [room, setRoom] = useState<MultiplayerStatus | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const refresh = (): void => {
      window.api
        .getServerRoom()
        .then(setRoom)
        .catch(() => setRoom(null))
    }
    refresh()
    // 房间状态变了（房间码生成好、连接数、延迟、被别处关掉）：重新读取
    return window.api.onMultiplayerStatus(refresh)
  }, [])

  const host = async (mode: 'p2p' | 'direct'): Promise<void> => {
    setBusy(mode)
    setError('')
    try {
      await window.api.hostServerRoom(mode)
      setRoom(await window.api.getServerRoom())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  /** 没有 P2P 内核时房间先用了直连：下载内核后改用 P2P 房间 */
  const upgrade = async (): Promise<void> => {
    setBusy('core')
    setError('')
    try {
      const core = await window.api.downloadP2PCore()
      if (!core.installed) throw new Error(core.error || '下载 P2P 内核失败')
      await window.api.hostServerRoom('p2p')
      setRoom(await window.api.getServerRoom())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const stop = async (): Promise<void> => {
    setBusy('stop')
    try {
      await window.api.stopServerRoom()
      setRoom(null)
    } finally {
      setBusy('')
    }
  }

  const copy = (): void => {
    if (!room?.code) return
    void navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const active = room && (room.state === 'running' || room.state === 'starting')

  return (
    <div className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs" data-testid="server-room">
      <div className="flex items-center gap-1.5 font-medium text-sky-300">
        <Globe2 className="h-3.5 w-3.5" />
        让不在一起的朋友加入
      </div>
      {active ? (
        <div className="mt-1.5 space-y-1.5">
          {room.code ? (
            <div className="flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded bg-black/25 px-2 py-1 font-mono text-white/80"
                title={room.code}
                data-testid="server-room-code"
              >
                {room.code}
              </code>
              <button
                onClick={copy}
                className="flex shrink-0 items-center gap-1 rounded bg-sky-500/70 px-2 py-1 text-white hover:bg-sky-500"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? '已复制' : '复制房间码'}
              </button>
              <button
                onClick={() => void stop()}
                disabled={busy === 'stop'}
                title="关闭房间（服务器继续运行）"
                aria-label="关闭联机房间"
                className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-white/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在创建房间…
            </div>
          )}
          {room.message && (
            <div className="text-white/60">
              {room.fallback && room.needsP2PCore
                ? '本机还没有 P2P 联机内核，先生成了直连房间码：只有能直连的朋友（同一局域网或有公网地址）能加入'
                : room.message}
            </div>
          )}
          {room.fallback && room.needsP2PCore && (
            <button
              onClick={() => void upgrade()}
              disabled={!!busy}
              className="flex items-center gap-1 rounded bg-sky-500/70 px-2.5 py-1 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy === 'core' && <Loader2 className="h-3 w-3 animate-spin" />}
              {busy === 'core' ? '正在下载 P2P 内核…' : '下载内核并改用 P2P 房间'}
            </button>
          )}
          {error && <div className="text-rose-300">{error}</div>}
          <div className="text-white/40">
            {`朋友在琉璃启动器的「联机」页点「加入房间」，粘贴房间码，然后在游戏「多人游戏」列表里就能看到这个服务器${
              room.connections > 0 ? `；现在有 ${room.connections} 个连接` : ''
            }`}
          </div>
        </div>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          <div className="text-white/50">
            生成一个联机房间码发给朋友，朋友用琉璃启动器的「联机」加入，不需要公网 IP，也不用改路由器
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void host('p2p')}
              disabled={!!busy}
              className="flex items-center gap-1 rounded bg-sky-500/70 px-2.5 py-1 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy === 'p2p' && <Loader2 className="h-3 w-3 animate-spin" />}
              生成房间码（P2P，推荐）
            </button>
            <button
              onClick={() => void host('direct')}
              disabled={!!busy}
              title="本机有公网 IPv6 或公网 IPv4 时可以用直连"
              className="flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {busy === 'direct' && <Loader2 className="h-3 w-3 animate-spin" />}
              直连房间码
            </button>
          </div>
          {error && <div className="text-rose-300">{error}</div>}
        </div>
      )}
    </div>
  )
}

export default ServerRoomShare
