import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Box,
  CheckCircle2,
  Coffee,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  ImageIcon,
  Rocket,
  Sparkles,
  Layers,
  Globe,
  Loader2,
  MemoryStick,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Sun,
  type LucideIcon
} from 'lucide-react'
import { backgroundUrl } from '../utils/appearance'
import type {
  AccentColor,
  AfterLaunch,
  AppSettings,
  DownloadSource,
  GameDirInfo,
  JavaInfo,
  ThemeMode,
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
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()
  const sliderTimer = useRef<ReturnType<typeof setTimeout>>()
  const [backgroundError, setBackgroundError] = useState('')
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

  const scan = async (current: AppSettings): Promise<void> => {
    setScanning(true)
    setError('')
    try {
      const list = await window.api.scanJava()
      setJavaList(list)
      // 已保存的 Java 不存在时，自动选择版本最高的一个
      if (list.length > 0 && !list.some((j) => j.path === current.javaPath)) {
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
      await scan(loaded)
    }
    init()
    return () => clearTimeout(memoryTimer.current)
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
                {active && (
                  <motion.div
                    layoutId="theme-active"
                    className="absolute inset-0 rounded-xl bg-emerald-500/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
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
            style={settings.backgroundImage ? { backgroundImage: `url("${backgroundUrl(settings.backgroundImage)}")` } : undefined}
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
              <p className="text-xs text-white/50">自动扫描本机已安装的 Java，点击选择用于启动游戏的版本</p>
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

        <div className="mt-5 flex flex-col gap-2">
          {error && (
            <div className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">扫描失败：{error}</div>
          )}
          {!scanning && !error && javaList.length === 0 && (
            <div className="rounded-xl bg-black/20 px-4 py-6 text-center text-sm text-white/50">
              未找到任何 Java，请先安装 Java 17 或 Java 21
            </div>
          )}
          <AnimatePresence>
            {javaList.map((java, index) => {
              const active = java.path === settings.javaPath
              return (
                <motion.button
                  key={java.path}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => update({ javaPath: java.path })}
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/15'
                      : 'border-white/5 bg-black/20 hover:bg-black/30'
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
      </section>

      {/* 内存分配 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MemoryStick className="h-5 w-5 text-sky-300" />
            <div>
              <h2 className="text-lg font-semibold">游戏内存</h2>
              <p className="text-xs text-white/50">本机物理内存 {formatMemory(totalMemory)}，建议分配 2 ~ 8 GB</p>
            </div>
          </div>
          <div className="rounded-xl bg-black/30 px-4 py-2 font-mono text-lg font-bold text-sky-300">
            {formatMemory(memoryDraft)}
          </div>
        </div>
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
      </section>

      {/* 启动游戏后 */}
      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Rocket className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="text-lg font-semibold">启动游戏后</h2>
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
                {active && (
                  <motion.div
                    layoutId="source-active"
                    className="absolute inset-0 rounded-xl bg-emerald-500/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
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
    </div>
  )
}

export default SettingsPage
