import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Coffee, Globe, Loader2, MemoryStick, Monitor, Moon, Palette, RefreshCw, Sun, type LucideIcon } from 'lucide-react'
import type { AppSettings, DownloadSource, JavaInfo, ThemeMode } from '../../../shared/types'

const SOURCES: { key: DownloadSource; label: string; desc: string }[] = [
  { key: 'bmclapi', label: 'BMCLAPI 镜像', desc: '国内高速镜像，推荐' },
  { key: 'mojang', label: '官方源', desc: 'Mojang 官方服务器' }
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

function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [totalMemory, setTotalMemory] = useState(8192)
  const [memoryDraft, setMemoryDraft] = useState(MEMORY_MIN)
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    const saved = await window.api.updateSettings(patch)
    setSettings(saved)
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
      const [loaded, info] = await Promise.all([window.api.getSettings(), window.api.getSystemInfo()])
      setSettings(loaded)
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
            <p className="text-xs text-white/50">选择界面的深色或浅色主题</p>
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
