import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Box,
  CheckCircle2,
  Coffee,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  Download,
  ImageIcon,
  Info,
  Rocket,
  Sparkles,
  Layers,
  Globe,
  Loader2,
  MemoryStick,
  Network,
  XCircle,
  ShieldCheck,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Sun,
  type LucideIcon
} from 'lucide-react'
import { backgroundUrl } from '../utils/appearance'
import { downloadLabel, ReleaseNotes } from '../components/UpdateNotice'
import type {
  AccentColor,
  AfterLaunch,
  AppSettings,
  DownloadSource,
  GameDirInfo,
  InstallStatus,
  JavaInfo,
  JavaRuntimeInfo,
  MemoryPlan,
  NetworkCheck,
  ProxyMode,
  ThemeMode,
  UpdateInfo,
  VersionIsolation
} from '../../../shared/types'

const SOURCES: { key: DownloadSource; label: string; desc: string }[] = [
  { key: 'bmclapi', label: 'BMCLAPI 镜像', desc: '国内高速镜像，推荐' },
  { key: 'mojang', label: '官方源', desc: 'Mojang 官方服务器' }
]

/** 主题色：色块显示主色到副色的渐变（与 index.css 中的变量一致） */
const ACCENTS: { key: AccentColor; label: string; from: string; to: string }[] = [
  { key: 'emerald', label: '翡翠绿', from: '#10b981', to: '#06b6d4' },
  { key: 'sky', label: '天空蓝', from: '#0ea5e9', to: '#6366f1' },
  { key: 'violet', label: '星辰紫', from: '#8b5cf6', to: '#d946ef' },
  { key: 'rose', label: '樱花粉', from: '#f43f5e', to: '#f97316' },
  { key: 'amber', label: '琥珀橙', from: '#f59e0b', to: '#f97316' }
]

const AFTER_LAUNCH: { key: AfterLaunch; label: string; desc: string }[] = [
  { key: 'keep', label: '保持不变', desc: '启动器窗口保持原样' },
  { key: 'minimize', label: '最小化', desc: '游戏退出后自动恢复' },
  { key: 'hide', label: '隐藏', desc: '游戏退出或崩溃后自动出现' }
]

const ISOLATIONS: { key: VersionIsolation; label: string; desc: string }[] = [
  { key: 'modded', label: '隔离模组版本（推荐）', desc: 'Forge、Fabric 等版本互不干扰' },
  { key: 'all', label: '隔离所有版本', desc: '每个版本都有独立的存档与设置' },
  { key: 'off', label: '关闭', desc: '所有版本共用游戏目录' }
]

const THEMES: { key: ThemeMode; label: string; icon: LucideIcon }[] = [
  { key: 'system', label: '跟随系统', icon: Monitor },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'light', label: '浅色', icon: Sun }
]

