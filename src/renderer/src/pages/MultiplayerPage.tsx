import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  Copy,
  Download,
  Gauge,
  Loader2,
  LogIn,
  Network,
  Plus,
  Power,
  Puzzle,
  Radio,
  Users,
  Zap,
  type LucideIcon
} from 'lucide-react'
import { cleanIpcError, formatBytes, useDownloads } from '../utils/downloads'
import type {
  InstalledVersion,
  LocalAddresses,
  MultiplayerMod,
  MultiplayerMode,
  MultiplayerStatus,
  P2PCoreStatus
} from '../../../shared/types'

const MODES: { key: MultiplayerMode; title: string; desc: string; icon: LucideIcon; tint: string }[] = [
  {
    key: 'direct',
    title: '极速直连',
    desc: 'IPv6 / 公网 / 局域网直连，不需要任何组件',
    icon: Zap,
    tint: 'text-amber-300'
  },
  { key: 'p2p', title: 'P2P 组网', desc: '自动打洞，失败时走中继，几乎都能连上', icon: Network, tint: 'text-sky-300' },
  {
    key: 'tunnel',
    title: '内网穿透',
    desc: '使用已有的穿透地址（樱花、ChmlFrp 等）',
    icon: Cloud,
    tint: 'text-violet-300'
  }
]

const MODE_LABELS: Record<MultiplayerMode, string> = { direct: '极速直连', p2p: 'P2P 组网', tunnel: '内网穿透' }

const MODS: { key: MultiplayerMod; title: string; desc: string }[] = [
  { key: 'e4mc', title: 'e4mc', desc: '对局域网开放后自动生成一个公网地址，发给好友直接连接' },
  { key: 'world-host', title: 'World Host', desc: '在游戏里加好友，一键加入好友的世界' }
]

/** 房间码类型（按前缀识别） */
function codeMode(code: string): MultiplayerMode | null {
  const upper = code.trim().toUpperCase()
  if (upper.startsWith('MCL-P2P-')) return 'p2p'
  if (upper.startsWith('MCL-D-')) return 'direct'
  if (upper.startsWith('MCL-T-')) return 'tunnel'
  return null
}

function CopyButton({ text, label = '复制' }: { text: string; label?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={() => void copy()}
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
      {copied ? '已复制' : label}
    </button>
  )
}

/** P2P 联机内核：状态与一键下载（进度来自多线程下载器） */
function CoreDownload({ core, onChange }: { core: P2PCoreStatus | null; onChange: () => void }): JSX.Element | null {
  const tasks = useDownloads()
  const [error, setError] = useState('')
  if (!core) return null
  if (!core.supported) return <div className="text-xs text-white/50">当前系统暂时没有可用的 P2P 联机内核</div>
  if (core.installed)
    return <div className="text-xs text-emerald-300">P2P 联机内核已就绪（EasyTier {core.version}）</div>
  const task = tasks.find(
    (t) => t.source === 'multiplayer' && (t.status === 'downloading' || t.status === 'fallback_retrying')
  )
  const download = async (): Promise<void> => {
    setError('')
    const pending = window.api.downloadP2PCore()
    onChange()
    try {
      await pending
    } catch (e) {
      setError(cleanIpcError(e))
    }
    onChange()
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-white/60">
          需要先下载 P2P 联机内核（开源的 EasyTier {core.version}，约 40 MB，下载后校验完整性）
        </div>
        <button
          onClick={() => void download()}
          disabled={core.downloading}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-60"
        >
          {core.downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {core.downloading ? '正在下载' : '一键下载'}
        </button>
      </div>
      {core.downloading && task && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full bg-sky-400 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-white/40">
            {Math.round(task.progress)}% · {task.speedText}
          </div>
        </div>
      )}
      {(error || core.error) && <div className="text-xs text-rose-300">{error || core.error}</div>}
    </div>
  )
}

