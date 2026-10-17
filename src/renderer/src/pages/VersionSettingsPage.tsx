import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Coffee,
  FolderTree,
  Loader2,
  MemoryStick,
  Monitor,
  RotateCcw,
  Settings2,
  SquareTerminal,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import type { AppSettings, InstalledVersion, JavaInfo, VersionConfig } from '../../../shared/types'

const LOADER_NAMES = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge', optifine: 'OptiFine' }
const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge']
const MEMORY_STEP = 256
const MEMORY_MIN = 1024

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

const IS_WINDOWS = navigator.userAgent.includes('Windows')
/** 命令里引用变量的写法：Windows 命令行用 %NAME%，其他系统用 $NAME */
const varRef = (name: string): string => (IS_WINDOWS ? `%${name}%` : `$${name}`)

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 2)} GB` : `${mb} MB`
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
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            value === key
              ? 'bg-emerald-500/25 font-medium text-emerald-100'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  desc,
  children
}: {
  icon: LucideIcon
  title: string
  desc: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-3">
        <Icon className="h-5 w-5 text-sky-300" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-white/50">{desc}</p>
        </div>
      </div>
      {children}
    </section>
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
      className={`rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none transition-colors placeholder:text-white/30 focus:border-sky-400/70 ${
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
      className="mt-1 w-full resize-y rounded-lg border border-white/15 bg-black/20 px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-white/30 focus:border-sky-400/70"
    />
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
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()
  const memoryTimer = useRef<ReturnType<typeof setTimeout>>()
  const [memoryDraft, setMemoryDraft] = useState(0)

  useEffect(() => {
    window.api.getVersionConfig(version.id).then((c) => {
      setConfig(c)
      setMemoryDraft(c.maxMemory)
    })
    window.api.getSettings().then(setGlobal)
    window.api
      .getSystemInfo()
      .then((info) => setTotalMemory(info.totalMemory))
      .catch(() => undefined)
    window.api
      .scanJava()
      .then(setJavaList)
      .catch(() => setJavaList([]))
    return () => {
      clearTimeout(savedTimer.current)
      clearTimeout(memoryTimer.current)
    }
  }, [version.id])

  const save = async (patch: Partial<VersionConfig>): Promise<void> => {
    setError('')
    try {
      const next = await window.api.setVersionConfig(version.id, patch)
      setConfig(next)
      setSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 1500)
      onChanged()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  if (!config || !global) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const modded = !!version.loader && MOD_LOADERS.includes(version.loader)
  const globalIsolated = global.versionIsolation === 'all' || (global.versionIsolation === 'modded' && modded)
  const globalJava = global.javaAuto
    ? '自动选择'
    : `Java ${javaList?.find((j) => j.path === global.javaPath)?.majorVersion ?? '手动指定'}`
  const isolatedNow = config.isolation === 'global' ? globalIsolated : config.isolation === 'on'
  const memoryMax = Math.max(MEMORY_MIN, Math.floor(totalMemory / MEMORY_STEP) * MEMORY_STEP)
  const customized = JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG)

  const setMemory = (value: number): void => {
    setMemoryDraft(value)
    clearTimeout(memoryTimer.current)
    memoryTimer.current = setTimeout(() => save({ maxMemory: value }), 400)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            title="返回版本列表"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <Settings2 className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold" title={version.id}>
              {version.id}
            </h1>
            <p className="text-xs text-white/50">
              版本设置 · Minecraft {version.minecraftVersion}
              {version.loader && ` · ${LOADER_NAMES[version.loader]}`} · 未单独设置的项跟随全局设置
            </p>
          </div>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已保存
            </span>
          )}
          <button
            onClick={() => {
              clearTimeout(memoryTimer.current)
              setMemoryDraft(0)
              save(DEFAULT_CONFIG)
            }}
            disabled={!customized}
            title="清除该版本的所有单独设置，全部跟随全局设置"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Card icon={MemoryStick} title="游戏内存" desc="整合包和大型模组通常需要更多内存，建议 4 ~ 8 GB">
          <Segmented
            value={memoryDraft ? 'custom' : 'global'}
            options={[
              ['global', `跟随全局（${global.memoryAuto ? '自动分配' : formatMemory(global.maxMemory)}）`],
              ['custom', '单独设置']
            ]}
            onChange={(mode) => setMemory(mode === 'global' ? 0 : memoryDraft || global.maxMemory)}
          />
          {memoryDraft > 0 && (
            <label className="mt-4 block">
              <div className="flex justify-between text-xs text-white/60">
                <span>最大内存</span>
                <span className="font-mono text-sm text-white">{formatMemory(memoryDraft)}</span>
              </div>
              <input
                type="range"
                min={MEMORY_MIN}
                max={memoryMax}
                step={MEMORY_STEP}
                value={Math.min(memoryDraft, memoryMax)}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-white/40">
                <span>{formatMemory(MEMORY_MIN)}</span>
                <span>本机 {formatMemory(totalMemory)}</span>
              </div>
            </label>
          )}
        </Card>

        <Card icon={Coffee} title="Java" desc="指定后只有这个版本使用所选的 Java">
          <Segmented
            value={config.javaMode}
            options={[
              ['global', `跟随全局（${globalJava}）`],
              ['auto', '自动选择'],
              ['custom', '指定 Java']
            ]}
            onChange={(javaMode) => {
              // 选「指定 Java」时先默认选中列表里的第一个，保存时必须有路径
              if (javaMode === 'custom' && !config.javaPath) {
                const first = javaList?.[0]
                if (!first) {
                  setError('没有找到可用的 Java，请先在「设置」中下载')
                  return
                }
                save({ javaMode, javaPath: first.path })
                return
              }
              save({ javaMode })
            }}
          />
          {config.javaMode === 'custom' && (
            <div className="mt-3 flex flex-col gap-1.5">
              {javaList === null && (
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在查找本机的 Java…
                </div>
              )}
              {javaList && !javaList.some((j) => j.path === config.javaPath) && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">之前选择的 Java 已找不到：{config.javaPath}</span>
                </div>
              )}
              {javaList?.map((java) => {
                const active = java.path === config.javaPath
                return (
                  <button
                    key={java.path}
                    onClick={() => save({ javaPath: java.path })}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-emerald-400/50 bg-emerald-500/15'
                        : 'border-white/5 bg-black/20 hover:bg-black/30'
                    }`}
                  >
                    <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono font-bold">
                      {java.majorVersion}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">Java {java.version}</span>
                      <span className="block truncate font-mono text-xs text-white/50" title={java.path}>
                        {java.path}
                      </span>
                    </span>
                    {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card icon={FolderTree} title="版本隔离" desc="开启后模组、存档、配置放在 versions 下该版本自己的文件夹里">
          <Segmented
            value={config.isolation}
            options={[
              ['global', `跟随全局（${globalIsolated ? '隔离' : '不隔离'}）`],
              ['on', '开启'],
              ['off', '关闭']
            ]}
            onChange={(isolation) => save({ isolation })}
          />
          <p className="mt-2 text-xs text-white/40">
            当前{isolatedNow ? '使用版本自己的文件夹' : '使用公共的游戏目录'}
            。切换后游戏会使用另一个文件夹，原来的模组和存档不会自动移动。
          </p>
        </Card>

        <Card icon={Monitor} title="游戏窗口" desc="留空表示使用游戏默认大小">
          <div className="flex flex-wrap items-center gap-2">
            <TextField
              type="number"
              value={config.windowWidth ? String(config.windowWidth) : ''}
              placeholder="宽度"
              className="w-28"
              onCommit={(v) => save({ windowWidth: Math.min(16384, Math.max(0, Math.floor(Number(v) || 0))) })}
            />
            <span className="text-white/40">×</span>
            <TextField
              type="number"
              value={config.windowHeight ? String(config.windowHeight) : ''}
              placeholder="高度"
              className="w-28"
              onCommit={(v) => save({ windowHeight: Math.min(16384, Math.max(0, Math.floor(Number(v) || 0))) })}
            />
            <label className="ml-4 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.fullscreen}
                onChange={(e) => save({ fullscreen: e.target.checked })}
                className="accent-emerald-500"
              />
              全屏启动
            </label>
          </div>
        </Card>

        <Card
          icon={Terminal}
          title="高级"
          desc="附加的启动参数，用空格分隔；带空格的参数用引号包住。不清楚用途时请留空"
        >
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-white/60">JVM 参数</span>
              <TextField
                mono
                value={config.jvmArgs}
                placeholder="例如 -XX:+UseG1GC -XX:MaxGCPauseMillis=50"
                className="mt-1 w-full"
                onCommit={(jvmArgs) => save({ jvmArgs })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">游戏参数</span>
              <TextField
                mono
                value={config.gameArgs}
                placeholder="例如 --quickPlayMultiplayer mc.example.com"
                className="mt-1 w-full"
                onCommit={(gameArgs) => save({ gameArgs })}
              />
            </label>
          </div>
        </Card>

        <Card
          icon={SquareTerminal}
          title="启动命令"
          desc="在游戏启动前后执行自己的命令，或通过其他程序启动游戏。不清楚用途时请留空"
        >
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-white/60">包装命令（游戏通过这个命令启动）</span>
              <TextField
                mono
                value={config.wrapperCommand}
                placeholder={IS_WINDOWS ? '一般不需要' : '例如 gamemoderun、prime-run、mangohud'}
                className="mt-1 w-full"
                onCommit={(wrapperCommand) => save({ wrapperCommand })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">环境变量（每行一个「名称=值」）</span>
              <TextAreaField
                value={config.envVars}
                placeholder={'例如\n__GL_THREADED_OPTIMIZATIONS=1'}
                onCommit={(envVars) => save({ envVars })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">启动前执行（执行失败时取消启动）</span>
              <TextField
                mono
                value={config.preLaunchCommand}
                placeholder={
                  IS_WINDOWS
                    ? '例如 copy /y %INST_DIR%\\options-backup.txt %INST_DIR%\\options.txt'
                    : '例如 cp "$INST_DIR/options-backup.txt" "$INST_DIR/options.txt"'
                }
                className="mt-1 w-full"
                onCommit={(preLaunchCommand) => save({ preLaunchCommand })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">游戏退出后执行</span>
              <TextField
                mono
                value={config.postExitCommand}
                placeholder={IS_WINDOWS ? '例如 explorer %INST_DIR%\\screenshots' : '例如 notify-send "游戏已退出"'}
                className="mt-1 w-full"
                onCommit={(postExitCommand) => save({ postExitCommand })}
              />
            </label>
            <p className="text-xs leading-5 text-white/40">
              命令通过系统命令行执行，在版本的游戏目录中运行，输出显示在游戏日志里。可以使用这些变量：
              {[
                ['INST_NAME', '版本名'],
                ['INST_DIR', '游戏目录'],
                ['INST_MC_DIR', '.minecraft 目录'],
                ['INST_JAVA', 'Java 路径'],
                ['INST_MC_VERSION', 'Minecraft 版本'],
                ['INST_EXIT_CODE', '退出码（仅退出后命令）']
              ].map(([name, desc]) => (
                <span key={name} className="mr-2 inline-block">
                  <code className="rounded bg-black/30 px-1 font-mono text-white/60">{varRef(name)}</code> {desc}
                </span>
              ))}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default VersionSettingsPage
