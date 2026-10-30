import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Coffee,
  FolderTree,
  Loader2,
  MemoryStick,
  Monitor,
  RotateCcw,
  SquareTerminal,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import VersionIcon from '../components/VersionIcon'
import JavaSelect, { type JavaChoice } from '../components/JavaSelect'
import MemoryPlanSummary from '../components/MemoryPlanSummary'
import type { AppSettings, InstalledVersion, JavaInfo, MemoryPlan, VersionConfig } from '../../../shared/types'

const LOADER_NAMES = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge', optifine: 'OptiFine' }
const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge']
const MEMORY_STEP = 256
const MEMORY_MIN = 1024
/** 内存快捷选项（GB） */
const MEMORY_PRESETS = [2, 4, 6, 8, 12, 16]
/** 窗口大小快捷选项 */
const WINDOW_PRESETS: [number, number][] = [
  [854, 480],
  [1280, 720],
  [1600, 900],
  [1920, 1080]
]

const DEFAULT_CONFIG: VersionConfig = {
  maxMemory: 0,
  javaMode: 'global',
  javaPath: '',
  isolation: 'global',
  windowWidth: 0,
  windowHeight: 0,
  fullscreen: false,
  jvmArgs: '',
  gameArgs: '',
  wrapperCommand: '',
  envVars: '',
  preLaunchCommand: '',
  postExitCommand: ''
}

const ADVANCED_KEYS = [
  'jvmArgs',
  'gameArgs',
  'wrapperCommand',
  'envVars',
  'preLaunchCommand',
  'postExitCommand'
] as const

const IS_WINDOWS = navigator.userAgent.includes('Windows')
/** 命令里引用变量的写法：Windows 命令行用 %NAME%，其他系统用 $NAME */
const varRef = (name: string): string => (IS_WINDOWS ? `%${name}%` : `$${name}`)

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(2))} GB` : `${mb} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 分段选择按钮 */
function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: [T, string][]
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-black/20 p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`relative flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
            value === key ? 'font-medium text-emerald-200' : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {value === key && (
            <motion.span
              layoutId={`seg-${options.map((o) => o[0]).join('-')}`}
              className="absolute inset-0 rounded-lg bg-emerald-500/25"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  )
}

/** 开关 */
function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-sm"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/20'}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </span>
      {label}
    </button>
  )
}

/** 设置卡片：彩色图标、标题、说明；单独设置过时显示标记和「恢复」按钮 */
function Card({
  icon: Icon,
  tint,
  title,
  desc,
  overridden,
  onReset,
  className = '',
  children
}: {
  icon: LucideIcon
  /** 图标颜色，例如 text-sky-300 bg-sky-500/15 */
  tint: string
  title: string
  desc: string
  overridden: boolean
  onReset: () => void
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      // 卡片里的下拉列表展开时把整张卡片提到上层，否则列表会被下面的卡片挡住
      className={`relative rounded-2xl border bg-white/10 p-5 shadow-xl backdrop-blur-xl transition-colors has-[[aria-expanded=true]]:z-30 ${
        overridden ? 'border-emerald-400/30' : 'border-white/10'
      } ${className}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{title}</h2>
            {overridden && (
              <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-200">
                已单独设置
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/50">{desc}</p>
        </div>
        {overridden && (
          <button
            onClick={onReset}
            title="恢复为跟随全局设置"
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复
          </button>
        )}
      </div>
      {children}
    </motion.section>
  )
}