/** 统计小格子 */
function Stat({
  icon: Icon,
  label,
  value,
  tone = '',
  title
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: string
  title?: string
}): JSX.Element {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2" title={title}>
      <div className="flex items-center gap-1 text-xs text-white/50">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-0.5 truncate font-medium ${tone}`}>{value}</div>
    </div>
  )
}

/** 房主：游戏世界的在线玩家 */
function playersText(status: MultiplayerStatus): { value: string; tone: string } {
  if (status.worldOnline === false) return { value: '世界未开放', tone: 'text-amber-300' }
  if (!status.players) return { value: '查询中…', tone: 'text-white/50' }
  return { value: `${status.players.online} / ${status.players.max}`, tone: '' }
}

/** 房间状态标签 */
function stateBadge(status: MultiplayerStatus): { label: string; tone: string } {
  const ok = 'bg-emerald-500/20 text-emerald-200'
  const warn = 'bg-amber-500/20 text-amber-200'
  if (status.state === 'error') return { label: '出错', tone: 'bg-rose-500/20 text-rose-200' }
  if (status.state !== 'running') return { label: '连接中', tone: warn }
  if (status.role === 'guest') return { label: '已连接', tone: ok }
  if (status.worldOnline === false) return { label: '世界未开放', tone: warn }
  const friends = (status.players?.online ?? 1) - 1
  return friends > 0 ? { label: `${friends} 位好友在线`, tone: ok } : { label: '等待好友加入', tone: ok }
}

/** 进行中的房间：房间码、连接方式、延迟、流量、在线玩家 */
function RoomCard({
  status,
  core,
  onCoreChange
}: {
  status: MultiplayerStatus
  core: P2PCoreStatus | null
  onCoreChange: () => void
}): JSX.Element {
  const [stopping, setStopping] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')
  const stop = async (): Promise<void> => {
    setStopping(true)
    try {
      await window.api.stopMultiplayer()
    } finally {
      setStopping(false)
    }
  }
  // 房客加入失败（例如刚下载完内核）时用同一个房间码重新加入；结果通过状态推送显示
  const retry = async (): Promise<void> => {
    if (!status.code) return
    setRetrying(true)
    try {
      await window.api.joinRoom(status.code)
    } catch {
      // 错误信息已经写进联机状态
    } finally {
      setRetrying(false)
      onCoreChange()
    }
  }
  // 房主降级成直连后，下载好内核再改用 P2P 房间（同一个游戏端口和中继）
  const upgrade = async (): Promise<void> => {
    setUpgrading(true)
    setUpgradeError('')
    try {
      await window.api.hostP2PRoom(status.gamePort ?? undefined, status.relay ?? undefined)
    } catch (e) {
      setUpgradeError(cleanIpcError(e))
    } finally {
      setUpgrading(false)
      onCoreChange()
    }
  }
  const canRetry = status.role === 'guest' && status.state === 'error' && !!status.code
  const canUpgrade = status.role === 'host' && status.fallback && !!core?.installed
  const badge = stateBadge(status)
  const players = playersText(status)
  const isHost = status.role === 'host'
  const showTraffic = !isHost || status.mode === 'p2p'
  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-300" />
          <h2 className="text-lg font-semibold">{isHost ? '我创建的房间' : '我加入的房间'}</h2>
          {status.mode && (
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs">{MODE_LABELS[status.mode]}</span>
          )}
          <span className={`rounded-md px-2 py-0.5 text-xs ${badge.tone}`}>{badge.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRetry && (
            <button
              onClick={() => void retry()}
              disabled={retrying || stopping || (status.needsP2PCore && !core?.installed)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              重新加入
            </button>
          )}
          <button
            onClick={() => void stop()}
            disabled={stopping || upgrading}
            className="flex items-center gap-1.5 rounded-xl bg-rose-500/80 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
          >
            <Power className="h-4 w-4" />
            {isHost ? '关闭房间' : '退出房间'}
          </button>
        </div>
      </div>

      {status.message && (
        <p className={`mt-3 text-sm ${status.state === 'error' ? 'text-rose-200' : 'text-white/70'}`}>
          {status.message}
        </p>
      )}

      {isHost && status.worldOnline === false && (
        <p className="mt-2 text-sm text-amber-200">
          检测不到本机的游戏世界{status.gamePort ? `（端口 ${status.gamePort}）` : ''}
          ：可能已经退出世界或关闭了游戏。重新进入世界并「对局域网开放」后会自动恢复；如果端口变了，需要关闭房间重新创建
        </p>
      )}

      {status.code && isHost && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white/50">房间码（发给好友，好友在「加入房间」里粘贴）</div>
            <div className="mt-1 break-all font-mono text-base font-semibold tracking-wide">{status.code}</div>
          </div>
          <CopyButton text={status.code} label="复制房间码" />
        </div>
      )}

      {!isHost && status.localPort && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white/50">
              打开游戏的「多人游戏」，房间会出现在列表底部；看不到时手动添加这个服务器地址
            </div>
            <div className="mt-1 font-mono text-base font-semibold">127.0.0.1:{status.localPort}</div>
          </div>
          <CopyButton text={`127.0.0.1:${status.localPort}`} label="复制地址" />
        </div>
      )}

      {(!isHost || status.gamePort !== null || showTraffic) && (
        <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
          {isHost ? (
            status.gamePort !== null && (
              <Stat
                icon={Users}
                label="在线玩家"
                value={players.value}
                tone={players.tone}
                title={status.players?.names.join('、') || undefined}
              />
            )
          ) : (
            <Stat icon={Gauge} label="延迟" value={status.latency === null ? '—' : `${status.latency} ms`} />
          )}
          {showTraffic && (
            <>
              <Stat icon={ArrowUp} label={isHost ? '发出' : '上行'} value={formatBytes(status.bytesUp)} />
              <Stat icon={ArrowDown} label={isHost ? '收到' : '下行'} value={formatBytes(status.bytesDown)} />
              <Stat icon={Network} label={isHost ? '好友连接' : '连接'} value={String(status.connections)} />
            </>
          )}
        </div>
      )}
      {isHost && status.players && status.players.names.length > 0 && (
        <div className="mt-2 truncate text-xs text-white/50" title={status.players.names.join('、')}>
          在线：{status.players.names.join('、')}
        </div>
      )}
      {((!isHost && status.target) || (status.mode === 'p2p' && status.relay)) && (
        <div className="mt-2 space-y-0.5 text-xs text-white/40">
          {!isHost && status.target && <div>连接到：{status.target}</div>}
          {status.mode === 'p2p' && status.relay && <div>中继服务器：{status.relay}</div>}
        </div>
      )}

      {status.needsP2PCore && (
        <div className="mt-4 space-y-3 rounded-xl bg-black/20 px-4 py-3">
          <CoreDownload core={core} onChange={onCoreChange} />
          {canUpgrade && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/60">
                现在可以改用 P2P 房间：会生成新的房间码，已经进入世界的好友不受影响
              </div>
              <button
                onClick={() => void upgrade()}
                disabled={upgrading || stopping}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
                改用 P2P 房间
              </button>
            </div>
          )}
          {upgradeError && <div className="text-xs text-rose-300">{upgradeError}</div>}
        </div>
      )}
    </section>
  )
}

/** 多人联机 */
function MultiplayerPage(): JSX.Element {
  const [status, setStatus] = useState<MultiplayerStatus | null>(null)
  const [core, setCore] = useState<P2PCoreStatus | null>(null)
  const [addresses, setAddresses] = useState<LocalAddresses | null>(null)
  const [tab, setTab] = useState<'host' | 'join'>('host')
  const [mode, setMode] = useState<MultiplayerMode>('direct')
  const [manualPort, setManualPort] = useState('')
  const [tunnelAddress, setTunnelAddress] = useState('')
  const [relay, setRelay] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const roleRef = useRef<MultiplayerStatus['role']>('idle')

  const refreshCore = (): void => {
    void window.api.getP2PCoreStatus().then(setCore)
  }

  useEffect(() => {
    let alive = true
    void window.api.getMultiplayerStatus().then((s) => {
      if (!alive) return
      setStatus(s)
      roleRef.current = s.role
    })
    void window.api.getLocalAddresses().then((a) => alive && setAddresses(a))
    refreshCore()
    const off = window.api.onMultiplayerStatus((s) => {
      setStatus(s)
      roleRef.current = s.role
    })
    // 在这个页面时自动检测「对局域网开放」的世界；有房间进行中时离开页面也继续检测
    void window.api.setLanSniffer(true)
    return () => {
      alive = false
      off()
      if (roleRef.current === 'idle') void window.api.setLanSniffer(false)
    }
  }, [])

  // 下载内核时定时刷新状态
  useEffect(() => {
    if (!core?.downloading) return
    const timer = setInterval(refreshCore, 1000)
    return () => clearInterval(timer)
  }, [core?.downloading])

  const run = async (action: () => Promise<MultiplayerStatus>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setStatus(next)
      roleRef.current = next.role
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(false)
      refreshCore()
    }
  }

  const port = manualPort.trim() ? Number(manualPort) : undefined
  const create = (): void => {
    if (mode === 'direct') void run(() => window.api.hostDirectRoom(port))
    else if (mode === 'p2p') void run(() => window.api.hostP2PRoom(port, relay.trim() || undefined))
    else void run(() => window.api.hostTunnelRoom(tunnelAddress))
  }
  const join = (): void => void run(() => window.api.joinRoom(code))

  const lanGame = status?.lanGame ?? null
  const active = status && status.role !== 'idle'
  const joinMode = codeMode(code)
  const canCreate =
    !busy && (mode === 'tunnel' ? tunnelAddress.trim() !== '' : lanGame !== null || manualPort.trim() !== '')

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex shrink-0 items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">联机</h1>
        <span className="flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-1.5 text-sm text-white/70">
          <Users className="h-4 w-4 text-emerald-300" />
          和好友一起玩
        </span>
      </div>

      {active && status && <RoomCard status={status} core={core} onCoreChange={refreshCore} />}

      {!active && (
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
          {/* 创建 / 加入 */}
          <div className="flex gap-2" role="tablist">
            {(
              [
                { key: 'host', label: '创建房间', icon: Plus },
                { key: 'join', label: '加入房间', icon: LogIn }
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => {
                  setTab(item.key)
                  setError('')
                }}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition-colors ${
                  tab === item.key ? 'bg-emerald-500 font-medium text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'host' ? (
            <div className="mt-4 space-y-4">
              {/* 本机对局域网开放的世界 */}
              <div className="flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                <Radio className={`h-5 w-5 shrink-0 ${lanGame ? 'text-emerald-300' : 'text-white/40'}`} />
                <div className="min-w-0 flex-1 text-sm">
                  {lanGame ? (
                    <>
                      已检测到对局域网开放的世界：<span className="font-medium">{lanGame.motd || '未命名世界'}</span>
                      <span className="ml-2 text-xs text-white/50">端口 {lanGame.port}</span>
                    </>
                  ) : (
                    <span className="text-white/60">
                      进入游戏后按 Esc，点「对局域网开放」，这里会自动识别端口
                      {mode !== 'tunnel' && '；也可以在右边手动填写端口'}
                    </span>
                  )}
                </div>
                {mode !== 'tunnel' && (
                  <input
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder={lanGame ? String(lanGame.port) : '端口'}
                    className="w-24 shrink-0 rounded-lg bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-white/30 focus:ring-1 focus:ring-emerald-400"
                  />
                )}
              </div>

              {/* 三种联机方式 */}
              <div className="grid grid-cols-3 gap-3">
                {MODES.map((item) => {
                  const selected = mode === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => setMode(item.key)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-emerald-400/50 bg-emerald-500/15'
                          : 'border-white/5 bg-black/20 hover:bg-black/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <item.icon className={`h-4 w-4 ${item.tint}`} />
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-white/50">{item.desc}</div>
                      {item.key === 'direct' && addresses && (
                        <div
                          className={`mt-2 text-xs ${addresses.ipv6.length > 0 ? 'text-emerald-300' : 'text-amber-300'}`}
                        >
                          {addresses.ipv6.length > 0
                            ? '本机有公网 IPv6'
                            : addresses.ipv4Public.length > 0
                              ? '本机有公网 IPv4'
                              : '本机没有公网地址，仅限同一局域网'}
                        </div>
                      )}
                      {item.key === 'p2p' && core && (
                        <div className={`mt-2 text-xs ${core.installed ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {core.installed ? '联机内核已就绪' : '首次使用需下载联机内核'}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {mode === 'p2p' && (
                <div className="space-y-3 rounded-xl bg-black/20 px-4 py-3">
                  <CoreDownload core={core} onChange={refreshCore} />
                  <label className="block text-xs text-white/50">
                    自定义中继服务器（可选，留空使用默认的公共节点；房间码会带上它，好友自动使用同一个）
                    <input
                      value={relay}
                      onChange={(e) => setRelay(e.target.value)}
                      placeholder="tcp://example.com:11010"
                      className="mt-1 w-full rounded-lg bg-black/30 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-emerald-400"
                    />
                  </label>
                </div>
              )}

              {mode === 'tunnel' && (
                <label className="block rounded-xl bg-black/20 px-4 py-3 text-xs text-white/50">
                  穿透地址：在樱花穿透、ChmlFrp、Cloudflare Tunnel 等工具里，把本机游戏的局域网端口映射出去后得到的地址
                  <input
                    value={tunnelAddress}
                    onChange={(e) => setTunnelAddress(e.target.value)}
                    placeholder="例如 frp-abc.example.com:12345"
                    className="mt-1 w-full rounded-lg bg-black/30 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-emerald-400"
                  />
                </label>
              )}

              <div className="flex items-center justify-end gap-3">
                {error && <span className="mr-auto text-sm text-rose-300">{error}</span>}
                <button
                  onClick={create}
                  disabled={!canCreate}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  创建房间
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && code.trim() && !busy && join()}
                  placeholder="粘贴好友发来的房间码，例如 MCL-P2P-XXXX-XXXX-XXXX"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-4 py-2.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-white/30 focus:ring-1 focus:ring-emerald-400"
                />
                <button
                  onClick={join}
                  disabled={!code.trim() || busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  加入
                </button>
              </div>
              <div className="text-xs text-white/50">
                {joinMode
                  ? `识别为「${MODE_LABELS[joinMode]}」房间码`
                  : '支持三种房间码：MCL-D-（极速直连）、MCL-P2P-（P2P 组网）、MCL-T-（内网穿透）'}
              </div>
              {joinMode === 'p2p' && core && !core.installed && (
                <div className="rounded-xl bg-black/20 px-4 py-3">
                  <CoreDownload core={core} onChange={refreshCore} />
                </div>
              )}
              {error && <div className="text-sm text-rose-300">{error}</div>}
            </div>
          )}
        </section>
      )}

      <ModInstaller />
    </div>
  )
}

