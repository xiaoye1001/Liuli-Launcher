import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Server,
  Signal,
  Trash2,
  Users,
  WifiOff
} from 'lucide-react'
import type {
  AppSettings,
  GameStatus,
  InstalledVersion,
  MotdSegment,
  SavedServer,
  ServerStatus
} from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 延迟颜色：越低越绿 */
function latencyColor(ms: number): string {
  if (ms < 80) return 'text-emerald-300'
  if (ms < 200) return 'text-amber-300'
  return 'text-red-300'
}

/** 服务器简介：按游戏里的颜色显示，固定使用深色底，浅色主题下也看得清 */
function Motd({ segments }: { segments: MotdSegment[] }): JSX.Element {
  return (
    <div
      className="mt-1.5 line-clamp-2 whitespace-pre-wrap break-all rounded-md px-2 py-1 font-mono text-xs leading-5"
      style={{ background: '#16161b', color: '#AAAAAA' }}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            color: s.color,
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? 'italic' : undefined,
            textDecoration:
              [s.underlined && 'underline', s.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined
          }}
        >
          {s.text}
        </span>
      ))}
    </div>
  )
}

interface FormState {
  id?: string
  name: string
  address: string
  versionId: string
}

const EMPTY_FORM: FormState = { name: '', address: '', versionId: '' }