/** 文本框：失去焦点或按回车时才保存 */
function TextField({
  value,
  onCommit,
  placeholder,
  mono,
  type = 'text',
  className = ''
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  mono?: boolean
  type?: 'text' | 'number'
  className?: string
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type={type}
      value={draft}
      min={type === 'number' ? 0 : undefined}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none transition-colors placeholder:text-white/30 focus:border-emerald-400/70 ${
        mono ? 'font-mono' : ''
      } ${className}`}
    />
  )
}

/** 多行文本框：失去焦点时才保存 */
function TextAreaField({
  value,
  onCommit,
  placeholder
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <textarea
      value={draft}
      rows={3}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      className="mt-1 w-full resize-y rounded-lg border border-white/15 bg-black/20 px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-white/30 focus:border-emerald-400/70"
    />
  )
}

/** 带标题的一组输入项 */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="text-xs font-medium text-white/70">{label}</span>
      {hint && <span className="ml-2 text-xs text-white/40">{hint}</span>}
      {children}
    </label>
  )
}

interface VersionSettingsPageProps {
  version: InstalledVersion
  onBack: () => void
  /** 设置已保存（用于刷新版本列表上的标记） */
  onChanged: () => void
}

/** 单个版本的设置：内存、Java、版本隔离、窗口大小、附加参数，未设置的项跟随全局设置 */
function VersionSettingsPage({ version, onBack, onChanged }: VersionSettingsPageProps): JSX.Element {
  const [config, setConfig] = useState<VersionConfig | null>(null)
  const [global, setGlobal] = useState<AppSettings | null>(null)
  const [totalMemory, setTotalMemory] = useState(8192)
  const [javaList, setJavaList] = useState<JavaInfo[] | null>(null)
  /** 这个版本需要的 Java 主版本 */
  const [required, setRequired] = useState<number | null>(null)
  /** 跟随全局自动分配时，这个版本预计分配的内存 */
  const [plan, setPlan] = useState<MemoryPlan | null>(null)
  /** 估算失败（例如版本文件损坏）：不再一直显示「正在估算」 */
  const [planFailed, setPlanFailed] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState<boolean | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()
  /** 还没保存的内存设置：离开页面时立即保存，不丢失 */
  const pendingMemory = useRef<number | null>(null)
  const [memoryDraft, setMemoryDraft] = useState(0)

  useEffect(() => {
    window.api
      .getVersionConfig(version.id)
      .then((c) => {
        setConfig(c)
        setMemoryDraft(c.maxMemory)
      })
      .catch((e) => setError(cleanError(e)))
    window.api
      .getSettings()
      .then(setGlobal)
      .catch((e) => setError(cleanError(e)))
    window.api
      .getSystemInfo()
      .then((info) => setTotalMemory(info.totalMemory))
      .catch(() => undefined)
    window.api
      .scanJava()
      .then(setJavaList)
      .catch(() => setJavaList([]))
    window.api
      .getJavaRequirement(version.id)
      .then(setRequired)
      .catch(() => setRequired(null))
    setPlanFailed(false)
    window.api
      .previewMemory(version.id)
      .then((result) => {
        // 读不到版本信息时返回 null
        setPlan(result)
        setPlanFailed(!result)
      })
      .catch(() => {
        setPlan(null)
        setPlanFailed(true)
      })
    const id = version.id
    return () => {
      clearTimeout(savedTimer.current)
      clearTimeout(memoryTimer.current)
      if (pendingMemory.current !== null) {
        void window.api.setVersionConfig(id, { maxMemory: pendingMemory.current }).catch(() => undefined)
        pendingMemory.current = null
      }
    }
  }, [version.id])

  /** 保存的序号：只用最后一次保存返回的结果更新界面 */
  const saveSeq = useRef(0)
  const save = async (patch: Partial<VersionConfig>): Promise<void> => {
    setError('')
    const seq = ++saveSeq.current
    try {
      const next = await window.api.setVersionConfig(version.id, patch)
      if (seq !== saveSeq.current) return
      setConfig(next)
      setSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 1500)
      onChanged()
      // 版本隔离会改变游戏目录（模组、光影、材质包在哪个文件夹），重新估算内存
      if ('isolation' in patch)
        void window.api
          .previewMemory(version.id)
          .then((result) => {
            setPlan(result)
            setPlanFailed(!result)
          })
          .catch(() => undefined)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  if (!config || !global) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
        {error ? (
          <>
            <div className="text-sm text-rose-300">读取版本设置失败：{error}</div>
            <button onClick={onBack} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
              返回
            </button>
          </>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin" />
        )}
      </div>
    )
  }

  const modded = !!version.loader && MOD_LOADERS.includes(version.loader)
  const globalIsolated = global.versionIsolation === 'all' || (global.versionIsolation === 'modded' && modded)
  const globalJavaInfo = javaList?.find((j) => j.path === global.javaPath)
  const globalJava = global.javaAuto ? '自动选择' : `Java ${globalJavaInfo?.majorVersion ?? '（手动指定）'}`
  const isolatedNow = config.isolation === 'global' ? globalIsolated : config.isolation === 'on'
  // 与「设置」页相同：至少给系统留 1 GB
  const memoryMax = Math.max(MEMORY_MIN, Math.floor((totalMemory - 1024) / MEMORY_STEP) * MEMORY_STEP)
  const customized = JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG)

  // 各项是否单独设置过
  const memoryOverridden = memoryDraft > 0
  const javaOverridden = config.javaMode !== 'global'
  const isolationOverridden = config.isolation !== 'global'
  const windowOverridden = config.windowWidth > 0 || config.windowHeight > 0 || config.fullscreen
  const advancedOverridden = ADVANCED_KEYS.some((key) => config[key].trim() !== '')
  const overriddenCount = [
    memoryOverridden,
    javaOverridden,
    isolationOverridden,
    windowOverridden,
    advancedOverridden
  ].filter(Boolean).length
  // 高级选项：有内容时默认展开
  const showAdvanced = advancedOpen ?? advancedOverridden

  // 实际会用的 Java：判断是否满足这个版本的要求
  const effectiveJava =
    config.javaMode === 'custom'
      ? javaList?.find((j) => j.path === config.javaPath)
      : config.javaMode === 'auto' || global.javaAuto
        ? undefined
        : globalJavaInfo
  const javaTooOld = !!required && !!effectiveJava && effectiveJava.majorVersion < required

  const setMemory = (value: number): void => {
    setMemoryDraft(value)
    clearTimeout(memoryTimer.current)
    pendingMemory.current = value
    memoryTimer.current = setTimeout(() => {
      pendingMemory.current = null
      void save({ maxMemory: value })
    }, 400)
  }

  const javaValue: JavaChoice =
    config.javaMode === 'global' ? 'global' : config.javaMode === 'auto' ? 'auto' : config.javaPath
  const changeJava = (choice: JavaChoice): void => {
    if (choice === 'global') void save({ javaMode: 'global' })
    else if (choice === 'auto') void save({ javaMode: 'auto' })
    else void save({ javaMode: 'custom', javaPath: choice })
  }

  const windowPreset = WINDOW_PRESETS.find(([w, h]) => w === config.windowWidth && h === config.windowHeight)
  // 建议值不超过本机能分配的上限（与自动分配相同：给系统和其他程序至少留 2 GB 或四分之一）
  const recommendedMemory = plan ? Math.min(plan.recommended, plan.upper) : null

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：版本信息 */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <button
            onClick={onBack}
            title="返回版本列表"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/20">
            <VersionIcon icon={version.icon} iconUrl={version.iconUrl} className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold" title={version.id}>
              {version.id}
            </h1>
            <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs leading-[18px]">
              <span className="rounded-md bg-white/10 shrink-0 px-2">Minecraft {version.minecraftVersion}</span>
              {version.loader && (
                <span className="rounded-md bg-sky-500/15 shrink-0 px-2 text-sky-300">
                  {LOADER_NAMES[version.loader]}
                </span>
              )}
              {required && (
                <span className="rounded-md bg-amber-500/15 shrink-0 px-2 text-amber-200">需要 Java {required}+</span>
              )}
              <span className="rounded-md bg-white/10 shrink-0 px-2 text-white/60">
                {isolatedNow ? '版本隔离' : '共用游戏目录'}
              </span>
              <span className="truncate text-white/40">
                {overriddenCount > 0 ? `已单独设置 ${overriddenCount} 项，其余跟随全局设置` : '全部跟随全局设置'}
              </span>
            </div>
          </div>
          <AnimatePresence>
            {saved && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-xs text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                已保存
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => {
              clearTimeout(memoryTimer.current)
              pendingMemory.current = null
              setMemoryDraft(0)
              void save(DEFAULT_CONFIG)
            }}
            disabled={!customized}
            title="清除该版本的所有单独设置，全部跟随全局设置"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            全部恢复默认
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="page-scroll min-h-0 flex-1">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 内存 */}
          <Card
            icon={MemoryStick}
            tint="bg-sky-500/15 text-sky-300"
            title="游戏内存"
            desc="整合包和大型模组需要更多内存；分配太多反而会让回收变慢"
            overridden={memoryOverridden}
            onReset={() => setMemory(0)}
          >
            <Segmented
              value={memoryDraft ? 'custom' : 'global'}
              options={[
                ['global', `跟随全局（${global.memoryAuto ? '自动分配' : formatMemory(global.maxMemory)}）`],
                ['custom', '单独设置']
              ]}
              onChange={(mode) =>
                setMemory(
                  mode === 'global'
                    ? 0
                    : Math.min(memoryDraft || recommendedMemory || global.maxMemory || 4096, memoryMax)
                )
              }
            />
            {memoryDraft > 0 ? (
              <div className="mt-4">
                <div className="flex items-end justify-between">
                  <span className="text-xs text-white/60">最大内存</span>
                  <span className="font-mono text-2xl font-bold text-sky-300">{formatMemory(memoryDraft)}</span>
                </div>
                <input
                  type="range"
                  min={MEMORY_MIN}
                  max={memoryMax}
                  step={MEMORY_STEP}
                  value={Math.min(memoryDraft, memoryMax)}
                  onChange={(e) => setMemory(Number(e.target.value))}
                  className="mt-2 w-full cursor-pointer accent-sky-400"
                />
                <div className="flex justify-between text-xs text-white/40">
                  <span>{formatMemory(MEMORY_MIN)}</span>
                  <span>本机 {formatMemory(totalMemory)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {MEMORY_PRESETS.filter((gb) => gb * 1024 <= memoryMax).map((gb) => (
                    <button
                      key={gb}
                      onClick={() => setMemory(gb * 1024)}
                      className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                        memoryDraft === gb * 1024 ? 'bg-sky-500/30 text-sky-300' : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      {gb} GB
                    </button>
                  ))}
                  {recommendedMemory && (
                    <button
                      onClick={() => setMemory(Math.min(recommendedMemory, memoryMax))}
                      className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/30"
                      title="按这个版本的模组、光影、材质包等估算的建议值"
                    >
                      推荐 {formatMemory(recommendedMemory)}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-black/20 px-4 py-3">
                {global.memoryAuto ? (
                  plan ? (
                    <MemoryPlanSummary plan={plan} />
                  ) : planFailed ? (
                    <div className="text-xs text-white/50">
                      暂时无法估算这个版本需要的内存（版本文件可能不完整），启动时会重新计算
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      正在估算这个版本需要的内存…
                    </div>
                  )
                ) : (
                  <div className="text-xs text-white/60">
                    全局设置为固定分配{' '}
                    <span className="font-mono text-sm font-semibold text-white">{formatMemory(global.maxMemory)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Java */}
          <Card
            icon={Coffee}
            tint="bg-amber-500/15 text-amber-300"
            title="Java"
            desc="单独指定后只有这个版本使用所选的 Java"
            overridden={javaOverridden}
            onReset={() => changeJava('global')}
          >
            <JavaSelect
              value={javaValue}
              onChange={changeJava}
              javas={javaList}
              globalLabel={globalJava}
              required={required}
            />
            <div className="mt-3 text-xs leading-5 text-white/50">
              {required ? (
                <>
                  这个版本需要 <span className="font-medium text-white/80">Java {required}</span> 或更高版本。
                </>
              ) : null}
              {config.javaMode === 'auto' || (config.javaMode === 'global' && global.javaAuto)
                ? '启动时自动挑选合适的 Java，本机没有时自动下载。'
                : '启动时使用所选的 Java，不会自动下载。'}
            </div>
            {javaTooOld && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                所选的 Java {effectiveJava?.majorVersion} 版本太低，游戏无法启动，请改为「自动选择」或选择 Java{' '}
                {required} 以上
              </div>
            )}
          </Card>

          {/* 版本隔离 */}
          <Card
            icon={FolderTree}
            tint="bg-violet-500/15 text-violet-300"
            title="版本隔离"
            desc="开启后模组、存档、配置放在 versions 下这个版本自己的文件夹里"
            overridden={isolationOverridden}
            onReset={() => void save({ isolation: 'global' })}
          >
            <Segmented
              value={config.isolation}
              options={[
                ['global', `跟随全局（${globalIsolated ? '隔离' : '不隔离'}）`],
                ['on', '开启'],
                ['off', '关闭']
              ]}
              onChange={(isolation) => void save({ isolation })}
            />
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-black/20 px-3 py-2.5 text-xs text-white/60">
              <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
              <span className="min-w-0 break-all">
                当前使用{' '}
                <span className="font-mono text-white/80">
                  {isolatedNow ? `.minecraft/versions/${version.id}/` : '.minecraft/'}
                </span>
                。切换后游戏会使用另一个文件夹，原来的模组和存档不会自动移动。
              </span>
            </div>
          </Card>

          {/* 游戏窗口 */}
          <Card
            icon={Monitor}
            tint="bg-emerald-500/15 text-emerald-300"
            title="游戏窗口"
            desc="游戏启动时的窗口大小；不设置时使用游戏默认大小"
            overridden={windowOverridden}
            onReset={() => void save({ windowWidth: 0, windowHeight: 0, fullscreen: false })}
          >
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => void save({ windowWidth: 0, windowHeight: 0 })}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  !config.windowWidth && !config.windowHeight
                    ? 'bg-emerald-500/25 text-emerald-200'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                游戏默认
              </button>
              {WINDOW_PRESETS.map(([w, h]) => (
                <button
                  key={`${w}x${h}`}
                  onClick={() => void save({ windowWidth: w, windowHeight: h })}
                  className={`rounded-lg px-2.5 py-1 font-mono text-xs transition-colors ${
                    windowPreset?.[0] === w && windowPreset?.[1] === h
                      ? 'bg-emerald-500/25 text-emerald-200'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {w}×{h}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TextField
                type="number"
                value={config.windowWidth ? String(config.windowWidth) : ''}
                placeholder="宽度"
                className="w-24"
                onCommit={(v) => void save({ windowWidth: Math.min(16384, Math.max(0, Math.floor(Number(v) || 0))) })}
              />
              <span className="text-white/40">×</span>
              <TextField
                type="number"
                value={config.windowHeight ? String(config.windowHeight) : ''}
                placeholder="高度"
                className="w-24"
                onCommit={(v) => void save({ windowHeight: Math.min(16384, Math.max(0, Math.floor(Number(v) || 0))) })}
              />
              <div className="ml-auto">
                <Switch
                  checked={config.fullscreen}
                  onChange={(fullscreen) => void save({ fullscreen })}
                  label="全屏启动"
                />
              </div>
            </div>
          </Card>

          {/* 高级选项（占满一行，可以折叠） */}
          <Card
            icon={Terminal}
            tint="bg-rose-500/15 text-rose-300"
            title="高级选项"
            desc="附加启动参数和启动前后执行的命令。不清楚用途时请保持为空"
            overridden={advancedOverridden}
            onReset={() =>
              void save({
                jvmArgs: '',
                gameArgs: '',
                wrapperCommand: '',
                envVars: '',
                preLaunchCommand: '',
                postExitCommand: ''
              })
            }
            className="lg:col-span-2"
          >
            <button
              onClick={() => setAdvancedOpen(!showAdvanced)}
              className="flex w-full items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-sm transition-colors hover:bg-black/30"
            >
              <span className="text-white/70">{showAdvanced ? '收起高级选项' : '展开高级选项'}</span>
              <ChevronDown
                className={`h-4 w-4 text-white/50 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-5 pt-4 lg:grid-cols-2">
                    {/* 启动参数 */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Terminal className="h-4 w-4 text-white/50" />
                        启动参数
                      </div>
                      <p className="text-xs text-white/40">用空格分隔；带空格的参数用引号包住</p>
                      <Field label="JVM 参数">
                        <TextField
                          mono
                          value={config.jvmArgs}
                          placeholder="例如 -XX:+UseZGC"
                          className="mt-1 w-full"
                          onCommit={(jvmArgs) => void save({ jvmArgs })}
                        />
                      </Field>
                      <Field label="游戏参数">
                        <TextField
                          mono
                          value={config.gameArgs}
                          placeholder="例如 --quickPlayMultiplayer mc.example.com"
                          className="mt-1 w-full"
                          onCommit={(gameArgs) => void save({ gameArgs })}
                        />
                      </Field>
                      <Field label="包装命令" hint="游戏通过这个命令启动">
                        <TextField
                          mono
                          value={config.wrapperCommand}
                          placeholder={IS_WINDOWS ? '一般不需要' : '例如 gamemoderun、prime-run、mangohud'}
                          className="mt-1 w-full"
                          onCommit={(wrapperCommand) => void save({ wrapperCommand })}
                        />
                      </Field>
                      <Field label="环境变量" hint="每行一个「名称=值」">
                        <TextAreaField
                          value={config.envVars}
                          placeholder={'例如\n__GL_THREADED_OPTIMIZATIONS=1'}
                          onCommit={(envVars) => void save({ envVars })}
                        />
                      </Field>
                    </div>

                    {/* 启动命令 */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <SquareTerminal className="h-4 w-4 text-white/50" />
                        启动前后执行的命令
                      </div>
                      <p className="text-xs text-white/40">
                        通过系统命令行在版本的游戏目录中执行，输出显示在游戏日志里
                      </p>
                      <Field label="启动前执行" hint="执行失败时取消启动">
                        <TextField
                          mono
                          value={config.preLaunchCommand}
                          placeholder={
                            IS_WINDOWS
                              ? '例如 copy /y %INST_DIR%\\options-backup.txt %INST_DIR%\\options.txt'
                              : '例如 cp "$INST_DIR/options-backup.txt" "$INST_DIR/options.txt"'
                          }
                          className="mt-1 w-full"
                          onCommit={(preLaunchCommand) => void save({ preLaunchCommand })}
                        />
                      </Field>
                      <Field label="游戏退出后执行">
                        <TextField
                          mono
                          value={config.postExitCommand}
                          placeholder={
                            IS_WINDOWS ? '例如 explorer %INST_DIR%\\screenshots' : '例如 notify-send "游戏已退出"'
                          }
                          className="mt-1 w-full"
                          onCommit={(postExitCommand) => void save({ postExitCommand })}
                        />
                      </Field>
                      <div className="rounded-xl bg-black/20 px-3 py-2.5">
                        <div className="mb-1.5 text-xs text-white/50">命令里可以使用的变量</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {[
                            ['INST_NAME', '版本名'],
                            ['INST_DIR', '游戏目录'],
                            ['INST_MC_DIR', '.minecraft 目录'],
                            ['INST_JAVA', 'Java 路径'],
                            ['INST_MC_VERSION', 'Minecraft 版本'],
                            ['INST_EXIT_CODE', '退出码（退出后）']
                          ].map(([name, desc]) => (
                            <div key={name} className="flex min-w-0 items-center gap-1.5 text-xs">
                              <code className="shrink-0 rounded bg-black/30 px-1 font-mono text-white/70">
                                {varRef(name)}
                              </code>
                              <span className="truncate text-white/40">{desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default VersionSettingsPage
