import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Box,
  Check,
  ChevronDown,
  Clock,
  Gamepad2,
  Layers,
  Loader2,
  Pencil,
  Play,
  Settings2,
  Square,
  Star,
  Terminal,
  Timer,
  Trophy,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import CrashCard from '../components/CrashCard'
import RecentPlays from '../components/RecentPlays'
import VersionIcon from '../components/VersionIcon'
import NewsPanel from '../components/NewsPanel'
import SplashText from '../components/SplashText'
import TriviaLine from '../components/TriviaLine'
import BirthdayConfetti from '../components/BirthdayConfetti'
import { isBirthdayToday } from '../../../shared/birthday'
import { supportsQuickPlay } from '../../../shared/quickPlay'
import { formatClock, formatDuration } from '../utils/format'
import { useAppearance } from '../utils/appearance'
import { renderWelcome } from '../utils/welcome'
import SkinHead from '../components/SkinHead'
import SkinViewer3D from '../components/SkinViewer3D'
import { closeGameLaunchOverlay, openGameLaunchOverlay } from '../components/GameLaunchOverlay'
import type {
  AccountsInfo,
  AppSettings,
  GameStatus,
  InstallStatus,
  GameResources,
  InstalledVersion,
  LaunchTiming,
  VersionPlayStats
} from '../../../shared/types'

/** 内存：不到 1 GB 时显示 MB */
function formatMemoryMb(mb: number): string {
  return mb < 1024 ? `${mb} MB` : `${(mb / 1024).toFixed(1)} GB`
}

/** 去掉 Electron 给 IPC 错误加的前缀 */
function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

/** 窗口够宽时主页分成左右两栏（右边是启动坞），窄的时候上下排列 */
const WIDE_QUERY = '(min-width: 1024px)'
/** 窄窗口里只有窗口够高才显示新闻（太矮时新闻会被挤成一条） */
const TALL_QUERY = '(min-height: 700px)'

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = (): void => setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** 上次游玩：今天、昨天、几天前、几个月前 */
function lastPlayedText(time: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.max(0, Math.ceil((today.getTime() - time) / 86_400_000))
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge',
  optifine: 'OptiFine'
}

/** 问候卡片下面的小标签：已安装版本、累计游玩、成就，点击跳到对应的页面 */
function StatChip({
  icon: Icon,
  children,
  onClick,
  title
}: {
  icon: LucideIcon
  children: ReactNode
  onClick?: () => void
  title?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs text-white/70 transition-colors enabled:hover:bg-black/25 enabled:hover:text-white disabled:cursor-default"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </button>
  )
}

interface VersionSelectProps {
  versions: InstalledVersion[]
  value: string
  onChange: (id: string) => void
  /** 宽度等样式 */
  className?: string
  /** 列表向下展开（默认向上） */
  dropDown?: boolean
}