const MEMORY_STEP = 256
const MEMORY_MIN = 1024

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 2)} GB` : `${mb} MB`
}

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [totalMemory, setTotalMemory] = useState(8192)
  const [memoryDraft, setMemoryDraft] = useState(MEMORY_MIN)
  /** 当前选中版本自动分配的内存 */
  const [memoryPlan, setMemoryPlan] = useState<MemoryPlan | null>(null)
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()
  const sliderTimer = useRef<ReturnType<typeof setTimeout>>()
  const [backgroundError, setBackgroundError] = useState('')
  const [runtimes, setRuntimes] = useState<JavaRuntimeInfo[] | null>(null)
  const [runtimesError, setRuntimesError] = useState('')
  /** 当前的下载任务（用于显示 Java 下载进度） */
  const [task, setTask] = useState<InstallStatus | null>(null)
  const [gameDir, setGameDir] = useState<GameDirInfo | null>(null)
  const [gameDirBusy, setGameDirBusy] = useState(false)
  const [gameDirError, setGameDirError] = useState('')

  /** 执行切换游戏目录的操作，统一处理加载状态与错误 */
  const changeGameDir = async (action: () => Promise<GameDirInfo | null>): Promise<void> => {
    setGameDirBusy(true)
    setGameDirError('')
    try {
      const info = await action()
      if (info) {
        setGameDir(info)
        setSettings((prev) => (prev ? { ...prev, gameDir: info.path } : prev))
      }
    } catch (e) {
      setGameDirError(cleanError(e))
    } finally {
      setGameDirBusy(false)
    }
  }

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    const saved = await window.api.updateSettings(patch)
    setSettings(saved)
  }

  /** 拖动滑块时先更新界面，停止拖动 150 毫秒后再保存，避免频繁写入设置文件 */
  const updateSlider = (patch: Partial<AppSettings>): void => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    clearTimeout(sliderTimer.current)
    sliderTimer.current = setTimeout(() => update(patch), 150)
  }

  const changeBackground = async (action: () => Promise<AppSettings>): Promise<void> => {
    setBackgroundError('')
    try {
      setSettings(await action())
    } catch (e) {
      setBackgroundError(cleanError(e))
    }
  }

  const loadRuntimes = async (): Promise<void> => {
    setRuntimesError('')
    try {
      setRuntimes(await window.api.getJavaRuntimes())
    } catch (e) {
      setRuntimesError(cleanError(e))
    }
  }

  const downloadJava = async (component: string): Promise<void> => {
    setRuntimesError('')
    try {
      await window.api.downloadJava(component)
      await loadRuntimes()
      if (settings) await scan(settings)
    } catch (e) {
      setRuntimesError(cleanError(e))
    }
  }

  const scan = async (current: AppSettings): Promise<void> => {
    setScanning(true)
    setError('')
    try {
      const list = await window.api.scanJava()
      setJavaList(list)
      // 手动模式下已保存的 Java 不存在时，自动选择版本最高的一个
      if (!current.javaAuto && list.length > 0 && !list.some((j) => j.path === current.javaPath)) {
        await update({ javaPath: list[0].path })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    const init = async (): Promise<void> => {
      const [loaded, info, dirInfo] = await Promise.all([
        window.api.getSettings(),
        window.api.getSystemInfo(),
        window.api.getGameDirInfo()
      ])
      setSettings(loaded)
      setGameDir(dirInfo)
      setTotalMemory(info.totalMemory)
      setMemoryDraft(loaded.maxMemory)
      if (loaded.selectedVersion) window.api.previewMemory(loaded.selectedVersion).then(setMemoryPlan)
      await scan(loaded)
    }
    init()
    loadRuntimes()
    window.api.getInstallStatus().then(setTask)
    const offStatus = window.api.onInstallStatus(setTask)
    return () => {
      clearTimeout(memoryTimer.current)
      offStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 拖动滑块时只更新界面，停止拖动 400ms 后再保存
  const onMemoryChange = (value: number): void => {
    setMemoryDraft(value)
    clearTimeout(memoryTimer.current)
    memoryTimer.current = setTimeout(() => update({ maxMemory: value }), 400)
  }

  const memoryMax = Math.max(MEMORY_MIN, Math.floor((totalMemory - 1024) / MEMORY_STEP) * MEMORY_STEP)

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto pb-4 pr-1">
      <h1 className="text-3xl font-bold tracking-tight">设置</h1>

      {/* 外观 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-fuchsia-300" />
          <div>
            <h2 className="text-lg font-semibold">外观</h2>
            <p className="text-xs text-white/50">主题、主题色、背景图片与界面动画</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const active = settings.theme === theme.key
            const Icon = theme.icon
            return (
              <button
                key={theme.key}
                onClick={() => update({ theme: theme.key })}
                className={`relative flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                  active ? 'border-emerald-400/50' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                {active && <div className="absolute inset-0 rounded-xl bg-emerald-500/15" />}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10 font-medium">{theme.label}</span>
              </button>
            )
          })}
        </div>

        {/* 主题色 */}
        <div className="mt-6 text-sm font-medium">主题色</div>
        <div className="mt-3 flex flex-wrap gap-4">
          {ACCENTS.map((accent) => {
            const active = settings.accentColor === accent.key
            return (
              <button
                key={accent.key}
                onClick={() => update({ accentColor: accent.key })}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-transparent transition ${
                    active ? 'ring-white/80' : 'ring-transparent hover:ring-white/30'
                  }`}
                  style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                >
                  {active && <CheckCircle2 className="h-5 w-5 text-[#fff]" />}
                </span>
                <span className={`text-xs ${active ? 'text-white' : 'text-white/50'}`}>{accent.label}</span>
              </button>
            )
          })}
        </div>

        {/* 背景图片 */}
        <div className="mt-6 text-sm font-medium">背景图片</div>
        <div className="mt-3 flex items-center gap-4">
          <div
            className="h-16 w-28 shrink-0 rounded-lg border border-white/10 bg-cover bg-center app-background"
            style={
              settings.backgroundImage
                ? { backgroundImage: `url("${backgroundUrl(settings.backgroundImage)}")` }
                : undefined
            }
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => changeBackground(() => window.api.pickBackground())}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <ImageIcon className="h-4 w-4" />
              选择图片...
            </button>
            {settings.backgroundImage && (
              <button
                onClick={() => changeBackground(() => window.api.clearBackground())}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
              >
                <RotateCcw className="h-4 w-4" />
                恢复默认
              </button>
            )}
          </div>
        </div>
        {settings.backgroundImage && (
          <div className="mt-4 grid grid-cols-2 gap-6">
            <label className="block">
              <div className="flex justify-between text-xs text-white/60">
                <span>模糊</span>
                <span>{settings.backgroundBlur} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={settings.backgroundBlur}
                onChange={(e) => updateSlider({ backgroundBlur: Number(e.target.value) })}
                className="mt-2 w-full accent-emerald-500"
              />
            </label>
            <label className="block">
              <div className="flex justify-between text-xs text-white/60">
                <span>遮罩</span>
                <span>{settings.backgroundDim}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                value={settings.backgroundDim}
                onChange={(e) => updateSlider({ backgroundDim: Number(e.target.value) })}
                className="mt-2 w-full accent-emerald-500"
              />
            </label>
          </div>
        )}
        {backgroundError && (
          <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{backgroundError}</div>
        )}

        {/* 界面动画 */}
        <div className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            <div>
              <div className="text-sm font-medium">界面动画</div>
              <div className="text-xs text-white/50">关闭后页面切换与按钮效果不再有动画，适合配置较低的电脑</div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={settings.animations}
            onClick={() => update({ animations: !settings.animations })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.animations ? 'bg-emerald-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                settings.animations ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* 游戏目录 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-sky-300" />
            <div>
              <h2 className="text-lg font-semibold">游戏目录</h2>
              <p className="text-xs text-white/50">游戏版本、存档、资源包等文件的存放位置（.minecraft 文件夹）</p>
            </div>
          </div>
          <button
            onClick={() => window.api.openGameDir()}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            <ExternalLink className="h-4 w-4" />
            打开文件夹
          </button>
        </div>

        {gameDir && (
          <div className="mt-5 rounded-xl bg-black/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm" title={gameDir.path}>
                {gameDir.path}
              </span>
              {gameDir.isDefault && (
                <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/60">默认目录</span>
              )}
              {gameDir.isOfficial && (
                <span className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                  官方启动器目录
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-white/50">已安装 {gameDir.versionCount} 个版本</div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => changeGameDir(() => window.api.pickGameDir())}
            disabled={gameDirBusy}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            {gameDirBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
            选择文件夹...
          </motion.button>
          {gameDir?.officialExists && !gameDir.isOfficial && (
            <button
              onClick={() => changeGameDir(() => window.api.setGameDir(gameDir.officialDir))}
              disabled={gameDirBusy}
              title={gameDir.officialDir}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
            >
              <Box className="h-4 w-4" />
              使用官方启动器目录
            </button>
          )}
          {gameDir && !gameDir.isDefault && (
            <button
              onClick={() => changeGameDir(() => window.api.setGameDir(gameDir.defaultDir))}
              disabled={gameDirBusy}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              恢复默认
            </button>
          )}
        </div>

        {gameDirError && (
          <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{gameDirError}</div>
        )}
      </section>

      {/* Java 运行环境 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="text-lg font-semibold">Java 运行环境</h2>
              <p className="text-xs text-white/50">不同的游戏版本需要不同的 Java，推荐让启动器自动选择</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => scan(settings)}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? '扫描中...' : '重新扫描'}
          </motion.button>
        </div>

        {/* 自动选择 */}
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
          <div>
            <div className="text-sm font-medium">自动选择 Java（推荐）</div>
            <div className="text-xs text-white/50">
              启动和安装时按游戏版本挑选合适的 Java，本机没有时自动下载。关闭后始终使用下方选中的 Java
            </div>
          </div>
          <button
            role="switch"
            aria-checked={settings.javaAuto}
            onClick={() => update({ javaAuto: !settings.javaAuto })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.javaAuto ? 'bg-emerald-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                settings.javaAuto ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-4 text-sm font-medium">
          本机的 Java
          <span className="ml-2 text-xs font-normal text-white/40">
            {settings.javaAuto ? '点击可以改为手动指定' : '点击选择启动游戏使用的 Java'}
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {error && <div className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">扫描失败：{error}</div>}
          {!scanning && !error && javaList.length === 0 && (
            <div className="rounded-xl bg-black/20 px-4 py-6 text-center text-sm text-white/50">
              未找到任何 Java，可以在下方一键下载
            </div>
          )}
          <AnimatePresence>
            {javaList.map((java, index) => {
              const active = !settings.javaAuto && java.path === settings.javaPath
              return (
                <motion.button
                  key={java.path}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => update({ javaPath: java.path, javaAuto: false })}
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
                  }`}
                >
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-lg font-bold">
                    {java.majorVersion}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Java {java.version}</div>
                    <div className="truncate font-mono text-xs text-white/50" title={java.path}>
                      {java.path}
                    </div>
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>

        {/* 下载 Java */}
        <div className="mt-5 text-sm font-medium">
          下载 Java
          <span className="ml-2 text-xs font-normal text-white/40">
            与官方启动器相同的 Java 运行环境，保存在启动器数据目录
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {runtimes === null && !runtimesError && (
            <div className="col-span-2 flex items-center gap-2 px-1 py-2 text-xs text-white/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在获取可下载的 Java…
            </div>
          )}
          {runtimes?.map((runtime) => {
            const label = `Java ${runtime.majorVersion}`
            const current = task?.kind === 'java' && task.versionId === label ? task : null
            const downloading = current?.state === 'running'
            const percent = current && current.total > 0 ? Math.round((current.progress / current.total) * 100) : 0
            const busy = task?.state === 'running'
            return (
              <div key={runtime.component} className="flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                <div className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono font-bold">
                  {runtime.majorVersion}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-white/50">
                    {downloading
                      ? `下载中 ${percent}%`
                      : runtime.installed
                        ? `已下载 · ${runtime.version}`
                        : runtime.version}
                  </div>
                  {downloading && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </div>
                {runtime.installed && !downloading ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                ) : (
                  <button
                    onClick={() => downloadJava(runtime.component)}
                    disabled={busy}
                    title={busy && !downloading ? '有下载任务正在进行' : undefined}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {downloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    下载
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {runtimesError && (
          <div className="mt-2 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{runtimesError}</div>
        )}
      </section>

      {/* 内存分配 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MemoryStick className="h-5 w-5 text-sky-300" />
            <div>
              <h2 className="text-lg font-semibold">游戏内存</h2>
              <p className="text-xs text-white/50">
                {settings.memoryAuto
                  ? '启动时根据电脑的可用内存和模组数量自动决定'
                  : `本机物理内存 ${formatMemory(totalMemory)}，建议分配 2 ~ 8 GB`}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-black/30 px-4 py-2 font-mono text-lg font-bold text-sky-300">
            {settings.memoryAuto ? (memoryPlan ? formatMemory(memoryPlan.memory) : '自动') : formatMemory(memoryDraft)}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {(
            [
              [true, '自动分配（推荐）', '按可用内存与模组数量分配'],
              [false, '手动设置', '所有版本使用固定的内存']
            ] as const
          ).map(([auto, label, desc]) => {
            const active = settings.memoryAuto === auto
            return (
              <button
                key={label}
                onClick={() => update({ memoryAuto: auto })}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-white/50">{desc}</div>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
              </button>
            )
          })}
        </div>
        {settings.memoryAuto ? (
          <div className="mt-4 rounded-xl bg-black/20 px-4 py-3 text-xs leading-5 text-white/60">
            {memoryPlan ? (
              <>
                启动「{settings.selectedVersion}」预计分配{' '}
                <span className="font-medium text-white">{formatMemory(memoryPlan.memory)}</span>
                {memoryPlan.mods > 0 ? `（${memoryPlan.mods} 个模组，` : '（'}建议{' '}
                {formatMemory(memoryPlan.recommended)}
                {memoryPlan.free !== null ? `，当前可用 ${formatMemory(memoryPlan.free)}` : ''}）
                {memoryPlan.limited && (
                  <div className="mt-1 text-amber-300">当前可用内存不足，会少分配一些，建议启动前关闭其他程序</div>
                )}
              </>
            ) : (
              '原版分配 2 GB；模组版本从 3 GB 起，模组越多分配越多（最多 12 GB），并给系统留出足够的内存'
            )}
            <div className="mt-1 text-white/40">在版本设置里可以为单个版本指定内存</div>
          </div>
        ) : (
          <>
            <input
              type="range"
              min={MEMORY_MIN}
              max={memoryMax}
              step={MEMORY_STEP}
              value={Math.min(memoryDraft, memoryMax)}
              onChange={(e) => onMemoryChange(Number(e.target.value))}
              className="mt-6 w-full cursor-pointer accent-sky-400"
            />
            <div className="mt-1 flex justify-between text-xs text-white/40">
              <span>{formatMemory(MEMORY_MIN)}</span>
              <span>{formatMemory(memoryMax)}</span>
            </div>
          </>
        )}
      </section>

      {/* 启动游戏 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Rocket className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="text-lg font-semibold">启动游戏</h2>
            <p className="text-xs text-white/50">游戏窗口出现后，启动器窗口如何处理</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {AFTER_LAUNCH.map((option) => {
            const active = settings.afterLaunch === option.key
            return (
              <button
                key={option.key}
                onClick={() => update({ afterLaunch: option.key })}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-white/50">{option.desc}</div>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <div>
              <div className="text-sm font-medium">启动前检查游戏文件</div>
              <div className="text-xs text-white/50">发现缺失或损坏的依赖库、资源文件时自动下载补全，避免启动失败</div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={settings.checkFiles}
            aria-label="启动前检查游戏文件"
            onClick={() => update({ checkFiles: !settings.checkFiles })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              settings.checkFiles ? 'bg-emerald-500' : 'bg-white/20'
            }`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                settings.checkFiles ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* 版本隔离 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-violet-300" />
          <div>
            <h2 className="text-lg font-semibold">版本隔离</h2>
            <p className="text-xs text-white/50">
              隔离的版本把模组、存档、配置放在 versions/版本名 文件夹里，不同版本的模组互不干扰
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {ISOLATIONS.map((option) => {
            const active = settings.versionIsolation === option.key
            return (
              <button
                key={option.key}
                onClick={() => update({ versionIsolation: option.key })}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-white/50">{option.desc}</div>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/40">
          修改后从下次启动开始生效。开启前放在游戏目录 mods 文件夹里的模组，需要手动移到对应版本的文件夹中。
        </p>
      </section>

      {/* 下载源 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-emerald-300" />
          <div>
            <h2 className="text-lg font-semibold">下载源</h2>
            <p className="text-xs text-white/50">下载游戏本体、依赖库与资源文件时使用的服务器</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {SOURCES.map((source) => {
            const active = settings.downloadSource === source.key
            return (
              <button
                key={source.key}
                onClick={() => update({ downloadSource: source.key })}
                className={`relative rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-emerald-400/50' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                {active && <div className="absolute inset-0 rounded-xl bg-emerald-500/15" />}
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{source.label}</div>
                    <div className="text-xs text-white/50">{source.desc}</div>
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 下载与网络 */}
      <NetworkSection settings={settings} onSettings={setSettings} />

      {/* 关于与更新 */}
      <AboutSection
        autoCheck={settings.autoCheckUpdate}
        onAutoCheckChange={(value) => update({ autoCheckUpdate: value })}
      />
    </div>
  )
}

const PROXY_MODES: { key: ProxyMode; label: string; desc: string }[] = [
  { key: 'none', label: '不使用代理', desc: '直接连接' },
  { key: 'system', label: '系统代理', desc: '跟随系统的代理设置' },
  { key: 'custom', label: '手动设置', desc: '填写 HTTP 代理地址' }
]

/** 下载与网络：同时下载数、代理、测试连接 */
function NetworkSection({
  settings,
  onSettings
}: {
  settings: AppSettings
  onSettings: (settings: AppSettings) => void
}): JSX.Element {
  const [threads, setThreads] = useState(settings.downloadThreads)
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<NetworkCheck | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async (patch: Partial<AppSettings>): Promise<boolean> => {
    setError('')
    setCheck(null)
    try {
      onSettings(await window.api.updateSettings(patch))
      return true
    } catch (e) {
      setError(cleanError(e))
      return false
    }
  }

  const onThreads = (value: number): void => {
    setThreads(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save({ downloadThreads: value }), 400)
  }

  // 保存后显示整理过的地址（例如自动补上 http://）
  useEffect(() => setProxyUrl(settings.proxyUrl), [settings.proxyUrl])

  const commitProxyUrl = async (): Promise<void> => {
    if (proxyUrl !== settings.proxyUrl) await save({ proxyUrl })
  }

  const runCheck = async (): Promise<void> => {
    setChecking(true)
    setError('')
    try {
      setCheck(await window.api.checkNetwork())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 text-sky-300" />
        <div>
          <h2 className="text-lg font-semibold">下载与网络</h2>
          <p className="text-xs text-white/50">下载速度慢或连不上服务器时，可以调整同时下载数或设置代理</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span>同时下载数</span>
          <span className="font-mono text-sky-300">{threads}</span>
        </div>
        <input
          type="range"
          min={1}
          max={64}
          value={threads}
          onChange={(e) => onThreads(Number(e.target.value))}
          aria-label="同时下载数"
          className="mt-2 w-full cursor-pointer accent-sky-400"
        />
        <p className="mt-1 text-xs text-white/40">
          每个服务器同时下载的文件数，默认 16。网络不稳定、经常下载失败时可以调低
        </p>
      </div>

      <div className="mt-5 text-sm">代理</div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {PROXY_MODES.map((mode) => {
          const active = settings.proxyMode === mode.key
          return (
            <button
              key={mode.key}
              onClick={() => save({ proxyMode: mode.key })}
              className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{mode.label}</div>
                <div className="text-xs text-white/50">{mode.desc}</div>
              </div>
              {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
            </button>
          )
        })}
      </div>
      {settings.proxyMode === 'custom' && (
        <div className="mt-3">
          <input
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            onBlur={commitProxyUrl}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="例如 http://127.0.0.1:7890"
            spellCheck={false}
            aria-label="代理地址"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 font-mono text-sm outline-none placeholder:text-white/30 focus:border-sky-400/60"
          />
          <p className="mt-1 text-xs text-white/40">
            只支持 HTTP 代理。Clash、v2rayN 等软件一般提供 HTTP 端口（如 7890、10809）；需要密码时写成
            http://用户名:密码@地址:端口
          </p>
        </div>
      )}

      {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={runCheck}
          disabled={checking}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          测试连接
        </button>
        {check && <span className="text-xs text-white/50">{check.proxy ? `通过代理 ${check.proxy}` : '直接连接'}</span>}
      </div>
      {check && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {check.results.map((r) => (
            <div key={r.name} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm">
              {r.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span className="flex-1 truncate">{r.name}</span>
              <span className={`truncate text-xs ${r.ok ? 'text-white/50' : 'text-red-300'}`} title={r.error}>
                {r.ok ? `${r.ms} ms` : (r.error ?? '无法连接')}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** 关于：当前版本、检查更新 */
function AboutSection({
  autoCheck,
  onAutoCheckChange
}: {
  autoCheck: boolean
  onAutoCheckChange: (value: boolean) => void
}): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState('')

  const check = async (): Promise<void> => {
    setChecking(true)
    setError('')
    try {
      setInfo(await window.api.checkUpdate())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="text-lg font-semibold">关于</h2>
            <p className="text-xs text-white/50">琉璃启动器 v{__APP_VERSION__}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.api.openUpdateLink('page')}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            <ExternalLink className="h-4 w-4" />
            GitHub
          </button>
          <button
            onClick={check}
            disabled={checking}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            检查更新
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      {info && !info.hasUpdate && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          已经是最新版本（v{info.current}）
        </div>
      )}
      {info?.hasUpdate && (
        <div className="mt-4 rounded-xl bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">发现新版本 v{info.latest}</div>
              <div className="text-xs text-white/50">
                当前版本 v{info.current}
                {info.publishedAt && ` · 发布于 ${new Date(info.publishedAt).toLocaleDateString('zh-CN')}`}
              </div>
            </div>
            <button
              onClick={() => window.api.openUpdateLink('asset')}
              title={downloadLabel(info)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              下载新版本
            </button>
          </div>
          <div className="mt-3">
            <ReleaseNotes notes={info.notes} />
          </div>
          <p className="mt-2 text-xs text-white/40">
            会用浏览器下载{info.assetName ? `「${info.assetName}」` : ''}。安装新版本后，设置、账号和游戏文件都会保留。
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
        <div>
          <div className="text-sm font-medium">启动时自动检查更新</div>
          <div className="text-xs text-white/50">发现新版本时在窗口右下角提示</div>
        </div>
        <button
          role="switch"
          aria-checked={autoCheck}
          onClick={() => onAutoCheckChange(!autoCheck)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${autoCheck ? 'bg-emerald-500' : 'bg-white/20'}`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${autoCheck ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>
    </section>
  )
}

export default SettingsPage
