import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  Send,
  Server,
  Settings2,
  Square,
  Trash2,
  X
} from 'lucide-react'
import ServerPlayersPanel from './ServerPlayersPanel'
import ServerAddonsPanel from './ServerAddonsPanel'
import ServerRoomShare from './ServerRoomShare'
import type { InstalledVersion, LocalServer, LocalServerStatus } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const EULA_URL = 'https://aka.ms/MinecraftEULA'
const MEMORY_OPTIONS = [1024, 2048, 3072, 4096, 6144, 8192]
const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-emerald-400/50'

const STATE_LABELS: Record<LocalServerStatus['state'], { text: string; style: string }> = {
  stopped: { text: '已停止', style: 'bg-white/10 text-white/60' },
  starting: { text: '正在启动', style: 'bg-amber-500/20 text-amber-300' },
  running: { text: '运行中', style: 'bg-emerald-500/20 text-emerald-300' },
  stopping: { text: '正在停止', style: 'bg-amber-500/20 text-amber-300' },
  error: { text: '出错了', style: 'bg-rose-500/20 text-rose-300' }
}

function memoryText(mb: number): string {
  return mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`
}

interface Form {
  name: string
  version: string
  port: string
  memoryMb: number
  onlineMode: boolean
  acceptEula: boolean
}

function OnlineModeSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        正版验证（只允许正版账号加入）
      </label>
      {!value && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          关掉后任何人都能用任意名字加入（包括冒充别人），只在信任的朋友之间使用
        </p>
      )}
    </div>
  )
}

/** 百宝箱：一键开服 */
function LocalServerPanel(): JSX.Element {
  const [servers, setServers] = useState<LocalServer[] | null>(null)
  const [status, setStatus] = useState<LocalServerStatus>({
    id: null,
    state: 'stopped',
    addresses: [],
    port: 0,
    players: []
  })
  const [log, setLog] = useState<string[]>([])
  const [preparing, setPreparing] = useState<string[]>([])
  const [installed, setInstalled] = useState<InstalledVersion[]>([])
  const [releases, setReleases] = useState<string[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [editing, setEditing] = useState<(Omit<Form, 'version' | 'acceptEula'> & { id: string }) | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const [list, state] = await Promise.all([window.api.listLocalServers(), window.api.getLocalServerStatus()])
    setServers(list)
    setStatus(state.status)
    setLog(state.log)
    setPreparing(state.preparing)
  }, [])

  useEffect(() => {
    void refresh().catch((e) => setError(cleanError(e)))
    void window.api.getInstalledVersions().then(setInstalled)
    const offStatus = window.api.onLocalServerStatus((next) => {
      setStatus(next)
      void window.api.listLocalServers().then(setServers)
    })
    const offLog = window.api.onLocalServerLog((line) => setLog((prev) => [...prev, line].slice(-1000)))
    const offChanged = window.api.onLocalServersChanged(() => void refresh())
    return () => {
      offStatus()
      offLog()
      offChanged()
    }
  }, [refresh])

  // 新的输出出现时滚到底
  useEffect(() => {
    const box = logRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [log])

  const openForm = async (): Promise<void> => {
    setError('')
    setForm({ name: '', version: '', port: '25565', memoryMb: 2048, onlineMode: true, acceptEula: false })
    try {
      const manifest = await window.api.getVersionList()
      const list = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id)
      setReleases(list)
      setForm((f) => (f && !f.version ? { ...f, version: list[0] ?? '' } : f))
    } catch (e) {
      setError(`获取版本列表失败：${cleanError(e)}`)
    }
  }

  const run = async (key: string, action: () => Promise<string | void>): Promise<void> => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const message = await action()
      if (message) setNotice(message)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
      void refresh().catch(() => undefined)
    }
  }

  const create = (): Promise<void> =>
    run('create', async () => {
      if (!form) return
      const server = await window.api.createLocalServer({
        name: form.name,
        version: form.version,
        port: Number(form.port),
        memoryMb: form.memoryMb,
        onlineMode: form.onlineMode,
        acceptEula: form.acceptEula
      })
      setForm(null)
      return `「${server.name}」已经准备好了，点「启动」开服`
    })

  /** 加入时用的游戏版本：同名的版本优先，其次是这个游戏版本的原版，再其次是任何这个游戏版本的版本 */
  const gameFor = (server: LocalServer): InstalledVersion | undefined =>
    installed.find((v) => v.id === server.version) ??
    installed.find((v) => v.minecraftVersion === server.version && !v.loader) ??
    installed.find((v) => v.minecraftVersion === server.version)

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? '' : c)), 1500)
    })
  }

  const sendCommand = (): void => {
    const text = command.trim()
    if (!text) return
    setCommand('')
    void window.api.sendLocalServerCommand(text).catch((e) => setError(cleanError(e)))
  }

  const installedVersions = useMemo(() => new Set(installed.map((v) => v.minecraftVersion)), [installed])
  const live = status.state !== 'stopped' && status.state !== 'error'

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Server className="h-5 w-5 text-rose-300" />
        <h2 className="font-semibold">一键开服</h2>
        <span className="hidden text-xs text-white/50 sm:inline">
          在这台电脑上开一个原版服务器，和同一个局域网的朋友一起玩
        </span>
        {!form && (
          <button
            onClick={() => void openForm()}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            新建服务器
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {notice}
        </div>
      )}

      {/* 新建 */}
      {form && (
        <div className="space-y-3 rounded-xl bg-black/20 p-4" data-testid="server-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="text-xs text-white/50">名称（也是服务器列表里显示的简介）</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={40}
                placeholder="例如 周末生存服"
                aria-label="服务器名称"
                className={`mt-1 ${INPUT}`}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-white/50">游戏版本</span>
              <select
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                aria-label="服务器游戏版本"
                className={`mt-1 cursor-pointer ${INPUT}`}
              >
                {releases.length === 0 && <option value="">正在获取版本列表…</option>}
                {releases.map((v) => (
                  <option key={v} value={v} className="bg-slate-800 text-white">
                    {v}
                    {installedVersions.has(v) ? '（已安装这个版本的游戏）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-white/50">端口（一般不用改）</span>
              <input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                inputMode="numeric"
                aria-label="服务器端口"
                className={`mt-1 font-mono ${INPUT}`}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-white/50">分配内存</span>
              <select
                value={form.memoryMb}
                onChange={(e) => setForm({ ...form, memoryMb: Number(e.target.value) })}
                aria-label="服务器内存"
                className={`mt-1 cursor-pointer ${INPUT}`}
              >
                {MEMORY_OPTIONS.map((m) => (
                  <option key={m} value={m} className="bg-slate-800 text-white">
                    {memoryText(m)}
                    {m === 2048 ? '（3~5 个人够用）' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <OnlineModeSwitch value={form.onlineMode} onChange={(onlineMode) => setForm({ ...form, onlineMode })} />
          <div className="rounded-lg border border-white/10 px-3 py-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.acceptEula}
                onChange={(e) => setForm({ ...form, acceptEula: e.target.checked })}
                aria-label="同意 Minecraft EULA"
                className="mt-1"
              />
              <span>
                我已阅读并同意 Minecraft 最终用户许可协议（EULA）
                <span className="block text-xs text-white/50">
                  开服务器需要同意这份协议，勾选后启动器会替你在 eula.txt 里写上同意
                </span>
              </span>
            </label>
            <button
              onClick={() => window.open(EULA_URL, '_blank')}
              className="ml-6 mt-1 flex items-center gap-1 text-xs text-sky-300 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              阅读 Minecraft EULA
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setForm(null)}
              disabled={busy === 'create'}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={() => void create()}
              disabled={!!busy || !form.acceptEula || !form.version || !form.port}
              title={form.acceptEula ? undefined : '需要先同意 Minecraft EULA'}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy === 'create' ? '正在下载服务端…' : '创建并下载服务端'}
            </button>
          </div>
        </div>
      )}

      {servers?.length === 0 && !form && (
        <p className="py-6 text-center text-xs leading-6 text-white/50">
          还没有服务器。点「新建服务器」，选好游戏版本，启动器会下载官方服务端，一键就能开服。
          <br />
          同一个局域网（同一个 Wi-Fi）的朋友可以直接加入；不在一起的朋友可以用「联机」页
        </p>
      )}

      <div className="space-y-3">
        {servers?.map((server) => {
          const mine = status.id === server.id
          const state = mine ? status.state : 'stopped'
          const label = STATE_LABELS[state]
          const downloading = preparing.includes(server.id)
          const game = gameFor(server)
          const otherRunning = live && !mine
          return (
            <div key={server.id} className="rounded-xl bg-black/20 p-4" data-testid={`local-server-${server.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{server.name}</span>
                <span className="rounded bg-white/10 px-1.5 text-[11px] text-white/60">{server.version}</span>
                <span className={`rounded px-1.5 text-[11px] ${label.style}`}>
                  {downloading ? '正在下载服务端' : label.text}
                </span>
                <span className="text-xs text-white/40">
                  端口 {server.port} · {memoryText(server.memoryMb)} · {server.onlineMode ? '正版验证' : '允许离线账号'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {state === 'running' || state === 'starting' || state === 'stopping' ? (
                  <button
                    onClick={() => void run(`stop:${server.id}`, () => window.api.stopLocalServer())}
                    disabled={state === 'stopping'}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {state === 'stopping' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {state === 'stopping' ? '正在保存并停止…' : '停止'}
                  </button>
                ) : (
                  <button
                    onClick={() => void run(`start:${server.id}`, () => window.api.startLocalServer(server.id))}
                    disabled={!server.ready || downloading || otherRunning || !!busy}
                    title={
                      otherRunning ? '同一时间只能运行一个服务器' : !server.ready ? '服务端还没有下载好' : undefined
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === `start:${server.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    启动
                  </button>
                )}
                {state === 'running' && (
                  <button
                    onClick={() =>
                      game &&
                      void run('join', async () => {
                        await window.api.launchGame(
                          game.id,
                          server.port === 25565 ? 'localhost' : `localhost:${server.port}`
                        )
                        return `正在用 ${game.id} 启动游戏，进入后会自动连接这个服务器`
                      })
                    }
                    disabled={!game || !!busy}
                    title={game ? `用 ${game.id} 进入这个服务器` : `先在「下载」页安装 ${server.version} 的游戏`}
                    className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    我也进去玩
                  </button>
                )}
                {!server.ready && !downloading && (
                  <button
                    onClick={() =>
                      void run(`download:${server.id}`, async () => {
                        await window.api.redownloadLocalServer(server.id)
                        return '服务端下载好了'
                      })
                    }
                    disabled={!!busy}
                    className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    重新下载服务端
                  </button>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() =>
                      void window.api.openLocalServerFolder(server.id).catch((e) => setError(cleanError(e)))
                    }
                    title="打开服务器文件夹（存档、server.properties 都在里面）"
                    className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setEditing({
                        id: server.id,
                        name: server.name,
                        port: String(server.port),
                        memoryMb: server.memoryMb,
                        onlineMode: server.onlineMode
                      })
                    }
                    disabled={mine && live}
                    title={mine && live ? '先停止服务器再修改' : '修改名称、端口、内存'}
                    className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirmDelete !== server.id) {
                        setConfirmDelete(server.id)
                        setTimeout(() => setConfirmDelete((c) => (c === server.id ? '' : c)), 3000)
                        return
                      }
                      setConfirmDelete('')
                      void run(`delete:${server.id}`, async () => {
                        await window.api.deleteLocalServer(server.id)
                        return `已把「${server.name}」移到回收站（包括它的存档）`
                      })
                    }}
                    disabled={(mine && live) || downloading}
                    title="删除服务器（连同存档移到回收站）"
                    className={`flex items-center gap-1 rounded-lg p-1.5 text-xs disabled:opacity-40 ${
                      confirmDelete === server.id
                        ? 'bg-red-500/80 px-2 text-white'
                        : 'text-white/50 hover:bg-red-500/30 hover:text-red-200'
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    {confirmDelete === server.id && '确认删除？'}
                  </button>
                </div>
              </div>

              {/* 修改 */}
              {editing?.id === server.id && (
                <div className="mt-3 space-y-3 rounded-lg border border-white/10 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      maxLength={40}
                      aria-label="新的服务器名称"
                      className={INPUT}
                    />
                    <input
                      value={editing.port}
                      onChange={(e) => setEditing({ ...editing, port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                      aria-label="新的端口"
                      className={`font-mono ${INPUT}`}
                    />
                    <select
                      value={editing.memoryMb}
                      onChange={(e) => setEditing({ ...editing, memoryMb: Number(e.target.value) })}
                      aria-label="新的内存"
                      className={`cursor-pointer ${INPUT}`}
                    >
                      {[...new Set([...MEMORY_OPTIONS, editing.memoryMb])]
                        .sort((a, b) => a - b)
                        .map((m) => (
                          <option key={m} value={m} className="bg-slate-800 text-white">
                            {memoryText(m)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <OnlineModeSwitch
                    value={editing.onlineMode}
                    onChange={(onlineMode) => setEditing({ ...editing, onlineMode })}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    >
                      <X className="h-3.5 w-3.5" />
                      取消
                    </button>
                    <button
                      onClick={() =>
                        void run('edit', async () => {
                          await window.api.updateLocalServer(server.id, {
                            name: editing.name,
                            port: Number(editing.port),
                            memoryMb: editing.memoryMb,
                            onlineMode: editing.onlineMode
                          })
                          setEditing(null)
                          return '已保存，下次启动生效'
                        })
                      }
                      disabled={!!busy}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      保存
                    </button>
                  </div>
                </div>
              )}

              {/* 数据包、Fabric 和模组 */}
              {server.ready && (
                <ServerAddonsPanel
                  serverId={server.id}
                  version={server.version}
                  running={mine && live}
                  installed={installed}
                />
              )}

              {/* 运行中：地址和控制台 */}
              {mine && (live || state === 'error' || log.length > 0) && (
                <div className="mt-3 space-y-2">
                  {state === 'error' && status.message && (
                    <div className="flex items-start gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {status.message}
                    </div>
                  )}
                  {state === 'running' && (
                    <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs">
                      <div className="text-emerald-200">
                        开好了！同一个局域网的朋友在「多人游戏」里添加下面的地址就能加入（版本要一样）：
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {(status.addresses.length > 0 ? status.addresses : ['没有找到局域网地址']).map((a) => (
                          <button
                            key={a}
                            onClick={() => status.addresses.length > 0 && copy(a)}
                            title="复制地址"
                            className="flex items-center gap-1 rounded bg-black/20 px-2 py-0.5 font-mono text-white/80 hover:bg-black/30"
                          >
                            {a}
                            {status.addresses.length > 0 &&
                              (copied === a ? (
                                <Check className="h-3 w-3 text-emerald-300" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              ))}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1 text-white/40">
                        自己用这台电脑玩时地址填 localhost{server.port === 25565 ? '' : `:${server.port}`}
                      </div>
                    </div>
                  )}
                  {state === 'running' && <ServerRoomShare />}
                  {state === 'running' && <ServerPlayersPanel serverId={server.id} online={status.players} />}
                  <div
                    ref={logRef}
                    role="log"
                    aria-label="服务器输出"
                    className="h-48 overflow-y-auto rounded-lg px-3 py-2 font-mono text-[11px] leading-5"
                    style={{ background: '#0b0f14', color: '#c9d1d9' }}
                  >
                    {log.slice(-300).map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all">
                        {line}
                      </div>
                    ))}
                  </div>
                  {live && (
                    <div className="flex gap-2">
                      <input
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
                        maxLength={256}
                        placeholder="输入服务器命令，例如 op 你的名字、say 大家好、time set day"
                        aria-label="服务器命令"
                        disabled={state !== 'running'}
                        className={`font-mono ${INPUT}`}
                      />
                      <button
                        onClick={sendCommand}
                        disabled={state !== 'running' || !command.trim()}
                        title="发送"
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default LocalServerPanel
