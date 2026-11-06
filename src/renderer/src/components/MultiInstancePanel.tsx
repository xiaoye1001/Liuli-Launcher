import { useEffect, useState } from 'react'
import { ChevronDown, CopyPlus, Info, Loader2, Play, Square, X } from 'lucide-react'
import type { AppSettings, ExtraInstance, GameStatus, InstalledVersion } from '../../../shared/types'

const NAME = /^[A-Za-z0-9_]{3,16}$/

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function uptime(since: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60000))
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 多开：在主游戏之外再开几个游戏窗口（不同的离线名字） */
function MultiInstancePanel(): JSX.Element {
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [game, setGame] = useState<GameStatus | null>(null)
  const [list, setList] = useState<ExtraInstance[]>([])
  const [versionId, setVersionId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [openTail, setOpenTail] = useState<string | null>(null)
  const [confirmKill, setConfirmKill] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    void Promise.all([window.api.getInstalledVersions(), window.api.getSettings()]).then(([installed, s]) => {
      setVersions(installed)
      setSettings(s)
      setVersionId(installed.some((v) => v.id === s.selectedVersion) ? s.selectedVersion : (installed[0]?.id ?? ''))
      // 默认名字：别的离线账号，没有时用「主名字_2」
      const other = s.offlineAccounts.find((a) => a.name !== s.offlineName && NAME.test(a.name))
      setName(other?.name ?? `${s.offlineName}_2`.slice(0, 16))
    })
    void window.api.listExtraInstances().then(setList)
    window.api.getGameStatus().then(setGame)
    const offGame = window.api.onGameStatus(setGame)
    const offList = window.api.onExtraInstances(setList)
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      offGame()
      offList()
      clearInterval(timer)
    }
  }, [])

  const run = async (key: string, action: () => Promise<ExtraInstance[]>): Promise<void> => {
    setBusy(key)
    setError('')
    try {
      setList(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const running = list.filter((i) => i.state === 'running')
  const mainPlaying = game && (game.state === 'launching' || game.state === 'running')
  const nameOk = NAME.test(name)

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <CopyPlus className="h-4 w-4 text-sky-300" />
          再开一个游戏窗口
        </div>
        <p className="text-xs leading-5 text-white/50">
          {
            '在主游戏之外同时开几个窗口，每个用不同的离线名字。适合自己测试联机（一个开局域网、一个加入）、同时挂两个号。多开的窗口使用版本设置里的 Java、内存和参数，但不运行启动前 / 退出后命令；每个窗口都要占一份内存。'
          }
        </p>
        <div className="text-xs text-white/60">
          主窗口：
          {mainPlaying ? (
            <span className="text-emerald-300">
              正在运行 {game.versionId}（{settings?.offlineName}）
            </span>
          ) : (
            '没有运行（可以在主页正常启动）'
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-white/50">
            版本
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              aria-label="多开的版本"
              className="min-w-[10rem] rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none focus:border-emerald-400/50"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/50">
            离线名字
            <input
              value={name}
              onChange={(e) => setName(e.target.value.trim())}
              maxLength={16}
              aria-label="多开的离线名字"
              className={`w-40 rounded-lg border bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none ${
                nameOk ? 'border-white/15 focus:border-emerald-400/50' : 'border-red-400/50'
              }`}
            />
          </label>
          <button
            onClick={() => void run('launch', () => window.api.launchExtraInstance(versionId, name))}
            disabled={!!busy || !versionId || !nameOk}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === 'launch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            多开启动
          </button>
        </div>
        {!nameOk && <div className="text-xs text-red-300">名字只能是 3～16 个字母、数字或下划线</div>}
        {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        <div className="flex items-start gap-1.5 text-[11px] text-white/40">
          <Info className="mt-px h-3 w-3 shrink-0" />
          多开只能用离线名字：同一个正版账号同时进同一个服务器会互相挤掉。开正版服务器时请只用主窗口
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="text-sm font-semibold">多开的窗口（{running.length} 个运行中）</div>
        {list.length === 0 && <div className="text-xs text-white/40">还没有多开的窗口</div>}
        {list.map((i) => (
          <div key={i.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm" data-testid="extra-instance">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${i.state === 'running' ? 'bg-emerald-400' : 'bg-white/30'}`}
              />
              <span className="font-medium">{i.name}</span>
              <span className="text-xs text-white/50">{i.versionId}</span>
              <span className="flex-1 truncate text-xs text-white/40">
                {i.state === 'running'
                  ? `运行中 · ${uptime(i.startedAt, now)} · ${i.maxMemory} MB · PID ${i.pid}`
                  : `已退出${i.exitCode !== null && i.exitCode !== 0 ? `（退出码 ${i.exitCode}）` : ''}`}
              </span>
              {i.tail.length > 0 && (
                <button
                  onClick={() => setOpenTail((v) => (v === i.id ? null : i.id))}
                  className="flex items-center gap-0.5 text-xs text-sky-300 hover:underline"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${openTail === i.id ? 'rotate-180' : ''}`} />
                  输出
                </button>
              )}
              {i.state === 'running' ? (
                confirmKill === i.id ? (
                  <button
                    onClick={() => {
                      setConfirmKill(null)
                      void run(`kill:${i.id}`, () => window.api.killExtraInstance(i.id))
                    }}
                    onBlur={() => setConfirmKill(null)}
                    className="rounded-md bg-red-500/30 px-2 py-0.5 text-xs text-red-100 hover:bg-red-500/50"
                  >
                    确认结束（不会保存）
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmKill(i.id)}
                    title="强制结束这个窗口"
                    aria-label={`结束 ${i.name}`}
                    className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-red-300"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )
              ) : (
                <button
                  onClick={() => void run(`clear:${i.id}`, () => window.api.clearExtraInstance(i.id))}
                  title="从列表里去掉"
                  aria-label={`移除 ${i.name}`}
                  className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {openTail === i.id && (
              <div
                className="mt-2 max-h-40 overflow-y-auto rounded-lg px-2 py-1.5 font-mono text-[11px] leading-4"
                style={{ background: '#0b0f14', color: '#c9d1d9' }}
              >
                {i.tail.map((line, n) => (
                  <div key={n} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}

export default MultiInstancePanel
