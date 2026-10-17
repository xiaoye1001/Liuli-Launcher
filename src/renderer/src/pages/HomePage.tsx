import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Box, Check, ChevronDown, Gamepad2, Loader2, Play, Terminal, UserRound } from 'lucide-react'
import SkinHead from '../components/SkinHead'
import type { AccountsInfo, AppSettings, GameStatus, InstallStatus, InstalledVersion } from '../../../shared/types'

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

interface VersionSelectProps {
  versions: InstalledVersion[]
  value: string
  onChange: (id: string) => void
}

function VersionSelect({ versions, value, onChange }: VersionSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        <Box className="h-4 w-4 shrink-0 text-emerald-300" />
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
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  onChange(v.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <span className="flex-1 truncate font-mono">{v.id}</span>
                {v.id === value && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function HomePage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [name, setName] = useState('')
  const [game, setGame] = useState<GameStatus>({ state: 'idle', versionId: '' })
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null)
  /** 启动时自动下载 Java 的进度 */
  const [javaTask, setJavaTask] = useState<InstallStatus | null>(null)

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [loaded, installed, gameStatus, accountsInfo] = await Promise.all([
        window.api.getSettings(),
        window.api.getInstalledVersions(),
        window.api.getGameStatus(),
        window.api.getAccounts()
      ])
      setAccounts(accountsInfo)
      setSettings(loaded)
      setName(loaded.offlineName)
      setVersions(installed)
      setGame(gameStatus)
      // 上次选择的版本已不存在时，默认选第一个
      if (installed.length > 0 && !installed.some((v) => v.id === loaded.selectedVersion)) {
        setSettings(await window.api.updateSettings({ selectedVersion: installed[0].id }))
      }
    }
    init()
    const offInstall = window.api.onInstallStatus((status) => setJavaTask(status?.kind === 'java' ? status : null))
    const offGame = window.api.onGameStatus(setGame)
    return () => {
      offInstall()
      offGame()
    }
  }, [])

  // 使用微软账号时玩家名来自正版档案，不需要输入
  const msAccount = accounts?.accounts.find((a) => a.uuid === accounts.active)
  const nameValid = msAccount ? true : NAME_PATTERN.test(name)
  const displayName = msAccount ? msAccount.name : name
  const busy = game.state === 'launching' || game.state === 'running'
  const selected = settings?.selectedVersion ?? ''

  const saveName = async (): Promise<void> => {
    if (!msAccount && nameValid && settings && name !== settings.offlineName) {
      setSettings(await window.api.updateSettings({ offlineName: name }))
    }
  }

  const selectVersion = async (id: string): Promise<void> => {
    setSettings(await window.api.updateSettings({ selectedVersion: id }))
  }

  const onLaunch = async (): Promise<void> => {
    await saveName()
    await window.api.launchGame(selected)
  }

  return (
    <div className="flex h-full flex-col justify-end gap-4">
      <AnimatePresence>
        {game.state === 'crashed' && game.error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/20 px-5 py-4 text-sm text-red-100 backdrop-blur-xl"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div className="min-w-0">
              <div className="font-semibold">{game.versionId} 启动失败</div>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-sans text-xs text-red-200/90">
                {game.error}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-3xl font-bold tracking-tight">欢迎回来{nameValid ? `，${displayName}` : ''}</h1>
        <p className="mt-2 text-sm text-white/60">
          {versions.length > 0
            ? '选择版本后点击启动，开始你的冒险。'
            : '还没有安装任何版本，请先到「下载」页安装游戏。'}
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          {msAccount ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-white/50">微软账号（在账号页切换）</span>
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
            <span className="text-xs text-white/50">游戏版本</span>
            <VersionSelect versions={versions} value={selected} onChange={selectVersion} />
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
            {game.state === 'launching' ? '正在启动...' : game.state === 'running' ? '游戏运行中' : '启动游戏'}
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
      </div>
    </div>
  )
}

export default HomePage
