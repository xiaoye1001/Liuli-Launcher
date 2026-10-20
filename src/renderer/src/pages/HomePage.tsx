import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box, Check, ChevronDown, Gamepad2, Loader2, Play, Settings2, Star, Terminal, UserRound } from 'lucide-react'
import CrashCard from '../components/CrashCard'
import RecentPlays from '../components/RecentPlays'
import VersionIcon from '../components/VersionIcon'
import NewsPanel from '../components/NewsPanel'
import { formatClock } from '../utils/format'
import { useAppearance } from '../utils/appearance'
import { renderWelcome } from '../utils/welcome'
import SkinHead from '../components/SkinHead'
import { closeGameLaunchOverlay, openGameLaunchOverlay } from '../components/GameLaunchOverlay'
import type { AccountsInfo, AppSettings, GameStatus, InstallStatus, InstalledVersion } from '../../../shared/types'

/** 去掉 Electron 给 IPC 错误加的前缀 */
function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

interface VersionSelectProps {
  versions: InstalledVersion[]
  value: string
  onChange: (id: string) => void
}

function VersionSelect({ versions, value, onChange }: VersionSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // 收藏的版本排在前面
  const sorted = [...versions].sort((a, b) => Number(b.favorite) - Number(a.favorite))
  const current = versions.find((v) => v.id === value)

  // 点击外部时关闭下拉框
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative w-52">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={versions.length === 0}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm hover:bg-black/30 disabled:opacity-50"
      >
        {current ? (
          <VersionIcon icon={current.icon} iconUrl={current.iconUrl} className="h-5 w-5" />
        ) : (
          <Box className="h-4 w-4 shrink-0 text-emerald-300" />
        )}
        <span className="flex-1 truncate font-mono">{value || '尚未安装任何版本'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full z-20 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 popover-background p-1 shadow-2xl backdrop-blur-xl"
          >
            {sorted.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  onChange(v.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <VersionIcon icon={v.icon} iconUrl={v.iconUrl} className="h-5 w-5" />
                <span className="flex-1 truncate font-mono">{v.id}</span>
                {v.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-300" />}
                {v.id === value && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface HomePageProps {
  /** 打开某个版本的版本设置（跳转到「版本」页） */
  onOpenVersionSettings: (versionId: string) => void
  onManageVersions: () => void
}

function HomePage({ onOpenVersionSettings, onManageVersions }: HomePageProps): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [name, setName] = useState('')
  const [game, setGame] = useState<GameStatus>({ state: 'idle', versionId: '' })
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null)
  /** 启动时自动下载 Java 的进度 */
  const [javaTask, setJavaTask] = useState<InstallStatus | null>(null)
  /** 关闭崩溃提示，下次启动后重新显示 */
  const [crashDismissed, setCrashDismissed] = useState(false)
  const [launchError, setLaunchError] = useState('')
  /** 正在发起启动：防止连续点击重复启动 */
  const launching = useRef(false)

  useEffect(() => {
    /** 加载期间已经收到了游戏状态推送：推送的更新，不再用加载开始时取到的旧状态覆盖 */
    let gotGameEvent = false
    let alive = true
    // 游戏状态单独取，不等扫描已安装版本（扫描可能要一会儿）
    void window.api.getGameStatus().then((status) => {
      if (alive && !gotGameEvent) setGame(status)
    })
    const init = async (): Promise<void> => {
      try {
        const [loaded, installed, accountsInfo] = await Promise.all([
          window.api.getSettings(),
          window.api.getInstalledVersions(),
          window.api.getAccounts()
        ])
        if (!alive) return
        setAccounts(accountsInfo)
        setSettings(loaded)
        setName(loaded.offlineName)
        setVersions(installed)
        // 上次选择的版本已不存在时，默认选第一个
        if (installed.length > 0 && !installed.some((v) => v.id === loaded.selectedVersion)) {
          const next = await window.api.updateSettings({ selectedVersion: installed[0].id })
          if (alive) setSettings(next)
        }
      } catch (e) {
        if (alive) setLaunchError(`读取启动器信息失败：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    void init()
    const offInstall = window.api.onInstallStatus((status) => setJavaTask(status?.kind === 'java' ? status : null))
    const offGame = window.api.onGameStatus((status) => {
      gotGameEvent = true
      setGame(status)
      setCrashDismissed(false)
    })
    return () => {
      alive = false
      offInstall()
      offGame()
    }
  }, [])

  // 使用微软账号时玩家名来自正版档案，不需要输入
  const external = accounts?.external.find((a) => a.id === accounts.active)
  const msAccount = accounts?.accounts.find((a) => a.uuid === accounts.active) ?? external
  const nameValid = msAccount ? true : NAME_PATTERN.test(name)
  const displayName = msAccount ? msAccount.name : name
  const busy = game.state === 'launching' || game.state === 'running'
  const selected = settings?.selectedVersion ?? ''
  const { welcomeTitle, welcomeSubtitle } = useAppearance()
  const welcomeValues = { name: nameValid ? displayName : '', version: selected }

  const saveName = async (): Promise<void> => {
    if (!msAccount && nameValid && settings && name !== settings.offlineName) {
      setSettings(await window.api.updateSettings({ offlineName: name }))
    }
  }

  const selectVersion = async (id: string): Promise<void> => {
    try {
      setSettings(await window.api.updateSettings({ selectedVersion: id }))
    } catch (e) {
      setLaunchError(`切换版本失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 启动游戏：同一时间只发起一次，失败时在下方显示原因 */
  const startGame = async (prepare: () => Promise<string>): Promise<void> => {
    if (launching.current) return
    launching.current = true
    setLaunchError('')
    try {
      await saveName()
      const versionId = await prepare()
      // 立即播放启动动画，不等主进程（动画会跟随真实的启动进度）
      openGameLaunchOverlay(versionId)
      await window.api.launchGame(versionId)
    } catch (e) {
      // 启动请求被拒绝（例如游戏已在运行）：收起动画，在下方显示原因
      closeGameLaunchOverlay()
      setLaunchError(cleanError(e))
    } finally {
      launching.current = false
    }
  }

  const onLaunch = (): Promise<void> => startGame(async () => selected)

  /** 从「最近游玩」启动：先切换主页选择的版本 */
  const launchRecent = (id: string): Promise<void> =>
    startGame(async () => {
      await selectVersion(id)
      return id
    })

  // 游戏运行时每秒刷新「本次已玩」时长
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (game.state !== 'running') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [game.state])

  return (
    <div className="flex h-full flex-col justify-end gap-4">
      {settings?.showNews && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NewsPanel onHide={async () => setSettings(await window.api.updateSettings({ showNews: false }))} />
        </div>
      )}
      {nameValid && settings?.showRecentPlays && (
        <RecentPlays
          versions={versions}
          game={game}
          onLaunch={launchRecent}
          collapsed={settings.recentPlaysCollapsed}
          onToggleCollapsed={async () =>
            setSettings(await window.api.updateSettings({ recentPlaysCollapsed: !settings.recentPlaysCollapsed }))
          }
          onHide={async () => setSettings(await window.api.updateSettings({ showRecentPlays: false }))}
        />
      )}

      <AnimatePresence>
        {game.state === 'crashed' && game.error && !crashDismissed && (
          <CrashCard
            game={game}
            onDismiss={() => setCrashDismissed(true)}
            onAction={(action) =>
              action === 'versionSettings' ? onOpenVersionSettings(game.versionId) : onManageVersions()
            }
          />
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-3xl font-bold tracking-tight">
          {welcomeTitle ? renderWelcome(welcomeTitle, welcomeValues) : `欢迎回来${nameValid ? `，${displayName}` : ''}`}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {versions.length === 0
            ? '还没有安装任何版本，请先到「下载」页安装游戏。'
            : welcomeSubtitle
              ? renderWelcome(welcomeSubtitle, welcomeValues)
              : '选择版本后点击启动，开始你的冒险。'}
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          {msAccount ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">
                {external ? `外置账号 · ${external.serverName}` : '微软账号（在账号页切换）'}
              </span>
              <div className="flex w-44 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <SkinHead skin={msAccount.skin} size={24} />
                <span className="truncate text-sm font-medium">{msAccount.name}</span>
              </div>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">离线玩家名</span>
              <div
                className={`flex w-44 items-center gap-2 rounded-xl border bg-black/20 px-4 py-3 ${
                  nameValid ? 'border-white/10' : 'border-red-400/60'
                }`}
              >
                <UserRound className="h-4 w-4 shrink-0 text-sky-300" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  maxLength={16}
                  placeholder="Steve"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
                />
              </div>
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-xs text-white/50">
              游戏版本
              <button onClick={onManageVersions} className="text-white/50 hover:text-white hover:underline">
                管理版本
              </button>
            </span>
            <div className="flex gap-2">
              <VersionSelect versions={versions} value={selected} onChange={selectVersion} />
              <button
                onClick={() => onOpenVersionSettings(selected)}
                disabled={!selected}
                title="版本设置：单独设置这个版本的内存、Java、窗口大小等"
                className="rounded-xl border border-white/10 bg-black/20 px-3 text-white/70 hover:bg-black/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            onClick={() => window.api.openLogWindow()}
            title="打开游戏日志窗口"
            className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 hover:bg-black/30 hover:text-white"
          >
            <Terminal className="h-4 w-4" />
            日志
          </button>

          <motion.button
            whileHover={!busy && selected && nameValid ? { scale: 1.04 } : undefined}
            whileTap={!busy && selected && nameValid ? { scale: 0.96 } : undefined}
            onClick={onLaunch}
            disabled={busy || !selected || !nameValid}
            className="flex min-w-44 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3 font-semibold shadow-lg shadow-emerald-500/30 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none"
          >
            {game.state === 'launching' && <Loader2 className="h-5 w-5 animate-spin" />}
            {game.state === 'running' && <Gamepad2 className="h-5 w-5" />}
            {!busy && <Play className="h-5 w-5 fill-current" />}
            {game.state === 'launching'
              ? '正在启动...'
              : game.state === 'running'
                ? `游戏运行中${game.startedAt ? ` · ${formatClock(now - game.startedAt)}` : ''}`
                : '启动游戏'}
          </motion.button>
        </div>
        {javaTask?.state === 'running' && (
          <div className="mt-3 flex items-center gap-3 text-xs text-white/60">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="shrink-0">正在下载该版本需要的 {javaTask.versionId}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${javaTask.total > 0 ? (javaTask.progress / javaTask.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        {!nameValid && <p className="mt-2 text-xs text-red-300">玩家名只能包含字母、数字和下划线，长度 3~16</p>}
        {launchError && <p className="mt-2 text-xs text-red-300">启动失败：{launchError}</p>}
      </div>
    </div>
  )
}

export default HomePage
