import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Globe,
  Image as ImageIcon,
  Loader2,
  MonitorSmartphone,
  MoreHorizontal,
  PenLine,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Wrench
} from 'lucide-react'
import GrassBlockIcon from '../components/GrassBlockIcon'
import InstallProgressCard from '../components/InstallProgressCard'
import LocalResourcesPage from './LocalResourcesPage'
import ModsPage from './ModsPage'
import VersionSettingsPage from './VersionSettingsPage'
import WorldsPage from './WorldsPage'
import type { InstalledVersion, InstallStatus, ModLoader, ResourceType } from '../../../shared/types'

const LOADER_LABELS: Record<ModLoader, { label: string; className: string }> = {
  fabric: { label: 'Fabric', className: 'bg-amber-500/20 text-amber-300' },
  quilt: { label: 'Quilt', className: 'bg-fuchsia-500/20 text-fuchsia-300' },
  forge: { label: 'Forge', className: 'bg-sky-500/20 text-sky-300' },
  neoforge: { label: 'NeoForge', className: 'bg-rose-500/20 text-rose-300' },
  optifine: { label: 'OptiFine', className: 'bg-violet-500/20 text-violet-300' }
}
const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  release: { label: '正式版', className: 'bg-emerald-500/20 text-emerald-300' },
  snapshot: { label: '快照', className: 'bg-amber-500/20 text-amber-300' },
  old_beta: { label: 'Beta', className: 'bg-fuchsia-500/20 text-fuchsia-300' },
  old_alpha: { label: 'Alpha', className: 'bg-rose-500/20 text-rose-300' }
}
const OTHER_TYPE = { label: '其他', className: 'bg-sky-500/20 text-sky-300' }

/** 可以加载模组的版本才显示「模组」按钮 */
const MOD_LOADERS: ModLoader[] = ['fabric', 'quilt', 'forge', 'neoforge']

type Filter = 'all' | 'vanilla' | 'modded'
const FILTERS: [Filter, string][] = [
  ['all', '全部'],
  ['vanilla', '原版'],
  ['modded', '模组版本']
]

function typeInfo(version: InstalledVersion): { label: string; className: string } {
  if (version.loader) return LOADER_LABELS[version.loader]
  return TYPE_LABELS[version.type] ?? OTHER_TYPE
}

function isModded(version: InstalledVersion): boolean {
  return !!version.loader && MOD_LOADERS.includes(version.loader)
}

function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

/** 「更多」菜单：打开文件夹、检查修复、删除 */
function MoreMenu({
  busy,
  repairing,
  onRename,
  onCopy,
  onShortcut,
  onOpenFolder,
  onRepair,
  onDelete
}: {
  busy: boolean
  repairing: boolean
  onRename: () => void
  onCopy: () => void
  onShortcut: () => void
  onOpenFolder: () => void
  onRepair: () => void
  onDelete: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const item = (
    icon: JSX.Element,
    label: string,
    action: () => void,
    danger = false,
    disabled = false
  ): JSX.Element => (
    <button
      onClick={() => {
        setOpen(false)
        action()
      }}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-red-300 hover:bg-red-500/20' : 'hover:bg-white/10'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="更多操作"
        className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
      >
        {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-white/10 popover-background p-1 shadow-2xl backdrop-blur-xl">
          {item(<PenLine className="h-4 w-4" />, '重命名', onRename, false, busy)}
          {item(<Copy className="h-4 w-4" />, '复制版本', onCopy, false, busy)}
          {item(<MonitorSmartphone className="h-4 w-4" />, '创建桌面快捷方式', onShortcut)}
          <div className="my-1 border-t border-white/10" />
          {item(<FolderOpen className="h-4 w-4" />, '打开版本文件夹', onOpenFolder)}
          {item(<Wrench className="h-4 w-4" />, '检查并修复', onRepair, false, busy)}
          {item(<Trash2 className="h-4 w-4" />, '删除版本', onDelete, true, busy)}
        </div>
      )}
    </div>
  )
}

