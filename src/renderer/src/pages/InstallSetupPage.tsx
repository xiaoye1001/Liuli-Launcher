import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronRight, Download, Loader2, X } from 'lucide-react'
import GrassBlockIcon from '../components/GrassBlockIcon'
import PageHeader from '../components/PageHeader'
import type {
  FabricLoaderVersion,
  ForgeVersionInfo,
  NeoForgeVersionInfo,
  OptiFineVersionInfo,
  OptiFineVersionRef,
  VersionEntry
} from '../../../shared/types'

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

/** 与主进程一致的版本名校验，返回错误提示（合法时返回空字符串） */
function validateName(name: string, minecraftVersion: string, hasLoader: boolean, taken: Set<string>): string {
  if (!name) return '版本名不能为空'
  if (name.length > 64) return '版本名不能超过 64 个字符'
  if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') return '版本名不能包含 \\ / : * ? " < > | 等字符'
  if (name !== name.trim()) return '版本名首尾不能有空格'
  if (hasLoader && name === minecraftVersion) return '安装模组加载器时，版本名不能与原版相同'
  if (name !== minecraftVersion && taken.has(name)) return `已存在名为「${name}」的版本`
  return ''
}

interface LoaderRowProps {
  title: string
  status: string
  /** 状态文字的强调色（已选择时高亮） */
  highlight?: boolean
  disabled?: boolean
  expanded?: boolean
  onToggle?: () => void
  onClear?: () => void
  children?: React.ReactNode
}

