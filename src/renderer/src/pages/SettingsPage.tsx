import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  AlertTriangle,
  ImagePlus,
  Trash2,
  Info,
  Rocket,
  Sparkles,
  Layers,
  Film,
  Globe,
  Loader2,
  MemoryStick,
  Network,
  Newspaper,
  XCircle,
  ShieldCheck,
  Monitor,
  MousePointerClick,
  Moon,
  Palette,
  Pipette,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { backgroundUrl } from '../utils/appearance'
import { ReleaseNotes, UpdateActions } from '../components/UpdateNotice'
import GameDirSection from '../components/GameDirSection'
import FontPicker from '../components/FontPicker'
import MusicSettings from '../components/MusicSettings'
import Personalization from './Personalization'
import { isVideoBackground } from '../components/AppBackground'
import LayoutSettings from '../components/LayoutSettings'
import JavaSelect from '../components/JavaSelect'
import MemoryPlanSummary from '../components/MemoryPlanSummary'
import { UI_SCALES } from '../../../shared/types'
import type {
  AccentColor,
  AfterLaunch,
  AppSettings,
  BackgroundFit,
  BackgroundMode,
  DownloadSource,
  JavaInfo,
  MemoryPlan,
  NetworkCheck,
  ProxyMode,
  ThemeMode,
  UpdateInfo,
  UpdateSource,
  VersionIsolation
} from '../../../shared/types'
import PageHeader from '../components/PageHeader'
import AiSettings from '../components/AiSettings'
import { SETTINGS_TAB_KEY } from '../utils/settingsTab'

const SOURCES: { key: DownloadSource; label: string; desc: string }[] = [
  { key: 'bmclapi', label: 'BMCLAPI 镜像', desc: '国内高速镜像，推荐' },
  { key: 'mojang', label: '官方源', desc: 'Mojang 官方服务器' }
]

/** 背景模式 */
const BACKGROUND_MODES: { key: BackgroundMode; label: string; desc: string }[] = [
  { key: 'off', label: '不使用', desc: '默认的渐变背景' },
  { key: 'fixed', label: '固定一张', desc: '一直显示选中的图片' },
  { key: 'random', label: '启动时随机', desc: '每次打开换一张' },
  { key: 'slideshow', label: '定时轮播', desc: '按顺序淡入淡出切换' }
]

const BACKGROUND_FITS: { key: BackgroundFit; label: string }[] = [
  { key: 'cover', label: '填充（裁剪铺满窗口）' },
  { key: 'contain', label: '适应（完整显示图片）' },
  { key: 'stretch', label: '拉伸' },
  { key: 'center', label: '居中（原始大小）' },
  { key: 'tile', label: '平铺' }
]

const BACKGROUND_INTERVALS = [1, 5, 10, 30]
const MAX_BACKGROUNDS = 50

/** 主题色：色块显示主色到副色的渐变（与 index.css 中的变量一致） */
const ACCENTS: { key: Exclude<AccentColor, 'custom'>; label: string; from: string; to: string }[] = [
  { key: 'emerald', label: '翡翠绿', from: '#10b981', to: '#06b6d4' },
  { key: 'teal', label: '薄荷青', from: '#14b8a6', to: '#84cc16' },
  { key: 'sky', label: '天空蓝', from: '#0ea5e9', to: '#6366f1' },
  { key: 'indigo', label: '靛青蓝', from: '#6366f1', to: '#0ea5e9' },
  { key: 'violet', label: '星辰紫', from: '#8b5cf6', to: '#d946ef' },
  { key: 'rose', label: '樱花粉', from: '#f43f5e', to: '#f97316' },
  { key: 'red', label: '中国红', from: '#ef4444', to: '#f59e0b' },
  { key: 'amber', label: '琥珀橙', from: '#f59e0b', to: '#f97316' },
  { key: 'lime', label: '青柠绿', from: '#84cc16', to: '#10b981' },
  { key: 'slate', label: '石墨灰', from: '#64748b', to: '#0ea5e9' }
]

/** 一些常用的自定义颜色，点一下就能用 */
const CUSTOM_SWATCHES = [
  '#e11d48',
  '#db2777',
  '#9333ea',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#ea580c',
  '#78716c'
]