/** 重命名或复制版本时填写新名字 */
function NameDialog({
  mode,
  version,
  onClose,
  onDone
}: {
  mode: 'rename' | 'copy'
  version: InstalledVersion
  onClose: () => void
  onDone: (message: string) => void
}): JSX.Element {
  const [name, setName] = useState(mode === 'rename' ? version.id : `${version.id} - 副本`)
  const [includeSaves, setIncludeSaves] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rename = mode === 'rename'

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      if (rename) await window.api.renameVersion(version.id, name)
      else await window.api.copyVersion(version.id, name, includeSaves)
      onDone(rename ? `已将 ${version.id} 重命名为 ${name}` : `已复制 ${version.id} 为 ${name}`)
    } catch (e) {
      setError(cleanError(e))
      setBusy(false)
    }
  }

  // 挂到 body 上，覆盖整个窗口
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[28rem] rounded-2xl border border-white/15 popover-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold">{rename ? `重命名 ${version.id}` : `复制 ${version.id}`}</div>
        <label className="mt-4 block">
          <span className="text-xs text-white/60">{rename ? '新的版本名' : '新版本的名称'}</span>
          <input
            value={name}
            autoFocus
            maxLength={64}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-sky-400/70"
          />
        </label>
        {!rename && version.isolated && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeSaves}
              onChange={(e) => setIncludeSaves(e.target.checked)}
              className="accent-emerald-500"
            />
            同时复制存档
          </label>
        )}
        <p className="mt-3 text-xs leading-5 text-white/40">
          {rename
            ? '版本文件夹会一起改名，版本隔离的模组、存档、设置都会保留。'
            : version.isolated
              ? '会复制游戏文件以及版本隔离文件夹里的模组、配置、资源包等（不包括日志和截图）。'
              : '会复制这个版本的游戏文件；存档等放在公共游戏目录里，两个版本共用。'}
        </p>
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || (rename && name === version.id)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {rename ? '重命名' : '复制'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface VersionsPageProps {
  /** 打开页面时直接进入某个版本的版本设置（从主页的齿轮按钮进入） */
  openSettingsFor?: string | null
  onSettingsOpened?: () => void
  /** 跳转到下载页安装新版本 */
  onInstallNew: () => void
  /** 跳转到下载页下载资源包 / 光影包，安装目标为该版本 */
  onDownloadResources: (kind: ResourceType, versionId: string, world?: string) => void
}

/** 已安装版本的管理：选择启动版本、模组、版本设置、打开文件夹、检查修复、删除 */
function VersionsPage({
  openSettingsFor,
  onSettingsOpened,
  onInstallNew,
  onDownloadResources
}: VersionsPageProps): JSX.Element {
  const [installed, setInstalled] = useState<InstalledVersion[] | null>(null)
  const [selected, setSelected] = useState('')
  const [gameDir, setGameDir] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [install, setInstall] = useState<InstallStatus | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在重命名或复制的版本 */
  const [naming, setNaming] = useState<{ mode: 'rename' | 'copy'; version: InstalledVersion } | null>(null)
  const [modsFor, setModsFor] = useState<InstalledVersion | null>(null)
  const [settingsFor, setSettingsFor] = useState<InstalledVersion | null>(null)
  const [resourcesFor, setResourcesFor] = useState<InstalledVersion | null>(null)
  const [worldsFor, setWorldsFor] = useState<InstalledVersion | null>(null)
  const lastState = useRef<string | undefined>(undefined)

  const load = useCallback(async (): Promise<InstalledVersion[]> => {
    const [list, settings] = await Promise.all([window.api.getInstalledVersions(), window.api.getSettings()])
    setInstalled(list)
    setSelected(settings.selectedVersion)
    setGameDir(settings.gameDir)
    return list
  }, [])

  useEffect(() => {
    load()
    window.api.getInstallStatus().then(setInstall)
    return window.api.onInstallStatus(setInstall)
  }, [load])

  // 从主页进入：打开指定版本的版本设置
  useEffect(() => {
    if (!openSettingsFor || !installed) return
    const version = installed.find((v) => v.id === openSettingsFor)
    if (version) {
      setModsFor(null)
      setResourcesFor(null)
      setWorldsFor(null)
      setSettingsFor(version)
    }
    onSettingsOpened?.()
  }, [openSettingsFor, installed, onSettingsOpened])

  // 修复或安装结束后刷新列表
  useEffect(() => {
    if (lastState.current === 'running' && install?.state !== 'running') load()
    lastState.current = install?.state
  }, [install, load])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setActionError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setActionError(cleanError(e))
    }
  }

  const repair = (versionId: string): Promise<void> => run(() => window.api.repairVersion(versionId))
  const remove = (versionId: string): Promise<void> =>
    run(async () => {
      if (await window.api.deleteVersion(versionId)) await load()
    })
  const select = (versionId: string): Promise<void> =>
    run(async () => {
      setSelected((await window.api.updateSettings({ selectedVersion: versionId })).selectedVersion)
    })

  const busy = install?.state === 'running'
  const kw = keyword.trim().toLowerCase()
  const visible = useMemo(
    () =>
      (installed ?? []).filter(
        (v) =>
          (!kw || v.id.toLowerCase().includes(kw) || v.minecraftVersion.toLowerCase().includes(kw)) &&
          (filter === 'all' || (filter === 'modded') === isModded(v))
      ),
    [installed, kw, filter]
  )

  return (
    <>
      {naming && (
        <NameDialog
          mode={naming.mode}
          version={naming.version}
          onClose={() => setNaming(null)}
          onDone={async (message) => {
            setNaming(null)
            await load()
            setNotice(message)
          }}
        />
      )}
      {settingsFor && (
        <div key={settingsFor.id} className="h-full animate-slide-in">
          <VersionSettingsPage version={settingsFor} onBack={() => setSettingsFor(null)} onChanged={load} />
        </div>
      )}
      {worldsFor && (
        <div key={worldsFor.id} className="h-full animate-slide-in">
          <WorldsPage
            version={worldsFor}
            onBack={() => setWorldsFor(null)}
            onDownloadDatapacks={(world) => onDownloadResources('datapack', worldsFor.id, world)}
          />
        </div>
      )}
      {resourcesFor && (
        <div key={resourcesFor.id} className="h-full animate-slide-in">
          <LocalResourcesPage
            version={resourcesFor}
            onBack={() => setResourcesFor(null)}
            onDownloadMore={(kind) => onDownloadResources(kind, resourcesFor.id)}
          />
        </div>
      )}
      {modsFor && (
        <div key={modsFor.id} className="h-full animate-slide-in">
          <ModsPage version={modsFor} onBack={() => setModsFor(null)} />
        </div>
      )}
      <div
        className={`flex h-full flex-col gap-5 ${settingsFor || modsFor || resourcesFor || worldsFor ? 'hidden' : ''}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">版本</h1>
            <p className="mt-1 truncate text-xs text-white/50" title={gameDir}>
              已安装 {installed?.length ?? 0} 个版本 · 游戏目录：{gameDir}
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              onClick={() => window.api.openGameDir()}
              title="在文件管理器中打开游戏目录"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <HardDrive className="h-4 w-4" />
              游戏目录
            </button>
            <button
              onClick={() => run(load)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button
              onClick={onInstallNew}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium shadow-lg shadow-emerald-500/20"
            >
              <Download className="h-4 w-4" />
              安装新版本
            </button>
          </div>
        </div>

        {/* 检查修复的进度 */}
        <AnimatePresence>
          {install && (
            <InstallProgressCard
              status={install}
              onCancel={() => window.api.cancelInstall()}
              onRetry={() =>
                install.kind === 'repair' ? repair(install.versionId) : run(() => window.api.retryInstall())
              }
              onDismiss={() => setInstall(null)}
            />
          )}
        </AnimatePresence>
        {notice && (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{notice}</span>
          </div>
        )}
        {actionError && (
          <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{actionError}</span>
          </div>
        )}

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl bg-black/20 p-1">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                    filter === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-white/40" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索版本名或 Minecraft 版本"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
              />
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {installed === null && (
              <div className="flex justify-center py-10 text-white/50">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {installed?.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-sm text-white/50">
                还没有安装任何版本
                <button
                  onClick={onInstallNew}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white hover:bg-white/20"
                >
                  <Download className="h-4 w-4" />
                  去下载
                </button>
              </div>
            )}
            {installed && installed.length > 0 && visible.length === 0 && (
              <div className="py-10 text-center text-sm text-white/40">没有匹配的版本</div>
            )}
            {visible.map((version) => {
              const info = typeInfo(version)
              const current = version.id === selected
              const repairing = busy && install?.versionId === version.id
              const actionClass =
                'flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20'
              return (
                <div
                  key={version.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    current
                      ? 'border-emerald-400/40 bg-emerald-500/10'
                      : 'border-transparent bg-black/20 hover:bg-black/30'
                  }`}
                >
                  {/* 点击图标或名称设为启动版本 */}
                  <button
                    onClick={() => !current && select(version.id)}
                    title={current ? '主页的「启动游戏」会启动这个版本' : '点击设为启动版本'}
                    className={`group flex min-w-0 flex-1 items-center gap-3 text-left ${current ? 'cursor-default' : ''}`}
                  >
                    <GrassBlockIcon className="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{version.id}</span>
                        {current ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            启动版本
                          </span>
                        ) : (
                          <span className="hidden shrink-0 items-center gap-1 text-xs text-white/50 group-hover:flex">
                            <CircleDot className="h-3.5 w-3.5" />
                            设为启动版本
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs">
                        <span className={`shrink-0 rounded-md px-2 py-0.5 ${info.className}`}>{info.label}</span>
                        <span className="shrink-0 text-white/50">{version.minecraftVersion}</span>
                        {version.isolated && (
                          <span
                            title="模组、存档、配置放在该版本自己的文件夹里"
                            className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-white/60"
                          >
                            隔离
                          </span>
                        )}
                        {version.customized && (
                          <span
                            title="该版本有自己的设置（内存、Java 等）"
                            className="shrink-0 rounded-md bg-sky-500/15 px-2 py-0.5 text-sky-300"
                          >
                            独立设置
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  {isModded(version) && (
                    <button onClick={() => setModsFor(version)} title="管理该版本的模组" className={actionClass}>
                      <Puzzle className="h-3.5 w-3.5" />
                      模组
                    </button>
                  )}
                  <button
                    onClick={() => setWorldsFor(version)}
                    title="管理该版本的存档与数据包"
                    className={actionClass}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    存档
                  </button>
                  <button
                    onClick={() => setResourcesFor(version)}
                    title="管理该版本的资源包和光影包"
                    className={actionClass}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    资源
                  </button>
                  <button
                    onClick={() => setSettingsFor(version)}
                    title="版本设置：单独设置内存、Java、窗口大小等"
                    className={actionClass}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    设置
                  </button>
                  <MoreMenu
                    busy={busy}
                    repairing={repairing}
                    onRename={() => setNaming({ mode: 'rename', version })}
                    onCopy={() => setNaming({ mode: 'copy', version })}
                    onShortcut={() =>
                      run(async () => {
                        const path = await window.api.createDesktopShortcut(version.id)
                        setNotice(`已在桌面创建快捷方式：${path.split(/[\\/]/).pop()}，双击即可直接启动 ${version.id}`)
                      })
                    }
                    onOpenFolder={() => window.api.openVersionDir(version.id)}
                    onRepair={() => repair(version.id)}
                    onDelete={() => remove(version.id)}
                  />
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </>
  )
}

export default VersionsPage