function VersionSelect({ versions, value, onChange, className = 'w-52', dropDown }: VersionSelectProps): JSX.Element {
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
    <div ref={ref} className={`relative ${className}`}>
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
            initial={{ opacity: 0, y: dropDown ? -8 : 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropDown ? -8 : 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-20 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 popover-background p-1 shadow-2xl backdrop-blur-xl ${
              dropDown ? 'top-full mt-2' : 'bottom-full mb-2'
            }`}
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
  /** 打开「AI 助手」页 */
  onOpenAiSettings: () => void
  /** 打开「账号」页（点头像切换账号） */
  onOpenAccount?: () => void
  /** 打开「更多」里的某个工具（游玩报告、成就） */
  onOpenTool?: (tool: string) => void
}

function HomePage({
  onOpenVersionSettings,
  onManageVersions,
  onOpenAiSettings,
  onOpenAccount,
  onOpenTool
}: HomePageProps): JSX.Element {
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
  /** 日志窗口是否打开着（「日志」按钮可以打开或关闭它） */
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const off = window.api.onLogWindowState(setLogOpen)
    window.api
      .isLogWindowOpen()
      .then((open) => alive && setLogOpen(open))
      .catch(() => undefined)
    return () => {
      alive = false
      off()
    }
  }, [])

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
    // 在别处换了选中的版本（例如快速搜索 Ctrl+K 里「选择版本」）：跟着更新
    const offSettings = window.api.onSettingsChanged((next) =>
      setSettings((prev) =>
        prev && prev.selectedVersion !== next.selectedVersion
          ? { ...prev, selectedVersion: next.selectedVersion }
          : prev
      )
    )
    return () => {
      alive = false
      offInstall()
      offGame()
      offSettings()
    }
  }, [])

  // 使用微软账号时玩家名来自正版档案，不需要输入
  const external = accounts?.external.find((a) => a.id === accounts.active)
  const msAccount = accounts?.accounts.find((a) => a.uuid === accounts.active) ?? external
  const nameValid = msAccount ? true : NAME_PATTERN.test(name)
  const displayName = msAccount ? msAccount.name : name
  const birthdayToday = !!settings && isBirthdayToday(settings.birthday)
  const appearance = useAppearance()
  const busy = game.state === 'launching' || game.state === 'running'
  const selected = settings?.selectedVersion ?? ''
  const { welcomeTitle, welcomeSubtitle } = appearance
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

  /** 启动游戏：同一时间只发起一次，失败时在下方显示原因；world 不为空时直接进入这个存档 */
  const startGame = async (prepare: () => Promise<string>, world?: string): Promise<void> => {
    if (launching.current) return
    launching.current = true
    setLaunchError('')
    try {
      await saveName()
      const versionId = await prepare()
      // 立即播放启动动画，不等主进程（动画会跟随真实的启动进度）
      openGameLaunchOverlay(versionId)
      await window.api.launchGame(versionId, undefined, world)
    } catch (e) {
      // 启动请求被拒绝（例如游戏已在运行）：收起动画，在下方显示原因
      closeGameLaunchOverlay()
      setLaunchError(cleanError(e))
    } finally {
      launching.current = false
    }
  }

  const onLaunch = (): Promise<void> => startGame(async () => selected)

  /** 继续游戏：选中版本里最近玩过的存档（1.20 起可以跳过主菜单直接进入） */
  const [lastWorld, setLastWorld] = useState<{ folder: string; name: string } | null>(null)
  const selectedMc = versions.find((v) => v.id === selected)?.minecraftVersion ?? ''
  useEffect(() => {
    let alive = true
    if (!selected || !supportsQuickPlay(selectedMc) || game.state === 'running') {
      setLastWorld(null)
      return
    }
    window.api
      .listWorldInfos(selected)
      .then((list) => {
        const latest = list.worlds
          .filter((w) => !w.damaged && w.lastPlayed > 0)
          .sort((a, b) => b.lastPlayed - a.lastPlayed)[0]
        if (alive) setLastWorld(latest ? { folder: latest.folder, name: latest.name } : null)
      })
      .catch(() => alive && setLastWorld(null))
    return () => {
      alive = false
    }
    // 游戏结束后重新读取（可能玩了别的存档）
  }, [selected, selectedMc, game.state])
  const onContinue = (): Promise<void> => startGame(async () => selected, lastWorld?.folder)

  /** 从「最近游玩」启动：先切换主页选择的版本 */
  const launchRecent = (id: string): Promise<void> =>
    startGame(async () => {
      await selectVersion(id)
      return id
    })

  /** 「结束游戏」按钮：第一次点击后进入确认状态，3 秒内再点一次才真正结束（防止误点丢失进度） */
  const [killConfirm, setKillConfirm] = useState(false)
  const [killing, setKilling] = useState(false)
  const [killError, setKillError] = useState('')
  /** 进入确认状态的时间：双击时第二下来得太快，不当作确认（防止习惯性双击直接结束游戏） */
  const killArmedAt = useRef(0)
  useEffect(() => {
    if (!killConfirm) return
    const timer = setTimeout(() => setKillConfirm(false), 3000)
    return () => clearTimeout(timer)
  }, [killConfirm])
  /** 鼠标在启动按钮上（游戏运行中时显示为「结束游戏」） */
  const [launchHover, setLaunchHover] = useState(false)
  // 游戏状态变化时恢复按钮（游戏窗口挡住启动器时收不到鼠标移开的事件，悬停状态也一起清掉）
  useEffect(() => {
    setLaunchHover(false)
    if (game.state !== 'running') {
      setKillConfirm(false)
      setKilling(false)
    }
    if (game.state === 'launching') setKillError('')
  }, [game.state])
  const running = game.state === 'running'

  /** 这次启动用了多久（游戏窗口出现后读取） */
  const [timing, setTiming] = useState<LaunchTiming | null>(null)
  useEffect(() => {
    if (game.state !== 'running') {
      setTiming(null)
      return
    }
    // 主进程在窗口出现时记录，稍等再读
    const timer = setTimeout(() => {
      void window.api.getLaunchTiming().then(({ latest }) => {
        if (latest && latest.current.versionId === game.versionId && latest.current.at >= (game.startedAt ?? 0)) {
          setTiming(latest)
        }
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [game.state, game.versionId, game.startedAt])
  /** 游戏运行时的内存和 CPU 占用 */
  const [resources, setResources] = useState<GameResources | null>(null)
  useEffect(() => {
    if (!running) {
      setResources(null)
      return
    }
    void window.api.getGameResources().then(setResources)
    return window.api.onGameResources(setResources)
  }, [running])
  const stopStyle = killConfirm || killing || launchHover

  const onKill = async (): Promise<void> => {
    if (killing) return
    if (!killConfirm) {
      killArmedAt.current = Date.now()
      setKillError('')
      setKillConfirm(true)
      return
    }
    // 双击的第二下：不算确认
    if (Date.now() - killArmedAt.current < 400) return
    setKillConfirm(false)
    setKilling(true)
    try {
      // 已经不在运行（刚好自己退出了）时返回 false，按钮跟随状态推送消失
      if (!(await window.api.killGame())) setKilling(false)
    } catch (e) {
      setKilling(false)
      setKillError(cleanError(e))
    }
  }

  // 游戏运行时每秒刷新「本次已玩」时长
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (game.state !== 'running') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [game.state])

  /** 显示着崩溃提示：先不显示「最近游玩」，给原因分析（包括 AI 的回答）留出空间 */
  const crashShown = game.state === 'crashed' && !!game.error && !crashDismissed
  const wide = useMedia(WIDE_QUERY)
  const tall = useMedia(TALL_QUERY)
  const current = versions.find((v) => v.id === selected)
  const accountLabel = msAccount ? (external ? `外置账号 · ${external.serverName}` : '微软正版账号') : '离线账号'
  /** 头像和 3D 角色用的皮肤：正版 / 外置账号用账号的皮肤，离线账号用设置里选的皮肤 */
  const skin = msAccount ? msAccount.skin : (settings?.skinDataUrl ?? '')
  const skinModel = msAccount ? msAccount.skinModel : (settings?.skinModel ?? 'default')
  const [editingName, setEditingName] = useState(false)

  /** 问候卡片里的小标签：累计游玩时长、成就进度（游戏结束后刷新） */
  const [summary, setSummary] = useState<{
    playMs: number
    achieved: number
    achievements: number
    versions: Record<string, VersionPlayStats>
  } | null>(null)
  useEffect(() => {
    if (game.state === 'launching' || game.state === 'running') return
    let alive = true
    Promise.all([window.api.getPlayStats(), window.api.getAchievements()])
      .then(([stats, list]) => {
        if (!alive) return
        setSummary({
          playMs: Object.values(stats.versions).reduce((sum, v) => sum + v.totalMs, 0),
          achieved: list.filter((a) => a.unlockedAt).length,
          achievements: list.length,
          versions: stats.versions
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [game.state])

  // ---------- 启动坞里的各个部分（宽窄两种布局共用） ----------

  /** 玩家名：正版 / 外置账号显示名字，离线账号可以直接改 */
  const nameField = (centered: boolean): JSX.Element =>
    msAccount ? (
      <div className={`truncate text-lg font-semibold ${centered ? 'text-center' : ''}`}>{msAccount.name}</div>
    ) : (
      <div
        className={`flex items-center gap-2 rounded-xl border bg-black/20 px-3 py-2 ${
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
          aria-label="离线玩家名"
          className={`w-full bg-transparent text-sm outline-none placeholder:text-white/30 ${centered ? 'text-center' : ''}`}
        />
      </div>
    )

  /** 版本设置按钮（齿轮） */
  const settingsButton = (
    <button
      onClick={() => onOpenVersionSettings(selected)}
      disabled={!selected}
      title="版本设置：单独设置这个版本的内存、Java、窗口大小等"
      className="shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 text-white/70 hover:bg-black/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Settings2 className="h-4 w-4" />
    </button>
  )

  /** 日志按钮：打开或关闭游戏日志窗口 */
  const logButton = (compact: boolean): JSX.Element => (
    <button
      onClick={() =>
        window.api
          .toggleLogWindow()
          .then(setLogOpen)
          .catch(() => undefined)
      }
      aria-pressed={logOpen}
      aria-label="日志"
      title={logOpen ? '关闭游戏日志窗口' : '打开游戏日志窗口'}
      className={`flex shrink-0 items-center justify-center gap-2 rounded-xl border text-sm transition-colors ${
        compact ? 'w-14' : 'px-4 py-3'
      } ${
        logOpen
          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
          : 'border-white/10 bg-black/20 text-white/80 hover:bg-black/30 hover:text-white'
      }`}
    >
      <Terminal className="h-4 w-4" />
      {!compact && '日志'}
    </button>
  )

  /** 启动按钮：游戏运行中时变成「结束游戏」按钮，鼠标移上去变红，3 秒内点两次才结束（防止误点丢失进度） */
  const launchButton = (big: boolean): JSX.Element => (
    <motion.button
      whileHover={!busy && selected && nameValid ? { scale: big ? 1.02 : 1.04 } : undefined}
      whileTap={!busy && selected && nameValid ? { scale: 0.97 } : undefined}
      onClick={running ? () => void onKill() : onLaunch}
      onMouseEnter={() => setLaunchHover(true)}
      onMouseLeave={() => setLaunchHover(false)}
      disabled={running ? killing : busy || !selected || !nameValid}
      aria-label={running ? (killConfirm ? '确认结束游戏' : '结束游戏') : undefined}
      title={running ? '强制结束游戏：游戏卡死或无法正常关闭时使用，没有保存的进度会丢失' : undefined}
      className={`flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r font-semibold transition-colors disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none ${
        big ? 'h-14 min-w-0 flex-1 text-base' : 'px-8 py-[11px]'
      } ${
        running
          ? // 运行中固定最小宽度：切换「结束游戏」「确认结束？」文字时按钮宽度不变，这一行不会跳动
            (big ? '' : 'min-w-56 ') +
            (stopStyle
              ? 'from-red-600 to-rose-500 shadow-lg shadow-red-500/30 disabled:cursor-wait'
              : 'from-slate-600 to-slate-500')
          : (big ? '' : 'min-w-44 ') + 'from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/30'
      }`}
    >
      {game.state === 'launching' && <Loader2 className="h-5 w-5 animate-spin" />}
      {running && killing && <Loader2 className="h-5 w-5 animate-spin" />}
      {running && !killing && stopStyle && <Square className="h-4 w-4 fill-current" />}
      {running && !stopStyle && <Gamepad2 className="h-5 w-5" />}
      {!busy && <Play className="h-5 w-5 fill-current" />}
      {game.state === 'launching'
        ? '正在启动...'
        : running
          ? killing
            ? '正在结束…'
            : killConfirm
              ? '确认结束？'
              : launchHover
                ? '结束游戏'
                : `游戏运行中${game.startedAt ? ` · ${formatClock(now - game.startedAt)}` : ''}`
          : '启动游戏'}
    </motion.button>
  )

  /** 继续游戏：跳过主菜单直接进入上次玩的存档 */
  const continueButton = (full: boolean): JSX.Element | null =>
    lastWorld && !busy ? (
      <button
        onClick={() => void onContinue()}
        disabled={!nameValid}
        title={`跳过主菜单，直接进入上次玩的存档「${lastWorld.name}」`}
        className={`flex max-w-full items-center gap-1.5 rounded-lg text-xs text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50 ${
          full ? 'w-full justify-center border border-emerald-400/25 px-3 py-2' : 'px-2.5 py-1'
        }`}
      >
        <Play className="h-3.5 w-3.5 shrink-0 fill-current" />
        <span className="truncate">继续上次的存档「{lastWorld.name}」</span>
      </button>
    ) : null

  /** 运行状态、下载 Java 的进度和各种提示 */
  const statusLines = (stacked: boolean): JSX.Element => (
    <>
      {running && (timing || resources) && (
        <div
          className={`flex text-xs text-white/50 ${
            stacked ? 'flex-col gap-1.5' : 'flex-wrap items-center justify-between gap-x-4 gap-y-1'
          }`}
        >
          <span className="flex items-center gap-1.5" data-testid="game-resources">
            {resources && (
              <>
                <Activity className="h-3.5 w-3.5 shrink-0" />
                内存 {formatMemoryMb(resources.memoryMb)}
                {resources.maxMemoryMb > 0 && ` · 分配 ${formatMemoryMb(resources.maxMemoryMb)}`}
                {resources.cpuPercent !== null && ` · CPU ${resources.cpuPercent}%`}
              </>
            )}
          </span>
          {timing && (
            <span className="flex items-start gap-1.5">
              {stacked && <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                游戏启动用时 {(timing.current.ms / 1000).toFixed(1)} 秒
                {timing.previous &&
                  Math.abs(timing.current.ms - timing.previous.ms) >= 100 &&
                  ` · 比上次${timing.current.ms < timing.previous.ms ? '快' : '慢'} ${(Math.abs(timing.current.ms - timing.previous.ms) / 1000).toFixed(1)} 秒`}
                {timing.best && timing.current.ms < timing.best.ms && ' · 最快的一次！'}
              </span>
            </span>
          )}
        </div>
      )}
      {javaTask?.state === 'running' && (
        <div className="flex items-center gap-3 text-xs text-white/60">
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
      {killConfirm && <p className="text-xs text-red-300">再点一次「确认结束？」强制结束游戏，没有保存的进度会丢失</p>}
      {!nameValid && <p className="text-xs text-red-300">玩家名只能包含字母、数字和下划线，长度 3~16</p>}
      {launchError && <p className="text-xs text-red-300">启动失败：{launchError}</p>}
      {killError && <p className="text-xs text-red-300">结束游戏失败：{killError}</p>}
    </>
  )

  /** 版本下面的一行说明：游戏版本、加载器、是否隔离 */
  const versionMeta = current && (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/70">Minecraft {current.minecraftVersion}</span>
      {current.loader && (
        <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-sky-300">{LOADER_NAMES[current.loader]}</span>
      )}
      {current.isolated && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/60">版本隔离</span>}
    </div>
  )

  /** 选中版本的游玩情况：已玩多久、上次什么时候玩 */
  const versionStats = selected ? summary?.versions[selected] : undefined
  const versionPlayText = versionStats?.totalMs
    ? `已玩 ${formatDuration(versionStats.totalMs)}${versionStats.lastPlayed ? ` · ${lastPlayedText(versionStats.lastPlayed)}` : ''}`
    : '还没玩过'

  // ---------- 页面 ----------

  /** 问候卡片：欢迎语、闪烁标语、今日冷知识、小标签 */
  const hero = (
    <section className="relative shrink-0 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl lg:p-7">
      {settings?.showSplash && (
        <SplashText greeting={birthdayToday ? `生日快乐${nameValid ? `，${displayName}` : ''}！` : undefined} />
      )}
      {birthdayToday && appearance.animations && <BirthdayConfetti />}
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
      {settings?.showTrivia && <TriviaLine />}
      <div className="mt-4 flex flex-wrap gap-2">
        <StatChip icon={Layers} onClick={onManageVersions} title="管理已安装的版本">
          已安装 {versions.length} 个版本
        </StatChip>
        {summary && summary.playMs > 0 && (
          <StatChip icon={Clock} onClick={onOpenTool ? () => onOpenTool('report') : undefined} title="查看我的游玩报告">
            累计游玩 {formatDuration(summary.playMs)}
          </StatChip>
        )}
        {summary && summary.achievements > 0 && (
          <StatChip
            icon={Trophy}
            onClick={onOpenTool ? () => onOpenTool('achievements') : undefined}
            title="查看启动器成就"
          >
            成就 {summary.achieved} / {summary.achievements}
          </StatChip>
        )}
      </div>
    </section>
  )

  const crash = (
    <AnimatePresence>
      {crashShown && (
        <CrashCard
          game={game}
          onDismiss={() => setCrashDismissed(true)}
          onOpenAiSettings={onOpenAiSettings}
          onAction={(action) =>
            action === 'versionSettings' ? onOpenVersionSettings(game.versionId) : onManageVersions()
          }
        />
      )}
    </AnimatePresence>
  )

  const news = settings?.showNews ? (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <NewsPanel onHide={async () => setSettings(await window.api.updateSettings({ showNews: false }))} />
    </div>
  ) : (
    <div className="flex-1" />
  )

  const recentPlays = nameValid && settings?.showRecentPlays && !crashShown && (
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
  )

  /** 启动坞上沿的一道彩色光（琉璃的特色） */
  const prism = (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden rounded-t-2xl">
      <div className="h-full w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 opacity-80" />
    </div>
  )

  if (wide) {
    return (
      <div className="flex h-full gap-5">
        {/* 左边：问候在上，新闻和最近游玩在下，中间留白露出背景 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          {hero}
          {crash}
          <div className="min-h-0 flex-1" />
          {settings?.showNews && tall && (
            <NewsPanel onHide={async () => setSettings(await window.api.updateSettings({ showNews: false }))} />
          )}
          {recentPlays}
        </div>

        {/* 右边：启动坞 */}
        <aside
          aria-label="启动"
          className="relative flex w-[19rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl"
        >
          {prism}
          {/* 账号 */}
          <div className="flex items-center gap-2 text-xs text-white/55">
            <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/15 py-1 pl-1 pr-2.5">
              <SkinHead skin={skin} size={18} />
              <span className="truncate">{accountLabel}</span>
            </span>
            {onOpenAccount && (
              <button
                onClick={onOpenAccount}
                title="切换账号"
                className="ml-auto shrink-0 hover:text-white hover:underline"
              >
                切换账号
              </button>
            )}
          </div>

          {/* 玩家名：离线账号点一下就能改 */}
          <div className="mt-3 flex min-h-9 items-center justify-center">
            {msAccount ? (
              <div className="truncate text-2xl font-bold tracking-tight">{msAccount.name}</div>
            ) : editingName || !nameValid ? (
              <input
                autoFocus={editingName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  void saveName()
                  setEditingName(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                maxLength={16}
                placeholder="Steve"
                aria-label="离线玩家名"
                className={`w-full rounded-lg border bg-black/20 px-3 py-1 text-center text-xl font-bold outline-none ${
                  nameValid ? 'border-white/15' : 'border-red-400/60'
                }`}
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                title="点击修改离线玩家名"
                className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-0.5 hover:bg-white/10"
              >
                <span className="truncate text-2xl font-bold tracking-tight">{name}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-white/30 group-hover:text-white/70" />
              </button>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-white/50">
            {running ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                正在玩 {game.versionId}
              </>
            ) : (
              versionPlayText !== '还没玩过' && selected && `${selected} · ${versionPlayText}`
            )}
          </div>

          {/* 角色：站在一块发光的琉璃台上 */}
          <div className="relative -mx-5 min-h-[9rem] flex-1">
            <div
              className={`pointer-events-none absolute bottom-[6%] left-1/2 h-8 w-40 -translate-x-1/2 rounded-[50%] bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 blur-xl transition-opacity ${
                running ? 'opacity-70' : 'opacity-35'
              }`}
            />
            <div className="pointer-events-none absolute bottom-[8%] left-1/2 h-3 w-28 -translate-x-1/2 rounded-[50%] border border-white/30 bg-white/10" />
            <div className="absolute inset-0">
              <SkinViewer3D
                skin={skin}
                model={skinModel}
                animation="idle"
                autoRotate={false}
                nameTag=""
                zoom={0.78}
                angle={-0.5}
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <SkinHead skin={skin} size={96} />
                  </div>
                }
              />
            </div>
          </div>

          {/* 版本 */}
          <div className="flex gap-2">
            <VersionSelect versions={versions} value={selected} onChange={selectVersion} className="min-w-0 flex-1" />
            {settingsButton}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">{versionMeta}</div>
            <button
              onClick={onManageVersions}
              className="shrink-0 text-xs text-white/50 hover:text-white hover:underline"
            >
              管理版本
            </button>
          </div>

          {/* 状态和启动 */}
          <div className="mt-3 space-y-2 empty:hidden">{statusLines(true)}</div>
          <div className="mt-3 space-y-2">
            {continueButton(true)}
            <div className="flex gap-2">
              {launchButton(true)}
              {logButton(true)}
            </div>
          </div>
        </aside>
      </div>
    )
  }

  // 窄窗口：上下排列，问候和启动放在同一张卡片里（窗口矮的时候放得下）
  return (
    <div className="flex h-full flex-col justify-end gap-4">
      {tall ? news : <div className="flex-1" />}
      {recentPlays}
      {crash}
      <section className="relative shrink-0 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        {prism}
        {settings?.showSplash && (
          <SplashText greeting={birthdayToday ? `生日快乐${nameValid ? `，${displayName}` : ''}！` : undefined} />
        )}
        {birthdayToday && appearance.animations && <BirthdayConfetti />}
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
        {settings?.showTrivia && <TriviaLine />}
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-white/50">{msAccount ? accountLabel : '离线玩家名'}</span>
            <div className="flex w-44 items-center gap-2">
              {msAccount && <SkinHead skin={msAccount.skin} size={28} />}
              <div className="min-w-0 flex-1">{nameField(false)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-xs text-white/50">
              游戏版本
              <button onClick={onManageVersions} className="text-white/50 hover:text-white hover:underline">
                管理版本
              </button>
            </span>
            <div className="flex gap-2">
              <VersionSelect versions={versions} value={selected} onChange={selectVersion} />
              {settingsButton}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            {logButton(false)}
            {launchButton(false)}
          </div>
        </div>
        {(running || javaTask?.state === 'running' || killConfirm || !nameValid || launchError || killError) && (
          <div className="mt-3 space-y-2">{statusLines(false)}</div>
        )}
        {lastWorld && !busy && <div className="mt-2 flex justify-end">{continueButton(false)}</div>}
      </section>
    </div>
  )
}

export default HomePage