/** 十六进制颜色输入框：输入完整的 #rrggbb 后才保存 */
function HexInput({ value, onChange }: { value: string; onChange: (hex: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    const text = draft.trim().replace(/^#?/, '#')
    if (/^#[0-9a-f]{6}$/i.test(text)) onChange(text.toLowerCase())
    else setDraft(value)
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      maxLength={7}
      aria-label="颜色代码"
      spellCheck={false}
      className="w-24 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-mono text-sm uppercase outline-none focus:border-emerald-400/50"
    />
  )
}

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
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(2))} GB` : `${mb} MB`
}

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

type SettingsTab = 'personal' | 'launch' | 'other' | 'ai'
const SETTINGS_TABS: { key: SettingsTab; label: string; icon: LucideIcon }[] = [
  { key: 'personal', label: '个性化', icon: Palette },
  { key: 'launch', label: '启动', icon: Rocket },
  { key: 'other', label: '其它', icon: SlidersHorizontal },
  { key: 'ai', label: 'AI 助手', icon: Sparkles }
]

function SettingsPage(): JSX.Element {
  /** 当前分类（记住上次打开的） */
  const [tab, setTab] = useState<SettingsTab>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_TAB_KEY)
      return SETTINGS_TABS.some((t) => t.key === saved) ? (saved as SettingsTab) : 'personal'
    } catch {
      return 'personal'
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const changeTab = (next: SettingsTab): void => {
    setTab(next)
    scrollRef.current?.scrollTo({ top: 0 })
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, next)
    } catch {
      // 记不住也没关系
    }
  }
  const [settings, setSettings] = useState<AppSettings | null>(null)
  /** 官网地址（构建时配置），没有时不显示更新来源选项 */
  const [officialSite, setOfficialSite] = useState('')
  const [totalMemory, setTotalMemory] = useState(8192)
  const [memoryDraft, setMemoryDraft] = useState(MEMORY_MIN)
  /** 当前选中版本自动分配的内存 */
  const [memoryPlan, setMemoryPlan] = useState<MemoryPlan | null>(null)
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()
  const sliderTimer = useRef<ReturnType<typeof setTimeout>>()
  const pendingSlider = useRef<Partial<AppSettings>>({})
  /** 还没保存的内存设置：离开页面时立即保存，不丢失 */
  const pendingMemory = useRef<number | null>(null)
  /** 保存请求的序号：多个保存同时进行时，只用最后一次的结果更新界面 */
  const updateSeq = useRef(0)
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundUrlInput, setBackgroundUrlInput] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)
  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    // 直接修改的项（例如「恢复默认」）不能再被稍后保存的滑块改动覆盖
    for (const key of Object.keys(patch)) delete (pendingSlider.current as Record<string, unknown>)[key]
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    const seq = ++updateSeq.current
    const saved = await window.api.updateSettings(patch)
    if (seq === updateSeq.current) setSettings(saved)
  }

  /** 拖动滑块时先更新界面，停止拖动 150 毫秒后再保存，避免频繁写入设置文件 */
  // 其它地方修改了设置（自动切换主题、导入主题、快捷键缩放等）时同步显示；正在拖动滑块时不覆盖
  useEffect(
    () =>
      window.api.onSettingsChanged((next) => {
        if (Object.keys(pendingSlider.current).length === 0) setSettings(next)
      }),
    []
  )

  const updateSlider = (patch: Partial<AppSettings>): void => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    // 合并这段时间内所有滑块的改动，一起保存（只保存最后一次会丢掉其他滑块的改动）
    pendingSlider.current = { ...pendingSlider.current, ...patch }
    clearTimeout(sliderTimer.current)
    sliderTimer.current = setTimeout(() => {
      const pending = pendingSlider.current
      pendingSlider.current = {}
      void update(pending)
    }, 150)
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
      const [loaded, info] = await Promise.all([window.api.getSettings(), window.api.getSystemInfo()])
      setSettings(loaded)
      setTotalMemory(info.totalMemory)
      setOfficialSite(info.officialSite)
      setMemoryDraft(loaded.maxMemory)
      if (loaded.selectedVersion) window.api.previewMemory(loaded.selectedVersion).then(setMemoryPlan)
      await scan(loaded)
    }
    init()
    // 启动时自动下载了 Java 后，列表跟着刷新
    const offStatus = window.api.onInstallStatus((status) => {
      if (status?.kind === 'java' && status.state === 'success') void window.api.scanJava().then(setJavaList)
    })
    return () => {
      clearTimeout(memoryTimer.current)
      if (pendingMemory.current !== null) {
        void window.api.updateSettings({ maxMemory: pendingMemory.current }).catch(() => undefined)
        pendingMemory.current = null
      }
      offStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 拖动滑块时只更新界面，停止拖动 400ms 后再保存
  const onMemoryChange = (value: number): void => {
    setMemoryDraft(value)
    clearTimeout(memoryTimer.current)
    pendingMemory.current = value
    memoryTimer.current = setTimeout(() => {
      pendingMemory.current = null
      void update({ maxMemory: value })
    }, 400)
  }

  const memoryMax = Math.max(MEMORY_MIN, Math.floor((totalMemory - 1024) / MEMORY_STEP) * MEMORY_STEP)

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const backgroundImages = Array.isArray(settings.backgroundImages) ? settings.backgroundImages : []
  const backgroundMode: BackgroundMode = backgroundImages.length > 0 ? (settings.backgroundMode ?? 'off') : 'off'

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="设置"
        subtitle="修改后立即生效并自动保存"
        after={
          <div className="flex rounded-xl bg-black/20 p-1" role="tablist">
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => changeTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm transition-colors ${
                  tab === t.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <div ref={scrollRef} className="page-scroll min-h-0 flex-1 pb-4">
        <div className={tab === 'personal' ? 'flex flex-col gap-6' : 'hidden'}>
          {/* 主题方案与粒子特效 */}
          <Personalization settings={settings} update={update} updateSlider={updateSlider} />
          {/* 外观 */}
          <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-fuchsia-300" />
              <div>
                <h2 className="text-lg font-semibold">外观</h2>
                <p className="text-xs text-white/50">明暗、主题色、面板质感、壁纸与界面动画</p>
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
            <div className="mt-3 grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-11">
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
              {/* 自定义颜色 */}
              <button
                onClick={() => update({ accentColor: 'custom' })}
                className="flex flex-col items-center gap-1.5"
                title="使用自己挑的颜色"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-transparent transition ${
                    settings.accentColor === 'custom' ? 'ring-white/80' : 'ring-transparent hover:ring-white/30'
                  }`}
                  style={{
                    background:
                      settings.accentColor === 'custom'
                        ? settings.customAccent
                        : 'conic-gradient(#ef4444, #f59e0b, #84cc16, #10b981, #06b6d4, #6366f1, #d946ef, #ef4444)'
                  }}
                >
                  {settings.accentColor === 'custom' ? (
                    <CheckCircle2 className="h-5 w-5 text-[#fff]" />
                  ) : (
                    <Pipette className="h-4 w-4 text-[#fff] drop-shadow" />
                  )}
                </span>
                <span className={`text-xs ${settings.accentColor === 'custom' ? 'text-white' : 'text-white/50'}`}>
                  自定义
                </span>
              </button>
            </div>
            {settings.accentColor === 'custom' && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/20">
                  <span className="absolute inset-0" style={{ background: settings.customAccent }} />
                  <input
                    type="color"
                    aria-label="选择主题色"
                    value={/^#[0-9a-f]{6}$/i.test(settings.customAccent) ? settings.customAccent : '#10b981'}
                    onChange={(e) => updateSlider({ customAccent: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <HexInput value={settings.customAccent} onChange={(hex) => update({ customAccent: hex })} />
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => update({ customAccent: hex })}
                      title={hex}
                      aria-label={`使用 ${hex}`}
                      className={`h-6 w-6 rounded-md ring-1 transition hover:scale-110 ${
                        settings.customAccent.toLowerCase() === hex ? 'ring-2 ring-white/80' : 'ring-white/20'
                      }`}
                      style={{ background: hex }}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/50">太亮或太暗的颜色会自动调整，保证文字看得清</span>
              </div>
            )}

            {/* 面板质感 */}
            <div className="mt-6 text-sm font-medium">面板质感</div>
            <div className="mt-3 grid grid-cols-2 gap-6">
              <label className="block">
                <div className="flex justify-between text-xs text-white/60">
                  <span>不透明度</span>
                  <span>{settings.panelOpacity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={settings.panelOpacity}
                  onChange={(e) => updateSlider({ panelOpacity: Number(e.target.value) })}
                  className="mt-2 w-full accent-emerald-500"
                />
              </label>
              <label className="block">
                <div className="flex justify-between text-xs text-white/60">
                  <span>毛玻璃模糊</span>
                  <span>{settings.panelBlur} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={settings.panelBlur}
                  onChange={(e) => updateSlider({ panelBlur: Number(e.target.value) })}
                  className="mt-2 w-full accent-emerald-500"
                />
              </label>
            </div>
            {(settings.panelOpacity !== 10 || settings.panelBlur !== 24) && (
              <button
                onClick={() => update({ panelOpacity: 10, panelBlur: 24 })}
                className="mt-2 flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认质感
              </button>
            )}

            {/* 背景图片 */}
            <div className="mt-6 text-sm font-medium">壁纸（图片 / 视频）</div>
            <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="背景模式">
              {BACKGROUND_MODES.map((option) => {
                const active = backgroundMode === option.key
                const disabled = option.key !== 'off' && backgroundImages.length === 0
                return (
                  <button
                    key={option.key}
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    title={disabled ? '先添加背景图片' : undefined}
                    onClick={() => update({ backgroundMode: option.key })}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-white/50">{option.desc}</div>
                  </button>
                )
              })}
            </div>

            {/* 背景库 */}
            <div className="mt-3 grid grid-cols-4 gap-2" aria-label="背景库">
              {backgroundImages.map((name) => {
                const current = backgroundMode === 'fixed' && name === settings.backgroundImage
                return (
                  <div key={name} className="group relative" data-background-item={name}>
                    <button
                      onClick={() => update({ backgroundImage: name, backgroundMode: 'fixed' })}
                      title="设为背景"
                      aria-pressed={current}
                      className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 bg-cover bg-center transition-colors ${
                        current ? 'border-emerald-400' : 'border-white/10 hover:border-white/30'
                      }`}
                      style={isVideoBackground(name) ? undefined : { backgroundImage: `url("${backgroundUrl(name)}")` }}
                    >
                      {isVideoBackground(name) && (
                        <>
                          {/* 视频壁纸：显示第一帧 */}
                          <video
                            src={backgroundUrl(name)}
                            muted
                            preload="metadata"
                            className="pointer-events-none h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                            <Film className="h-3 w-3" />
                            视频
                          </span>
                        </>
                      )}
                    </button>
                    {current && (
                      <CheckCircle2 className="pointer-events-none absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-black/50 text-emerald-300" />
                    )}
                    <button
                      onClick={() => changeBackground(() => window.api.removeBackground(name))}
                      title="删除"
                      aria-label="删除这张图片"
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:bg-red-500/80 hover:text-white focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
              {backgroundImages.length < MAX_BACKGROUNDS && (
                <button
                  onClick={() => changeBackground(() => window.api.addBackgrounds())}
                  className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/15 text-xs text-white/50 hover:border-white/30 hover:text-white"
                >
                  <ImagePlus className="h-5 w-5" />
                  添加图片或视频…
                </button>
              )}
            </div>
            <div className="mt-1.5 text-xs text-white/40">
              支持 PNG、JPG、WebP、GIF 图片和 MP4、WebM 视频（循环静音播放），可以一次选多个，最多 {MAX_BACKGROUNDS}{' '}
              个。点击缩略图设为固定背景，悬停可删除
            </div>
            {/* 从网络添加壁纸 */}
            {backgroundImages.length < MAX_BACKGROUNDS && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const url = backgroundUrlInput.trim()
                  if (!url || addingUrl) return
                  setAddingUrl(true)
                  void changeBackground(async () => {
                    const next = await window.api.addBackgroundUrl(url)
                    setBackgroundUrlInput('')
                    return next
                  }).finally(() => setAddingUrl(false))
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-400/50">
                  <Globe className="h-4 w-4 shrink-0 text-white/40" />
                  <input
                    value={backgroundUrlInput}
                    onChange={(e) => setBackgroundUrlInput(e.target.value)}
                    placeholder="输入网络图片或视频的直链，例如 https://example.com/wallpaper.jpg"
                    aria-label="网络壁纸地址"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-white/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!backgroundUrlInput.trim() || addingUrl}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm hover:bg-white/20 disabled:opacity-40"
                >
                  {addingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  添加
                </button>
              </form>
            )}

            {backgroundMode !== 'off' && backgroundImages.length > 0 && (
              <>
                <div className={`mt-4 grid gap-6 ${backgroundMode === 'slideshow' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <label className="block">
                    <div className="text-xs text-white/60">填充方式</div>
                    <select
                      value={settings.backgroundFit ?? 'cover'}
                      onChange={(e) => update({ backgroundFit: e.target.value as BackgroundFit })}
                      aria-label="填充方式"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
                    >
                      {BACKGROUND_FITS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {backgroundMode === 'slideshow' && (
                    <label className="block">
                      <div className="text-xs text-white/60">切换间隔</div>
                      <select
                        value={settings.backgroundInterval || 10}
                        onChange={(e) => update({ backgroundInterval: Number(e.target.value) })}
                        aria-label="切换间隔"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400/50"
                      >
                        {BACKGROUND_INTERVALS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            每 {minutes} 分钟
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-6">
                  <label className="block">
                    <div className="flex justify-between text-xs text-white/60">
                      <span>模糊</span>
                      <span>{settings.backgroundBlur} px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
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
                      max={90}
                      value={settings.backgroundDim}
                      onChange={(e) => updateSlider({ backgroundDim: Number(e.target.value) })}
                      className="mt-2 w-full accent-emerald-500"
                    />
                  </label>
                </div>
              </>
            )}
            {backgroundError && (
              <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{backgroundError}</div>
            )}

            {/* 字体与缩放 */}
            <div className="mt-6 text-sm font-medium">界面字体</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <FontPicker value={settings.fontFamily ?? ''} onChange={(font) => update({ fontFamily: font })} />
              </div>
              {settings.fontFamily && (
                <button
                  onClick={() => update({ fontFamily: '' })}
                  className="flex shrink-0 items-center gap-1.5 text-xs text-white/50 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认字体
                </button>
              )}
            </div>

            <div className="mt-6 text-sm font-medium">界面缩放</div>
            <div className="mt-3 grid grid-cols-6 gap-2" role="radiogroup" aria-label="界面缩放">
              {UI_SCALES.map((scale) => {
                const active = (settings.uiScale || 100) === scale
                return (
                  <button
                    key={scale}
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ uiScale: scale })}
                    className={`rounded-xl border px-2 py-2 text-center text-sm transition-colors ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {scale}%{scale === 100 && <span className="ml-1 text-xs text-white/50">默认</span>}
                  </button>
                )
              })}
            </div>
            <div className="mt-1.5 text-xs text-white/40">
              也可以按 Ctrl + 加号 / 减号 或 Ctrl + 鼠标滚轮调整，Ctrl + 0 恢复 100%
            </div>

            {/* 侧边栏与主页 */}
            <LayoutSettings settings={settings} update={update} updateSlider={updateSlider} />

            {/* 背景音乐 */}
            <MusicSettings settings={settings} update={update} updateSlider={updateSlider} />

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
            {/* 鼠标点击效果 */}
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <MousePointerClick className="h-4 w-4 text-emerald-300" />
                <div>
                  <div className="text-sm font-medium">鼠标点击特效</div>
                  <div className="text-xs text-white/50">
                    点击时在鼠标位置放出一圈波纹和光点，颜色跟随主题色；关闭界面动画时也不显示
                  </div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.clickEffect}
                aria-label="鼠标点击特效"
                onClick={() => update({ clickEffect: !settings.clickEffect })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.clickEffect ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.clickEffect ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
            {/* 主页新闻 */}
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Newspaper className="h-4 w-4 text-emerald-300" />
                <div>
                  <div className="text-sm font-medium">主页显示 Minecraft 新闻</div>
                  <div className="text-xs text-white/50">在主页显示 Minecraft 官方发布的新闻与更新公告（英文）</div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.showNews}
                aria-label="主页显示 Minecraft 新闻"
                onClick={() => update({ showNews: !settings.showNews })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.showNews ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.showNews ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
            {/* 主页最近游玩 */}
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-emerald-300" />
                <div>
                  <div className="text-sm font-medium">主页显示最近游玩</div>
                  <div className="text-xs text-white/50">在主页显示最近玩过的版本和游玩时长，点击直接启动</div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.showRecentPlays}
                aria-label="主页显示最近游玩"
                onClick={() => update({ showRecentPlays: !settings.showRecentPlays })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.showRecentPlays ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.showRecentPlays ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </section>
        </div>

        <div className={tab === 'launch' ? 'flex flex-col gap-6' : 'hidden'}>
          {/* 游戏目录 */}
          <GameDirSection
            onChanged={() =>
              window.api.getSettings().then((loaded) => {
                setSettings(loaded)
                if (loaded.selectedVersion) window.api.previewMemory(loaded.selectedVersion).then(setMemoryPlan)
                else setMemoryPlan(null)
              })
            }
          />

          {/* Java 运行环境（下拉列表展开时提到上层，不被下面的内存设置挡住） */}
          <section className="relative rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl has-[[aria-expanded=true]]:z-30">
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

            <div className="mt-5 text-sm font-medium">启动游戏使用的 Java</div>
            <div className="mt-2">
              <JavaSelect
                value={settings.javaAuto ? 'auto' : settings.javaPath}
                javas={scanning && javaList.length === 0 ? null : javaList}
                onChange={(choice) =>
                  choice === 'auto' ? update({ javaAuto: true }) : update({ javaAuto: false, javaPath: choice })
                }
              />
            </div>
            {error && (
              <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">扫描失败：{error}</div>
            )}

            {settings.javaAuto ? (
              <div className="mt-3 rounded-xl bg-black/20 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-white/60">本机已有：</span>
                  {javaList.length === 0 ? (
                    <span className="text-white/40">{scanning ? '正在查找…' : '还没有找到 Java'}</span>
                  ) : (
                    [...new Set(javaList.map((j) => j.majorVersion))]
                      .sort((a, b) => a - b)
                      .map((major) => (
                        <span
                          key={major}
                          className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-emerald-200"
                        >
                          Java {major}
                        </span>
                      ))
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-white/50">
                  启动或安装游戏时按版本自动挑选：1.16 及以前用 Java 8，1.17 ~ 1.20.4 用 Java 17，1.20.5 及以上用 Java
                  21。本机没有对应的 Java 时会自动下载（与官方启动器相同的 Java
                  运行环境，保存在启动器数据目录，进度显示在「下载」页）。
                </p>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  所有版本都会使用这个 Java（版本设置里单独指定的除外）。游戏版本需要更高的 Java
                  时将无法启动，也不会自动下载， 建议改回「自动选择」。
                </span>
              </div>
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
                      ? '启动时按模组、光影、材质包、渲染距离和电脑的可用内存自动决定'
                      : `本机物理内存 ${formatMemory(totalMemory)}，建议分配 2 ~ 8 GB`}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-black/30 px-4 py-2 font-mono text-lg font-bold text-sky-300">
                {settings.memoryAuto
                  ? memoryPlan
                    ? formatMemory(memoryPlan.memory)
                    : '自动'
                  : formatMemory(memoryDraft)}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(
                [
                  [true, '自动分配（推荐）', '按游戏内容和可用内存分配'],
                  [false, '手动设置', '所有版本使用固定的内存']
                ] as const
              ).map(([auto, label, desc]) => {
                const active = settings.memoryAuto === auto
                return (
                  <button
                    key={label}
                    onClick={() => update({ memoryAuto: auto })}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/5 bg-black/20 hover:bg-black/30'
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
                  <MemoryPlanSummary plan={memoryPlan} versionId={settings.selectedVersion} />
                ) : (
                  '原版按游戏版本分配 1 ~ 2 GB；模组版本从 2.5 GB 起，模组越多分配越多；开着光影、高清材质包、远景渲染或渲染距离很远时再多给一些（最多 16 GB），并给系统留出足够的内存'
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
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div>
                <div className="text-sm font-medium">优化内存回收（推荐）</div>
                <div className="text-xs text-white/50">
                  使用适合游戏的回收参数：不用的内存及时还给系统、减少回收造成的卡顿。版本设置里自定义了回收器时不生效
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.optimizeGc}
                aria-label="优化内存回收"
                onClick={() => update({ optimizeGc: !settings.optimizeGc })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.optimizeGc ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.optimizeGc ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
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
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/5 bg-black/20 hover:bg-black/30'
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
                  <div className="text-xs text-white/50">
                    发现缺失或损坏的依赖库、资源文件时自动下载补全，避免启动失败
                  </div>
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
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Terminal className="h-4 w-4 text-sky-300" />
                <div>
                  <div className="text-sm font-medium">启动时自动打开日志窗口</div>
                  <div className="text-xs text-white/50">
                    关闭时也可以随时点主页的「日志」按钮打开或关闭；启动动画里也能查看实时启动日志
                  </div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.openLogOnLaunch}
                aria-label="启动时自动打开日志窗口"
                onClick={() => update({ openLogOnLaunch: !settings.openLogOnLaunch })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.openLogOnLaunch ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.openLogOnLaunch ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-violet-300" />
                <div>
                  <div className="text-sm font-medium">桌面启动悬浮窗</div>
                  <div className="text-xs text-white/50">
                    启动器不在前台时（最小化、切到其他窗口），在屏幕中央显示启动动画和进度，游戏窗口出现后自动消失
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => void window.api.previewLaunchSplash()}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                >
                  预览
                </button>
                <button
                  role="switch"
                  aria-checked={settings.launchSplash}
                  aria-label="桌面启动悬浮窗"
                  onClick={() => update({ launchSplash: !settings.launchSplash })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    settings.launchSplash ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                      settings.launchSplash ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Moon className="h-4 w-4 text-sky-300" />
                <div>
                  <div className="text-sm font-medium">游戏加载画面使用黑色背景</div>
                  <div className="text-xs text-white/50">
                    把游戏启动时 Mojang Studios 加载画面的红色背景换成黑色（1.17
                    及以上，游戏里的「单色标志」选项）。关闭后不会改回，可以在游戏的 设置 → 辅助功能 里修改
                  </div>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={settings.darkLoadingScreen}
                aria-label="游戏加载画面使用黑色背景"
                onClick={() => update({ darkLoadingScreen: !settings.darkLoadingScreen })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings.darkLoadingScreen ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                    settings.darkLoadingScreen ? 'left-6' : 'left-1'
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
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/5 bg-black/20 hover:bg-black/30'
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
        </div>

        <div className={tab === 'other' ? 'flex flex-col gap-6' : 'hidden'}>
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
            officialSite={officialSite}
            updateSource={settings.updateSource}
            onUpdateSourceChange={(value) => update({ updateSource: value })}
          />
        </div>

        <div className={tab === 'ai' ? 'flex flex-col gap-6' : 'hidden'}>
          <AiSettings />
        </div>
      </div>
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
  /** 还没保存的下载线程数：离开页面时立即保存 */
  const pendingThreads = useRef<number | null>(null)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pendingThreads.current !== null) {
        void window.api.updateSettings({ downloadThreads: pendingThreads.current }).catch(() => undefined)
      }
    },
    []
  )

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
    pendingThreads.current = value
    timer.current = setTimeout(() => {
      pendingThreads.current = null
      void save({ downloadThreads: value })
    }, 400)
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
const UPDATE_SOURCES: { key: UpdateSource; label: string; desc: string }[] = [
  { key: 'auto', label: '自动', desc: '先从官网获取，连不上时用 GitHub（推荐）' },
  { key: 'official', label: '官网', desc: '只从官网获取，国内下载快' },
  { key: 'github', label: 'GitHub', desc: '只从 GitHub 获取' }
]

function AboutSection({
  autoCheck,
  onAutoCheckChange,
  officialSite,
  updateSource,
  onUpdateSourceChange
}: {
  autoCheck: boolean
  onAutoCheckChange: (value: boolean) => void
  officialSite: string
  updateSource: UpdateSource
  onUpdateSourceChange: (value: UpdateSource) => void
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
          {officialSite && (
            <a
              href={`${officialSite}/`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <Globe className="h-4 w-4" />
              官网
            </a>
          )}
          <button
            onClick={() => window.open('https://github.com/xiaoye1001/Liuli-Launcher', '_blank')}
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
                {` · 来自${info.source === 'official' ? '官网' : ' GitHub'}`}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <ReleaseNotes notes={info.notes} />
          </div>
          <div className="mt-3">
            <UpdateActions info={info} />
          </div>
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

      {officialSite && (
        <div className="mt-3 rounded-xl bg-black/20 px-4 py-3">
          <div className="text-sm font-medium">更新来源</div>
          <div className="text-xs text-white/50">从哪里检查和下载新版本，下载的安装包都会校验 SHA-256</div>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="更新来源">
            {UPDATE_SOURCES.map((option) => (
              <button
                key={option.key}
                role="radio"
                aria-checked={updateSource === option.key}
                onClick={() => {
                  onUpdateSourceChange(option.key)
                  setInfo(null)
                }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  updateSource === option.key
                    ? 'border-emerald-400/50 bg-emerald-500/15'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-white/50">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default SettingsPage
