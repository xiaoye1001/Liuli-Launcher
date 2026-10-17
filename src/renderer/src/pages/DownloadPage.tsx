import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Gamepad2,
  Loader2,
  Package,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react'
import InstallProgressCard from '../components/InstallProgressCard'
import InstallSetupPage from './InstallSetupPage'
import ModpackSetupPage from './ModpackSetupPage'
import ResourceBrowser, { RESOURCE_TYPES } from '../components/ResourceBrowser'
import type {
  InstalledVersion,
  InstallStatus,
  ModpackInfo,
  ResourceType,
  VersionEntry,
  VersionManifest,
  VersionType
} from '../../../shared/types'

type Section = 'vanilla' | ResourceType

/** 页面左侧的分类：原版游戏 + 社区资源 */
const RESOURCE_SECTIONS: ResourceType[] = ['mod', 'modpack', 'datapack', 'resourcepack', 'shader']

type Filter = 'release' | 'snapshot' | 'old'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'release', label: '正式版' },
  { key: 'snapshot', label: '快照版' },
  { key: 'old', label: '远古版' }
]

const TYPE_LABELS: Record<VersionType, { label: string; className: string }> = {
  release: { label: '正式版', className: 'bg-emerald-500/20 text-emerald-300' },
  snapshot: { label: '快照', className: 'bg-amber-500/20 text-amber-300' },
  old_beta: { label: 'Beta', className: 'bg-fuchsia-500/20 text-fuchsia-300' },
  old_alpha: { label: 'Alpha', className: 'bg-rose-500/20 text-rose-300' }
}

const SOURCE_LABELS = { bmclapi: 'BMCLAPI 镜像', mojang: '官方源' }

function matchFilter(version: VersionEntry, filter: Filter): boolean {
  if (filter === 'old') return version.type === 'old_beta' || version.type === 'old_alpha'
  return version.type === filter
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('zh-CN')
}

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

function SectionButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: typeof Package
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-emerald-500/20 font-medium text-emerald-200' : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-300' : ''}`} />
      {label}
    </button>
  )
}

interface DownloadPageProps {
  /** 拖入窗口的整合包，打开安装确认页 */
  incomingModpack?: ModpackInfo | null
  onModpackConsumed?: () => void
  /** 从「版本」页跳转过来：打开某个资源分类，并把安装目标设为该版本 */
  request?: { section: ResourceType; versionId: string } | null
  onRequestConsumed?: () => void
}

function DownloadPage({
  incomingModpack,
  onModpackConsumed,
  request,
  onRequestConsumed
}: DownloadPageProps = {}): JSX.Element {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [installed, setInstalled] = useState<InstalledVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('release')
  const [keyword, setKeyword] = useState('')
  const [install, setInstall] = useState<InstallStatus | null>(null)
  const [actionError, setActionError] = useState('')
  const [setupFor, setSetupFor] = useState<VersionEntry | null>(null)
  const [modpack, setModpack] = useState<ModpackInfo | null>(null)
  const [section, setSection] = useState<Section>('vanilla')
  /** 打开过的资源分类保持挂载（隐藏），切回来时搜索结果和筛选条件还在 */
  const [visited, setVisited] = useState<ResourceType[]>([])
  /** 以管理员身份运行时，Windows 不允许从资源管理器拖入文件 */
  const [elevated, setElevated] = useState(false)

  const openSection = (next: Section): void => {
    setSection(next)
    if (next !== 'vanilla') setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]))
  }

  useEffect(() => {
    window.api
      .getSystemInfo()
      .then((info) => setElevated(info.elevated))
      .catch(() => undefined)
  }, [])

  /** 社区资源默认安装到的版本（从「版本」页跳转过来时） */
  const [targetHint, setTargetHint] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!request) return
    setSetupFor(null)
    setModpack(null)
    setTargetHint(request.versionId)
    openSection(request.section)
    onRequestConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, onRequestConsumed])

  // 拖入的整合包：关闭其他子页面，直接进入安装确认页
  useEffect(() => {
    if (!incomingModpack) return
    setSetupFor(null)
    setModpack(incomingModpack)
    onModpackConsumed?.()
  }, [incomingModpack, onModpackConsumed])
  const lastState = useRef<string | undefined>(undefined)
  const tabRefs = useRef<Partial<Record<Filter, HTMLButtonElement | null>>>({})
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number } | null>(null)

  const loadInstalled = useCallback(async (): Promise<void> => {
    setInstalled(await window.api.getInstalledVersions())
  }, [])

  const load = async (force: boolean): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setManifest(await window.api.getVersionList(force))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(false)
    loadInstalled()
    // 进入页面时获取当前安装状态，并订阅主进程推送的实时进度
    window.api.getInstallStatus().then(setInstall)
    return window.api.onInstallStatus(setInstall)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 安装结束后刷新已安装列表（用于标记「已安装」）
  useEffect(() => {
    if (lastState.current === 'running' && install?.state !== 'running') loadInstalled()
    lastState.current = install?.state
  }, [install, loadInstalled])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setActionError('')
    try {
      await action()
    } catch (e) {
      setActionError(cleanError(e))
    }
  }

  const retryInstall = (): Promise<void> => run(() => window.api.retryInstall())
  const repair = (versionId: string): Promise<void> => run(() => window.api.repairVersion(versionId))

  const installedIds = useMemo(() => new Set(installed.map((v) => v.id)), [installed])
  const busy = install?.state === 'running'
  const kw = keyword.trim().toLowerCase()

  const visibleRemote = useMemo(() => {
    if (!manifest) return []
    return manifest.versions.filter((v) => matchFilter(v, filter) && (!kw || v.id.toLowerCase().includes(kw)))
  }, [manifest, filter, kw])

  // 筛选标签的滑块：自己量按钮位置再滑过去。
  // 不用 layoutId——它在页面内卸载/切换后会让 App 的页面退场动画卡住，切换页面后内容空白
  useLayoutEffect(() => {
    const el = tabRefs.current[filter]
    if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [filter])

  const pickModpack = (): Promise<void> =>
    run(async () => {
      const info = await window.api.pickModpack()
      if (info) setModpack(info)
    })

  const importButton = (
    <button
      onClick={pickModpack}
      title="导入本地整合包：Modrinth（.mrpack）、CurseForge、MultiMC / Prism、MCBBS（.zip）"
      className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
    >
      <Package className="h-4 w-4" />
      导入整合包
    </button>
  )

  // 拖放由全窗口的 DropOverlay 处理，这里只是提示位置，点击也能选择文件
  const dropZone = (
    <div>
      <button
        onClick={pickModpack}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/60 transition-colors hover:border-emerald-400/50 hover:bg-white/10 hover:text-white"
      >
        <PackagePlus className="h-5 w-5 shrink-0" />
        把整合包文件拖到窗口里，或点这里选择文件（.mrpack / .zip）
      </button>
      {elevated && (
        <p className="mt-2 flex items-start gap-2 px-1 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          启动器正在以管理员身份运行，Windows
          不允许从资源管理器把文件拖进管理员程序。请点上面的按钮选择文件，或不用管理员身份打开启动器。
        </p>
      )}
    </div>
  )

  // 版本列表始终保持挂载，安装设置页只是盖在上面：
  // 列表里的 layoutId 动画元素如果中途卸载，framer-motion 会卡住 App 的页面退场动画，导致切换页面后空白
  return (
    <>
      {modpack && (
        <div className="h-full animate-slide-in">
          <ModpackSetupPage
            modpack={modpack}
            installedIds={installedIds}
            busy={busy}
            onBack={() => setModpack(null)}
            onStarted={() => setModpack(null)}
          />
        </div>
      )}
      {setupFor && (
        <div key={setupFor.id} className="h-full animate-slide-in">
          <InstallSetupPage
            version={setupFor}
            installedIds={installedIds}
            busy={busy}
            onBack={() => setSetupFor(null)}
            onStarted={() => setSetupFor(null)}
          />
        </div>
      )}
      <div className={`flex h-full gap-4 ${setupFor || modpack ? 'hidden' : ''}`}>
        {/* 分类 */}
        <nav className="flex w-36 shrink-0 flex-col gap-1 rounded-2xl border border-white/10 bg-white/10 p-2 shadow-2xl backdrop-blur-xl">
          <SectionButton
            icon={Gamepad2}
            label="原版游戏"
            active={section === 'vanilla'}
            onClick={() => openSection('vanilla')}
          />
          <div className="px-3 pb-1 pt-3 text-xs text-white/40">社区资源</div>
          {RESOURCE_SECTIONS.map((type) => (
            <SectionButton
              key={type}
              icon={RESOURCE_TYPES[type].icon}
              label={RESOURCE_TYPES[type].label}
              active={section === type}
              onClick={() => openSection(type)}
            />
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 安装进度：所有分类共用 */}
          <AnimatePresence>
            {install && (
              <InstallProgressCard
                status={install}
                onCancel={() => window.api.cancelInstall()}
                onRetry={() => (install.kind === 'repair' ? repair(install.versionId) : retryInstall())}
                onDismiss={() => setInstall(null)}
              />
            )}
          </AnimatePresence>
          {actionError && (
            <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-all">{actionError}</span>
            </div>
          )}

          {visited.map((type) => (
            <div key={type} className={`min-h-0 flex-1 ${section === type ? '' : 'hidden'}`}>
              <ResourceBrowser
                type={type}
                installed={installed}
                targetHint={targetHint}
                onModpackPicked={setModpack}
                headerExtra={type === 'modpack' ? importButton : undefined}
                topExtra={type === 'modpack' ? dropZone : undefined}
              />
            </div>
          ))}

          <div className={`flex min-h-0 flex-1 flex-col gap-5 ${section === 'vanilla' ? '' : 'hidden'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">原版游戏</h1>
                <p className="mt-1 text-xs text-white/50">
                  {manifest
                    ? `当前下载源：${SOURCE_LABELS[manifest.source]} · 共 ${manifest.versions.length} 个版本`
                    : '正在获取版本列表'}
                  {` · 已安装 ${installed.length} 个`}
                </p>
              </div>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    load(true)
                    loadInstalled()
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  刷新
                </motion.button>
              </div>
            </div>

            {/* 最新版本 */}
            {manifest && !install && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20">
                    <Sparkles className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <div className="text-xs text-white/50">最新正式版</div>
                    <div className="font-mono text-lg font-bold">{manifest.latest.release}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/20">
                    <FlaskConical className="h-5 w-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="text-xs text-white/50">最新快照</div>
                    <div className="font-mono text-lg font-bold">{manifest.latest.snapshot}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 版本列表 */}
            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="relative flex rounded-xl bg-black/20 p-1">
                  {tabIndicator && (
                    <motion.div
                      className="absolute inset-y-1 left-0 rounded-lg bg-white/15"
                      initial={false}
                      animate={{ x: tabIndicator.left, width: tabIndicator.width }}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      ref={(el) => (tabRefs.current[f.key] = el)}
                      onClick={() => setFilter(f.key)}
                      className={`relative rounded-lg px-4 py-1.5 text-sm transition-colors ${
                        filter === f.key ? 'text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <span className="relative z-10">{f.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
                  <Search className="h-4 w-4 text-white/40" />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索版本号，例如 1.20"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <>
                  {loading && !manifest && (
                    <div className="flex h-full items-center justify-center text-white/50">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                  {error && (
                    <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="break-all">{error}</span>
                    </div>
                  )}
                  {manifest && visibleRemote.length === 0 && (
                    <div className="py-10 text-center text-sm text-white/40">没有匹配的版本</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {visibleRemote.map((version) => {
                      const typeInfo = TYPE_LABELS[version.type] ?? TYPE_LABELS.release
                      const isInstalled = installedIds.has(version.id)
                      return (
                        <div
                          key={version.id}
                          role="button"
                          onClick={() => setSetupFor(version)}
                          title="点击进入安装设置"
                          className="group flex h-12 cursor-pointer items-center gap-4 rounded-xl bg-black/20 px-4 transition-colors hover:bg-black/30"
                        >
                          <span className="w-40 truncate font-mono text-sm font-semibold">{version.id}</span>
                          <span className={`rounded-md px-2 py-0.5 text-xs ${typeInfo.className}`}>
                            {typeInfo.label}
                          </span>
                          {isInstalled && (
                            <span className="flex items-center gap-1 text-xs text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              已安装
                            </span>
                          )}
                          <span className="flex-1 text-xs text-white/40">{formatDate(version.releaseTime)}</span>
                          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                            <Download className="h-3.5 w-3.5" />
                            安装
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

export default DownloadPage