/** 服务器列表：收藏服务器、查看状态、启动游戏并直接进入 */
function ServersPage(): JSX.Element {
  const [servers, setServers] = useState<SavedServer[] | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ServerStatus | 'loading'>>({})
  const [installed, setInstalled] = useState<InstalledVersion[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [game, setGame] = useState<GameStatus>({ state: 'idle', versionId: '' })
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在启动并加入的服务器 */
  const [joining, setJoining] = useState<string | null>(null)

  /** 每个地址最近一次查询的序号：刷新时旧的查询结果不会覆盖新的 */
  const pingSeq = useRef(new Map<string, number>())
  /** 正在发起加入 / 保存：防止连续点击重复执行 */
  const joiningRef = useRef(false)
  const submitting = useRef(false)

  const ping = useCallback(async (address: string) => {
    const seq = (pingSeq.current.get(address) ?? 0) + 1
    pingSeq.current.set(address, seq)
    setStatuses((prev) => ({ ...prev, [address]: 'loading' }))
    const status = await window.api.pingServer(address).catch(
      (e): ServerStatus => ({
        online: false,
        error: cleanError(e),
        motd: [],
        version: '',
        players: { online: 0, max: 0, sample: [] }
      })
    )
    if (pingSeq.current.get(address) !== seq) return
    setStatuses((prev) => ({ ...prev, [address]: status }))
  }, [])

  const pingAll = useCallback(
    (list: SavedServer[]) => {
      for (const address of new Set(list.map((s) => s.address))) ping(address)
    },
    [ping]
  )

  useEffect(() => {
    Promise.all([window.api.listServers(), window.api.getInstalledVersions(), window.api.getSettings()]).then(
      ([list, versions, loaded]) => {
        setServers(list)
        setInstalled(versions)
        setSettings(loaded)
        pingAll(list)
      }
    )
    window.api.getGameStatus().then(setGame)
    return window.api.onGameStatus(setGame)
  }, [pingAll])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const submit = async (): Promise<void> => {
    if (!form || submitting.current) return
    submitting.current = true
    setFormError('')
    try {
      const list = await window.api.saveServer(form)
      setServers(list)
      const saved = form.id ? list.find((s) => s.id === form.id) : list[list.length - 1]
      if (saved) ping(saved.address)
      setForm(null)
    } catch (e) {
      setFormError(cleanError(e))
    } finally {
      submitting.current = false
    }
  }

  const join = async (server: SavedServer): Promise<void> => {
    if (joiningRef.current) return
    joiningRef.current = true
    try {
      await joinServer(server)
    } finally {
      joiningRef.current = false
    }
  }

  const joinServer = (server: SavedServer): Promise<void> =>
    run(async () => {
      const versionId = server.versionId || settings?.selectedVersion || ''
      if (!versionId) throw new Error('还没有可以启动的游戏版本，请先在「下载」页安装')
      if (!installed.some((v) => v.id === versionId)) {
        throw new Error(`找不到版本 ${versionId}，请编辑服务器重新选择游戏版本`)
      }
      setJoining(server.id)
      await window.api.launchGame(versionId, server.address)
      setNotice(`正在用 ${versionId} 启动游戏，进入后会自动连接 ${server.name}`)
    })

  const busy = game.state === 'launching' || game.state === 'running'
  const defaultVersion = settings?.selectedVersion

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">服务器</h1>
          <p className="mt-1 text-xs text-white/50">
            共 {servers?.length ?? 0} 个 · 点「加入」会启动游戏并直接进入服务器
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={() =>
              run(async () => {
                const { added, list } = await window.api.importGameServers()
                setServers(list)
                pingAll(list.slice(list.length - added))
                setNotice(
                  added > 0 ? `从游戏的多人游戏列表导入了 ${added} 个服务器` : '游戏的多人游戏列表里没有新的服务器'
                )
              })
            }
            title="导入游戏「多人游戏」里保存的服务器（servers.dat）"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
            从游戏导入
          </button>
          <button
            onClick={() => servers && pingAll(servers)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            onClick={() => {
              setFormError('')
              setForm({ ...EMPTY_FORM })
            }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium shadow-lg shadow-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
            添加服务器
          </button>
        </div>
      </div>

      {form && (
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-3 font-semibold">{form.id ? '编辑服务器' : '添加服务器'}</div>
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3">
            <label className="block">
              <span className="text-xs text-white/60">名称</span>
              <input
                value={form.name}
                maxLength={64}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：我的生存服"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/70"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">地址</span>
              <input
                value={form.address}
                autoFocus
                spellCheck={false}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="例如 mc.example.com 或 127.0.0.1:25565"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 font-mono text-sm outline-none placeholder:font-sans placeholder:text-white/30 focus:border-sky-400/70"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">使用的游戏版本</span>
              <select
                value={form.versionId}
                onChange={(e) => setForm({ ...form, versionId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-sky-400/70"
              >
                <option value="" className="bg-slate-800">
                  主页选择的版本{defaultVersion ? `（${defaultVersion}）` : ''}
                </option>
                {installed.map((v) => (
                  <option key={v.id} value={v.id} className="bg-slate-800">
                    {v.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError && <p className="mt-2 text-xs text-red-300">{formError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!form.address.trim()}
              className="rounded-lg bg-emerald-500/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <section className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        {servers === null && (
          <div className="flex justify-center py-10 text-white/50">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {servers?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-white/50">
            <Server className="h-10 w-10 text-white/20" />
            还没有收藏服务器，点「添加服务器」或「从游戏导入」
          </div>
        )}
        {servers?.map((server, index) => {
          const status = statuses[server.address]
          return (
            <div key={server.id} className="group flex items-center gap-4 rounded-xl bg-black/20 px-4 py-3">
              {status && status !== 'loading' && status.favicon ? (
                <img
                  src={status.favicon}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg [image-rendering:pixelated]"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Server className="h-7 w-7 text-white/30" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{server.name}</span>
                  <span className="truncate font-mono text-xs text-white/40">{server.address}</span>
                  {server.versionId && (
                    <span
                      className="shrink-0 rounded-md bg-white/10 px-1.5 text-xs text-white/50"
                      title="加入时使用的游戏版本"
                    >
                      {server.versionId}
                    </span>
                  )}
                </div>
                {status === 'loading' || !status ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/40">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在连接…
                  </div>
                ) : status.online ? (
                  status.motd.length > 0 && <Motd segments={status.motd} />
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
                    <WifiOff className="h-3.5 w-3.5" />
                    {status.error ?? '无法连接'}
                  </div>
                )}
              </div>

              {status && status !== 'loading' && status.online && (
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span
                    className="flex items-center gap-1 text-white/80"
                    title={
                      status.players.sample.length > 0 ? `在线玩家：${status.players.sample.join('、')}` : undefined
                    }
                  >
                    <Users className="h-3.5 w-3.5" />
                    {status.players.online} / {status.players.max}
                  </span>
                  {status.latency !== undefined && (
                    <span className={`flex items-center gap-1 ${latencyColor(status.latency)}`}>
                      <Signal className="h-3.5 w-3.5" />
                      {status.latency} ms
                    </span>
                  )}
                  {status.version && (
                    <span className="max-w-32 truncate text-white/40" title={status.version}>
                      {status.version}
                    </span>
                  )}
                </div>
              )}

              {/* 排序与编辑：鼠标移上去时显示 */}
              <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => run(async () => setServers(await window.api.moveServer(server.id, -1)))}
                  disabled={index === 0}
                  title="上移"
                  className="rounded p-0.5 text-white/50 hover:text-white disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => run(async () => setServers(await window.api.moveServer(server.id, 1)))}
                  disabled={index === servers.length - 1}
                  title="下移"
                  className="rounded p-0.5 text-white/50 hover:text-white disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => {
                  setFormError('')
                  setForm({ id: server.id, name: server.name, address: server.address, versionId: server.versionId })
                }}
                title="编辑"
                className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => run(async () => setServers(await window.api.deleteServer(server.id)))}
                title="删除"
                className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-red-500/30 hover:text-red-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => join(server)}
                disabled={busy}
                title={busy ? '游戏正在运行' : '启动游戏并进入这个服务器'}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium shadow-lg shadow-emerald-500/20 disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none"
              >
                {game.state === 'launching' && joining === server.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                加入
              </button>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default ServersPage
