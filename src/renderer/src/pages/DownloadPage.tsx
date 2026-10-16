import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Download, Loader2, RefreshCw, Search, Sparkles, FlaskConical } from 'lucide-react'
import InstallProgressCard from '../components/InstallProgressCard'
import type { InstallStatus, VersionEntry, VersionManifest, VersionType } from '../../../shared/types'

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
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('zh-CN')
}

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

function DownloadPage(): JSX.Element {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('release')
  const [keyword, setKeyword] = useState('')
  const [install, setInstall] = useState<InstallStatus | null>(null)
  const [installError, setInstallError] = useState('')

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
    // 进入页面时获取当前安装状态，并订阅主进程推送的实时进度
    window.api.getInstallStatus().then(setInstall)
    return window.api.onInstallStatus(setInstall)
  }, [])

  const startInstall = async (versionId: string): Promise<void> => {
    setInstallError('')
    try {
      await window.api.startInstall(versionId)
    } catch (e) {
      setInstallError(cleanError(e))
    }
  }

  const visible = useMemo(() => {
    if (!manifest) return []
    const kw = keyword.trim().toLowerCase()
    return manifest.versions.filter((v) => matchFilter(v, filter) && (!kw || v.id.toLowerCase().includes(kw)))
  }, [manifest, filter, keyword])

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">下载游戏</h1>
          <p className="mt-1 text-xs text-white/50">
            {manifest ? `当前下载源：${SOURCE_LABELS[manifest.source]} · 共 ${manifest.versions.length} 个版本` : '正在获取版本列表'}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </motion.button>
      </div>

      {/* 安装进度 */}
      <AnimatePresence>
        {install && (
          <InstallProgressCard
            status={install}
            onCancel={() => window.api.cancelInstall()}
            onRetry={() => startInstall(install.versionId)}
            onDismiss={() => setInstall(null)}
          />
        )}
      </AnimatePresence>
      {installError && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{installError}</span>
        </div>
      )}

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
          <div className="flex rounded-xl bg-black/20 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`relative rounded-lg px-4 py-1.5 text-sm transition-colors ${
                  filter === f.key ? 'text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {filter === f.key && (
                  <motion.div
                    layoutId="version-filter"
                    className="absolute inset-0 rounded-lg bg-white/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
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
          {manifest && visible.length === 0 && (
            <div className="py-10 text-center text-sm text-white/40">没有匹配的版本</div>
          )}
          <div className="flex flex-col gap-1.5">
            {visible.map((version) => {
              const typeInfo = TYPE_LABELS[version.type] ?? TYPE_LABELS.release
              return (
                <div
                  key={version.id}
                  className="group flex items-center gap-4 rounded-xl bg-black/20 px-4 py-2.5 transition-colors hover:bg-black/30"
                >
                  <span className="w-40 truncate font-mono text-sm font-semibold">{version.id}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs ${typeInfo.className}`}>{typeInfo.label}</span>
                  <span className="flex-1 text-xs text-white/40">{formatDate(version.releaseTime)}</span>
                  <button
                    onClick={() => startInstall(version.id)}
                    disabled={install?.state === 'running'}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium opacity-0 transition-opacity hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 group-hover:opacity-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    安装
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

export default DownloadPage
