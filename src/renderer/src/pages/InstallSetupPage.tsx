import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Download, Loader2, X } from 'lucide-react'
import GrassBlockIcon from '../components/GrassBlockIcon'
import type { FabricLoaderVersion, ForgeVersionInfo, VersionEntry } from '../../../shared/types'

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
function LoaderRow({ title, status, highlight, disabled, expanded, onToggle, onClear, children }: LoaderRowProps): JSX.Element {
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

/** 安装设置页：自定义版本名，并选择要附加的模组加载器 */
function InstallSetupPage({ version, installedIds, busy, onBack, onStarted }: InstallSetupPageProps): JSX.Element {
  const mc = version.id
  const [name, setName] = useState(mc)
  const [nameEdited, setNameEdited] = useState(false)
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderVersion[] | null>(null)
  const [fabric, setFabric] = useState<string | null>(null)
  const [showUnstable, setShowUnstable] = useState(false)
  const [forgeVersions, setForgeVersions] = useState<ForgeVersionInfo[] | null>(null)
  const [forgeError, setForgeError] = useState('')
  const [forge, setForge] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<'fabric' | 'forge' | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.api
      .getFabricLoaders(mc)
      .then(setFabricLoaders)
      .catch(() => setFabricLoaders([]))
    window.api
      .getForgeVersions(mc)
      .then(setForgeVersions)
      .catch((e) => {
        setForgeVersions([])
        setForgeError(cleanError(e))
      })
  }, [mc])

  // Fabric 与 Forge 只能二选一
  const chooseFabric = (version: string | null): void => {
    setFabric(version)
    if (version) setForge(null)
  }
  const chooseForge = (version: string | null): void => {
    setForge(version)
    if (version) setFabric(null)
  }

  // 用户没有手动改过版本名时，名字跟随所选的加载器自动变化
  useEffect(() => {
    if (nameEdited) return
    if (forge) setName(`${mc}-Forge ${forge}`)
    else if (fabric) setName(`${mc}-Fabric ${fabric}`)
    else setName(mc)
  }, [fabric, forge, mc, nameEdited])

  const nameError = validateName(name, mc, !!fabric || !!forge, installedIds)

  const fabricStatus =
    fabricLoaders === null
      ? '正在获取…'
      : fabricLoaders.length === 0
        ? '无'
        : fabric
          ? fabric
          : forge
            ? '与 Forge 不兼容'
            : '可以添加'

  const forgeStatus =
    forgeVersions === null
      ? '正在获取…'
      : forgeVersions.length === 0
        ? forgeError
          ? '获取失败'
          : '无'
        : forge
          ? forge
          : fabric
            ? '与 Fabric 不兼容'
            : '可以添加'

  const start = async (): Promise<void> => {
    setSubmitting(true)
    setError('')
    try {
      await window.api.startInstall({
        minecraftVersion: mc,
        name,
        fabricLoader: fabric ?? undefined,
        forgeVersion: forge ?? undefined
      })
      onStarted()
    } catch (e) {
      setError(cleanError(e))
      setSubmitting(false)
    }
  }

  const visibleLoaders = (fabricLoaders ?? []).filter((l) => showUnstable || l.stable)

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-24 pr-1">
        {/* 顶部：返回、图标、版本名 */}
        <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              title="返回版本列表"
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <GrassBlockIcon className="h-12 w-12 shrink-0" />
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameEdited(true)
              }}
              maxLength={64}
              spellCheck={false}
              className={`min-w-0 flex-1 rounded-lg border bg-black/10 px-4 py-2.5 text-lg outline-none transition-colors focus:bg-black/20 ${
                nameError ? 'border-red-400/60' : 'border-white/15 focus:border-sky-400/70'
              }`}
            />
          </div>
          {nameError && <p className="ml-[7.5rem] mt-2 text-xs text-red-300">{nameError}</p>}
        </div>

        <div className="h-2" />

        {/* 模组加载器 */}
        <LoaderRow
          title="Forge"
          status={forgeStatus}
          highlight={!!forge}
          disabled={!forgeVersions || forgeVersions.length === 0}
          expanded={expanded === 'forge'}
          onToggle={() => setExpanded((e) => (e === 'forge' ? null : 'forge'))}
          onClear={forge ? () => chooseForge(null) : undefined}
        >
          <div className="max-h-56 overflow-y-auto">
            {(forgeVersions ?? []).map((item) => (
              <button
                key={item.version}
                onClick={() => {
                  chooseForge(item.version)
                  setExpanded(null)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm ${
                  forge === item.version ? 'bg-emerald-500/15' : 'hover:bg-white/10'
                }`}
              >
                <span className="font-mono">{item.version}</span>
                {item.recommended && (
                  <span className="rounded bg-emerald-500/20 px-1.5 text-xs text-emerald-300">推荐</span>
                )}
                {item.latest && <span className="rounded bg-sky-500/20 px-1.5 text-xs text-sky-300">最新</span>}
                <span className="flex-1 text-right text-xs text-white/40">
                  {item.date ? new Date(item.date).toLocaleDateString('zh-CN') : ''}
                </span>
                {forge === item.version && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            ))}
          </div>
        </LoaderRow>
        <LoaderRow title="NeoForge" status="即将支持" disabled />
        <LoaderRow
          title="Fabric"
          status={fabricStatus}
          highlight={!!fabric}
          disabled={!fabricLoaders || fabricLoaders.length === 0}
          expanded={expanded === 'fabric'}
          onToggle={() => setExpanded((e) => (e === 'fabric' ? null : 'fabric'))}
          onClear={fabric ? () => chooseFabric(null) : undefined}
        >
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
          <div className="max-h-56 overflow-y-auto">
            {visibleLoaders.map((loader) => (
              <button
                key={loader.version}
                onClick={() => {
                  chooseFabric(loader.version)
                  setExpanded(null)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm ${
                  fabric === loader.version ? 'bg-emerald-500/15' : 'hover:bg-white/10'
                }`}
              >
                <span className="flex-1 font-mono">{loader.version}</span>
                {!loader.stable && <span className="rounded bg-amber-500/20 px-1.5 text-xs text-amber-300">测试版</span>}
                {fabric === loader.version && <Check className="h-4 w-4 text-emerald-400" />}
              </button>
            ))}
          </div>
        </LoaderRow>
        <LoaderRow title="OptiFine" status="即将支持" disabled />

        {forge && (
          <p className="px-2 text-xs leading-5 text-white/45">
            安装 Forge 时需要用 Java 运行 Forge 安装程序，会比普通安装多花几分钟。模组放入游戏目录下的 mods 文件夹即可。
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