/** 一键安装联机模组 */
function ModInstaller(): JSX.Element {
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [versionId, setVersionId] = useState('')
  const [busy, setBusy] = useState<MultiplayerMod | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void Promise.all([window.api.getInstalledVersions(), window.api.getSettings()]).then(([list, settings]) => {
      const modded = list.filter((v) => v.loader && v.loader !== 'optifine')
      setVersions(modded)
      setVersionId(modded.find((v) => v.id === settings.selectedVersion)?.id ?? modded[0]?.id ?? '')
    })
  }, [])

  const install = async (mod: MultiplayerMod): Promise<void> => {
    setBusy(mod)
    setResult(null)
    try {
      const res = await window.api.installMultiplayerMod(versionId, mod)
      const names = res.installed.map((i) => i.title).join('、')
      const missing = res.missingDependencies.length > 0 ? `；找不到前置：${res.missingDependencies.join('、')}` : ''
      setResult({ ok: true, text: `已安装 ${names || '（已是最新）'} 到「${versionId}」${missing}` })
    } catch (e) {
      setResult({ ok: false, text: cleanIpcError(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Puzzle className="h-5 w-5 text-violet-300" />
        <h2 className="text-lg font-semibold">联机模组</h2>
        <span className="text-xs text-white/50">不想用房间码时，也可以给版本装一个联机模组</span>
      </div>
      {versions.length === 0 ? (
        <p className="mt-3 text-sm text-white/50">
          没有安装了模组加载器的版本。联机模组需要 Fabric、Quilt、Forge 或 NeoForge，可以在「下载」页安装
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-white/60">安装到</span>
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-emerald-400"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-900">
                  {v.id}（{v.loader} · {v.minecraftVersion}）
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {MODS.map((mod) => (
              <div key={mod.key} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{mod.title}</div>
                  <div className="text-xs text-white/50">{mod.desc}</div>
                </div>
                <button
                  onClick={() => void install(mod.key)}
                  disabled={busy !== null || !versionId}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {busy === mod.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  安装
                </button>
              </div>
            ))}
          </div>
          {result && (
            <div className={`mt-3 text-sm ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{result.text}</div>
          )}
        </>
      )}
    </section>
  )
}

export default MultiplayerPage