/** 一行模组加载器选项，点击后展开版本列表 */
function LoaderRow({
  title,
  status,
  highlight,
  disabled,
  expanded,
  onToggle,
  onClear,
  children
}: LoaderRowProps): JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl">
      <div
        role="button"
        onClick={disabled ? undefined : onToggle}
        className={`flex h-14 items-center gap-4 px-6 ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}`}
      >
        <span className="w-28 shrink-0 font-semibold">{title}</span>
        <span className={`flex-1 truncate text-sm ${highlight ? 'font-mono text-emerald-300' : 'text-white/45'}`}>
          {status}
        </span>
        {onClear && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            title="不安装"
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!disabled && (
          <ChevronRight className={`h-5 w-5 text-white/60 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="border-t border-white/10 p-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface InstallSetupPageProps {
  version: VersionEntry
  /** 已安装的版本名，用于检查重名 */
  installedIds: Set<string>
  /** 是否有安装任务正在进行 */
  busy: boolean
  onBack: () => void
  /** 安装已开始，回到版本列表查看进度 */
  onStarted: () => void
}

type LoaderKind = 'forge' | 'neoforge' | 'fabric' | 'quilt' | 'optifine'

/** 界面上的排列顺序，也是自动生成版本名时的顺序 */
const LOADER_ORDER: LoaderKind[] = ['forge', 'neoforge', 'fabric', 'quilt', 'optifine']

/** 能同时安装的组合：只有 Forge + OptiFine（OptiFine 作为 Forge 模组） */
function compatible(a: LoaderKind, b: LoaderKind): boolean {
  return (a === 'forge' && b === 'optifine') || (a === 'optifine' && b === 'forge')
}

const LOADER_NAMES: Record<LoaderKind, string> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt',
  optifine: 'OptiFine'
}

/** 加载器版本列表的统一格式 */
interface LoaderOption {
  version: string
  /** 显示用的版本名，不填时显示 version */
  label?: string
  /** OptiFine 下载时需要的 type 与 patch */
  optifine?: OptiFineVersionRef
  /** OptiFine 测试时使用的 Forge 版本，例如「Forge 47.1.0」 */
  forgeHint?: string
  /** 版本旁的标签，例如「推荐」「测试版」 */
  tags: { text: string; className: string }[]
  /** 测试版默认隐藏 */
  unstable: boolean
  date?: string
}

/** 某个加载器的版本列表加载状态 */
interface LoaderState {
  options: LoaderOption[] | null
  error: string
}

const TAG_STYLES = {
  recommended: 'bg-emerald-500/20 text-emerald-300',
  latest: 'bg-sky-500/20 text-sky-300',
  beta: 'bg-amber-500/20 text-amber-300'
}

/** 安装设置页：自定义版本名，并选择要附加的模组加载器（Forge / NeoForge / Fabric / Quilt 四选一，OptiFine 可单独装或配合 Forge） */
function InstallSetupPage({ version, installedIds, busy, onBack, onStarted }: InstallSetupPageProps): JSX.Element {
  const mc = version.id
  const [name, setName] = useState(mc)
  const [nameEdited, setNameEdited] = useState(false)
  const [loaders, setLoaders] = useState<Record<LoaderKind, LoaderState>>({
    forge: { options: null, error: '' },
    neoforge: { options: null, error: '' },
    fabric: { options: null, error: '' },
    quilt: { options: null, error: '' },
    optifine: { options: null, error: '' }
  })
  /** 已选择的加载器及版本 */
  const [selected, setSelected] = useState<Partial<Record<LoaderKind, string>>>({})
  const [expanded, setExpanded] = useState<LoaderKind | null>(null)
  const [showUnstable, setShowUnstable] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = (kind: LoaderKind, fetcher: () => Promise<LoaderOption[]>): void => {
      fetcher()
        .then((options) => setLoaders((prev) => ({ ...prev, [kind]: { options, error: '' } })))
        .catch((e) => setLoaders((prev) => ({ ...prev, [kind]: { options: [], error: cleanError(e) } })))
    }
    load('forge', async () =>
      (await window.api.getForgeVersions(mc)).map((v: ForgeVersionInfo) => ({
        version: v.version,
        unstable: false,
        date: v.date,
        tags: [
          ...(v.recommended ? [{ text: '推荐', className: TAG_STYLES.recommended }] : []),
          ...(v.latest ? [{ text: '最新', className: TAG_STYLES.latest }] : [])
        ]
      }))
    )
    load('neoforge', async () =>
      (await window.api.getNeoForgeVersions(mc)).map((v: NeoForgeVersionInfo) => ({
        version: v.version,
        unstable: v.beta,
        tags: v.beta ? [{ text: '测试版', className: TAG_STYLES.beta }] : []
      }))
    )
    load('fabric', async () =>
      (await window.api.getFabricLoaders(mc)).map((v: FabricLoaderVersion) => ({
        version: v.version,
        unstable: !v.stable,
        tags: v.stable ? [] : [{ text: '测试版', className: TAG_STYLES.beta }]
      }))
    )
    load('quilt', async () =>
      (await window.api.getQuiltLoaders(mc)).map((v: FabricLoaderVersion) => ({
        version: v.version,
        unstable: !v.stable,
        tags: v.stable ? [] : [{ text: '测试版', className: TAG_STYLES.beta }]
      }))
    )
    load('optifine', async () => {
      const list = await window.api.getOptiFineVersions(mc)
      const recommended = list.find((v) => !v.preview)
      return list.map((v: OptiFineVersionInfo) => ({
        version: `${v.type}_${v.patch}`,
        label: `${v.type} ${v.patch}`.replace(/_/g, ' '),
        optifine: { type: v.type, patch: v.patch },
        forgeHint: v.forge,
        unstable: v.preview,
        tags: [
          ...(v === recommended ? [{ text: '推荐', className: TAG_STYLES.recommended }] : []),
          ...(v.preview ? [{ text: '预览版', className: TAG_STYLES.beta }] : []),
          ...(v.forge ? [{ text: `兼容 ${v.forge}`, className: 'bg-white/10 text-white/50' }] : [])
        ]
      }))
    })
  }, [mc])

  const selectedKinds = LOADER_ORDER.filter((kind) => selected[kind])
  /** 某个加载器选中的版本信息 */
  const optionOf = (kind: LoaderKind): LoaderOption | undefined =>
    loaders[kind].options?.find((o) => o.version === selected[kind])
  const labelOf = (kind: LoaderKind): string => optionOf(kind)?.label ?? selected[kind] ?? ''
  const autoName = [mc, ...selectedKinds.map((kind) => `${LOADER_NAMES[kind]} ${labelOf(kind)}`)].join('-')

  // 用户没有手动改过版本名时，名字跟随所选的加载器自动变化
  useEffect(() => {
    if (!nameEdited) setName(autoName)
  }, [autoName, nameEdited])

  const nameError = validateName(name, mc, selectedKinds.length > 0, installedIds)

  /** 选择某个版本：保留能与它共存的其他选择 */
  const select = (kind: LoaderKind, version: string): void => {
    setSelected((prev) => {
      const next: Partial<Record<LoaderKind, string>> = { [kind]: version }
      for (const other of LOADER_ORDER) {
        if (other !== kind && prev[other] && compatible(kind, other)) next[other] = prev[other]
      }
      return next
    })
  }

  const clear = (kind: LoaderKind): void => {
    setSelected((prev) => {
      const next = { ...prev }
      delete next[kind]
      return next
    })
  }

  const statusOf = (kind: LoaderKind): string => {
    const { options, error: loadError } = loaders[kind]
    if (options === null) return '正在获取…'
    if (options.length === 0) return loadError ? '获取失败' : '无'
    if (selected[kind]) return labelOf(kind)
    const conflict = selectedKinds.find((other) => !compatible(kind, other))
    if (conflict) return `与 ${LOADER_NAMES[conflict]} 不兼容`
    return '可以添加'
  }

  // OptiFine 与 Forge 一起安装时，提示 OptiFine 测试时使用的 Forge 版本
  const optiFineForgeHint = selected.forge && selected.optifine ? optionOf('optifine')?.forgeHint : undefined

  const start = async (): Promise<void> => {
    setSubmitting(true)
    setError('')
    try {
      await window.api.startInstall({
        minecraftVersion: mc,
        name,
        forgeVersion: selected.forge,
        neoforgeVersion: selected.neoforge,
        fabricLoader: selected.fabric,
        quiltLoader: selected.quilt,
        optifine: optionOf('optifine')?.optifine
      })
      onStarted()
    } catch (e) {
      setError(cleanError(e))
      setSubmitting(false)
    }
  }

  const renderLoaderRow = (kind: LoaderKind): JSX.Element => {
    const { options, error: loadError } = loaders[kind]
    const hasUnstable = (options ?? []).some((o) => o.unstable)
    const visible = (options ?? []).filter((o) => showUnstable || !o.unstable)
    return (
      <LoaderRow
        key={kind}
        title={LOADER_NAMES[kind]}
        status={statusOf(kind)}
        highlight={!!selected[kind]}
        disabled={!options || options.length === 0}
        expanded={expanded === kind}
        onToggle={() => setExpanded((e) => (e === kind ? null : kind))}
        onClear={selected[kind] ? () => clear(kind) : undefined}
      >
        {hasUnstable && (
          <div className="mb-1 flex justify-end px-2 pt-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/50">
              <input
                type="checkbox"
                checked={showUnstable}
                onChange={(e) => setShowUnstable(e.target.checked)}
                className="accent-emerald-500"
              />
              显示测试版
            </label>
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {visible.length === 0 && (
            <div className="px-4 py-3 text-sm text-white/40">{loadError || '只有测试版，勾选「显示测试版」查看'}</div>
          )}
          {visible.map((option) => {
            const active = selected[kind] === option.version
            return (
              <button
                key={option.version}
                onClick={() => {
                  select(kind, option.version)
                  setExpanded(null)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm ${
                  active ? 'bg-emerald-500/15' : 'hover:bg-white/10'
                }`}
              >
                <span className="font-mono">{option.label ?? option.version}</span>
                {option.tags.map((tag) => (
                  <span key={tag.text} className={`rounded px-1.5 text-xs ${tag.className}`}>
                    {tag.text}
                  </span>
                ))}
                <span className="flex-1 text-right text-xs text-white/40">
                  {option.date ? new Date(option.date).toLocaleDateString('zh-CN') : ''}
                </span>
                {active && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            )
          })}
        </div>
      </LoaderRow>
    )
  }

  return (
    <div className="relative flex h-full flex-col gap-4">
      {/* 顶部：返回、要安装的版本（与其他页面的标题栏对齐） */}
      <PageHeader
        onBack={onBack}
        backTitle="返回版本列表"
        icon={<GrassBlockIcon className="h-9 w-9" />}
        title={`安装 Minecraft ${mc}`}
        titleHint={mc}
        subtitle="可以修改版本名称、选择要一起安装的模组加载器，然后点下方的「开始下载」"
      />
      <div className="page-scroll flex min-h-0 flex-1 flex-col gap-4 pb-24">
        {/* 版本名称 */}
        <section className="shrink-0 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
          <label htmlFor="install-version-name" className="block text-sm font-medium">
            版本名称
          </label>
          <input
            id="install-version-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameEdited(true)
            }}
            maxLength={64}
            spellCheck={false}
            className={`mt-2 w-full rounded-lg border bg-black/10 px-4 py-2.5 text-lg outline-none transition-colors focus:bg-black/20 ${
              nameError ? 'border-red-400/60' : 'border-white/15 focus:border-sky-400/70'
            }`}
          />
          {nameError && <p className="mt-1.5 text-xs text-red-300">{nameError}</p>}
        </section>

        <div className="h-2" />

        {/* 模组加载器 */}
        {LOADER_ORDER.map(renderLoaderRow)}

        {(selected.forge || selected.neoforge) && (
          <p className="px-2 text-xs leading-5 text-white/45">
            安装 {selected.forge ? 'Forge' : 'NeoForge'} 时需要用 Java
            运行它的安装程序，会比普通安装多花几分钟。装好后在下载页点该版本的 「打开文件夹」，把模组放进 mods
            文件夹即可（未开启版本隔离时为游戏目录下的 mods）。
          </p>
        )}
        {selected.optifine && !selected.forge && (
          <p className="px-2 text-xs leading-5 text-white/45">
            OptiFine 从 BMCLAPI 镜像下载，安装时需要用 Java 给游戏本体打补丁。
          </p>
        )}
        {selected.optifine && selected.forge && (
          <p className="px-2 text-xs leading-5 text-white/45">
            OptiFine 会作为模组放进该版本的 mods 文件夹。
            {optiFineForgeHint &&
              `这个 OptiFine 版本是在 ${optiFineForgeHint} 上测试的，Forge 版本相差太大时可能无法启动。`}
          </p>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
      </div>

      {/* 底部悬浮的下载按钮 */}
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center">
        <motion.button
          whileHover={!busy && !nameError ? { scale: 1.04 } : undefined}
          whileTap={!busy && !nameError ? { scale: 0.96 } : undefined}
          onClick={start}
          disabled={busy || submitting || !!nameError}
          title={busy ? '已有安装任务在进行中' : undefined}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3.5 text-base font-semibold shadow-xl shadow-emerald-500/30 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          开始下载
        </motion.button>
      </div>
    </div>
  )
}

export default InstallSetupPage
