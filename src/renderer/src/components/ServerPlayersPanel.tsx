import { useCallback, useEffect, useState } from 'react'
import { Crown, Loader2, Plus, ShieldCheck, UserMinus, Users, X } from 'lucide-react'
import type { LocalServerPlayerAction, LocalServerPlayers } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/
const INPUT =
  'w-32 min-w-0 rounded-lg border border-white/15 bg-black/20 px-2 py-1 font-mono text-xs outline-none placeholder:font-sans placeholder:text-white/30 focus:border-emerald-400/50'

/** 一键开服的玩家管理：在线玩家、管理员、白名单（服务器运行时用命令修改） */
function ServerPlayersPanel({ serverId, online }: { serverId: string; online: string[] }): JSX.Element {
  const [players, setPlayers] = useState<LocalServerPlayers | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [whitelistName, setWhitelistName] = useState('')
  const [opName, setOpName] = useState('')

  const refresh = useCallback(async () => {
    try {
      setPlayers(await window.api.getLocalServerPlayers(serverId))
    } catch (e) {
      setError(cleanError(e))
    }
  }, [serverId])

  // 在线玩家变了、或者每 3 秒（服务器改完 ops.json、whitelist.json 后）刷新一次
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => clearInterval(timer)
  }, [refresh, online.join(',')])

  /** 先按操作更新界面（服务器写好文件后再以文件为准，失败时刷新回去） */
  const optimistic = (action: LocalServerPlayerAction, name?: string): void =>
    setPlayers((p) => {
      if (!p) return p
      const add = (list: string[]): string[] => (name && !list.includes(name) ? [...list, name] : list)
      const remove = (list: string[]): string[] => list.filter((n) => n.toLowerCase() !== name?.toLowerCase())
      if (action === 'op') return { ...p, ops: add(p.ops) }
      if (action === 'deop') return { ...p, ops: remove(p.ops) }
      if (action === 'whitelistAdd') return { ...p, whitelist: add(p.whitelist) }
      if (action === 'whitelistRemove') return { ...p, whitelist: remove(p.whitelist) }
      if (action === 'whitelistOn' || action === 'whitelistOff')
        return { ...p, whitelistEnabled: action === 'whitelistOn' }
      return p
    })

  const act = async (key: string, action: LocalServerPlayerAction, name?: string): Promise<void> => {
    setBusy(key)
    setError('')
    optimistic(action, name)
    try {
      await window.api.manageLocalServerPlayer(serverId, action, name)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      // 服务器写文件需要一点时间
      setTimeout(() => {
        void refresh()
        setBusy('')
      }, 600)
    }
  }

  const isOp = (name: string): boolean => !!players?.ops.some((o) => o.toLowerCase() === name.toLowerCase())
  const chip = 'flex items-center gap-1 rounded-lg bg-white/10 py-0.5 pl-2 pr-1 text-xs'
  const small =
    'flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-white/60 hover:bg-white/15 hover:text-white disabled:opacity-40'

  return (
    <div className="space-y-3 rounded-lg bg-black/20 px-3 py-3 text-sm" data-testid="server-players">
      {/* 在线玩家 */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-white/60">
          <Users className="h-3.5 w-3.5" />
          在线玩家 {online.length}
        </div>
        {online.length === 0 ? (
          <p className="text-xs text-white/40">还没有人进来</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {online.map((name) => (
              <span key={name} className={chip}>
                {isOp(name) && <Crown className="h-3 w-3 text-amber-300" aria-label="管理员" />}
                <span className="font-mono">{name}</span>
                <button
                  onClick={() => void act(`op:${name}`, isOp(name) ? 'deop' : 'op', name)}
                  disabled={!!busy}
                  title={isOp(name) ? '取消管理员' : '设为管理员（可以用作弊命令）'}
                  className={small}
                >
                  {busy === `op:${name}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {isOp(name) ? '取消管理员' : '设为管理员'}
                </button>
                <button
                  onClick={() => void act(`kick:${name}`, 'kick', name)}
                  disabled={!!busy}
                  title="踢出服务器（还可以再进来）"
                  className={small}
                >
                  <UserMinus className="h-3 w-3" />
                  踢出
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 白名单 */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs text-white/60">
          白名单
          <label className="flex cursor-pointer items-center gap-1 text-white/70">
            <input
              type="checkbox"
              checked={!!players?.whitelistEnabled}
              onChange={() => void act('whitelist', players?.whitelistEnabled ? 'whitelistOff' : 'whitelistOn')}
              disabled={!!busy || !players}
              aria-label="开启白名单"
            />
            {players?.whitelistEnabled ? '已开启：只有名单上的人能进' : '没开启：谁都能进'}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {players?.whitelist.map((name) => (
            <span key={name} className={chip}>
              <span className="font-mono">{name}</span>
              <button
                onClick={() => void act(`wl:${name}`, 'whitelistRemove', name)}
                disabled={!!busy}
                title="移出白名单"
                aria-label={`把 ${name} 移出白名单`}
                className={small}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={whitelistName}
            onChange={(e) => setWhitelistName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && NAME_RE.test(whitelistName)) {
                void act('wl-add', 'whitelistAdd', whitelistName)
                setWhitelistName('')
              }
            }}
            maxLength={16}
            placeholder="玩家名"
            aria-label="加入白名单的玩家名"
            className={INPUT}
          />
          <button
            onClick={() => {
              void act('wl-add', 'whitelistAdd', whitelistName)
              setWhitelistName('')
            }}
            disabled={!!busy || !NAME_RE.test(whitelistName)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            加入白名单
          </button>
        </div>
      </div>

      {/* 管理员 */}
      <div>
        <div className="mb-1.5 text-xs text-white/60">管理员（可以用作弊命令、改游戏规则）</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {players?.ops.map((name) => (
            <span key={name} className={chip}>
              <Crown className="h-3 w-3 text-amber-300" />
              <span className="font-mono">{name}</span>
              <button
                onClick={() => void act(`deop:${name}`, 'deop', name)}
                disabled={!!busy}
                title="取消管理员"
                aria-label={`取消 ${name} 的管理员`}
                className={small}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={opName}
            onChange={(e) => setOpName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && NAME_RE.test(opName)) {
                void act('op-add', 'op', opName)
                setOpName('')
              }
            }}
            maxLength={16}
            placeholder="玩家名"
            aria-label="设为管理员的玩家名"
            className={INPUT}
          />
          <button
            onClick={() => {
              void act('op-add', 'op', opName)
              setOpName('')
            }}
            disabled={!!busy || !NAME_RE.test(opName)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            设为管理员
          </button>
        </div>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      <p className="text-xs text-white/40">操作结果会显示在下面的服务器输出里</p>
    </div>
  )
}

export default ServerPlayersPanel
