import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronDown, Download, Loader2, Package, Search } from 'lucide-react'
import type { ModpackInfo, ModrinthModpack, ModrinthModpackVersion } from '../../../shared/types'

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }
const TYPE_LABELS = { release: '', beta: '测试版', alpha: '早期测试版' }

function formatDownloads(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`
  if (n >= 1e6) return `${Math.round(n / 1e4)} 万`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`
  return String(n)
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function ProjectIcon({ url }: { url?: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Package className="h-6 w-6 text-white/40" />
      </div>
    )
  }
  return <img src={url} alt="" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
}

interface ModpackBrowserPageProps {
  onBack: () => void
  /** 整合包下载并读取完成，进入安装确认页 */
  onPicked: (info: ModpackInfo) => void
}

/** 在 Modrinth 搜索整合包，选择版本后下载 */
function ModpackBrowserPage({ onBack, onPicked }: ModpackBrowserPageProps): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<ModrinthModpack[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** 展开查看版本的整合包 */
  const [expanded, setExpanded] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, ModrinthModpackVersion[] | 'loading'>>({})
  const [showUnstable, setShowUnstable] = useState(false)
  /** 正在下载的版本 */
  const [downloading, setDownloading] = useState<string | null>(null)
  const requestId = useRef(0)

  const search = useCallback(async (query: string, offset: number) => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const result = await window.api.searchModpacks(query, offset)
      if (id !== requestId.current) return
      setHits((prev) => (offset === 0 ? result.hits : [...prev, ...result.hits]))
      setTotal(result.total)
    } catch (e) {
      if (id === requestId.current) setError(cleanError(e))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(keyword, 0), keyword ? 400 : 0)
    return () => clearTimeout(timer)
  }, [keyword, search])

  const toggle = async (projectId: string): Promise<void> => {
    if (expanded === projectId) {
      setExpanded(null)
      return
    }
    setExpanded(projectId)
    if (versions[projectId]) return
    setVersions((prev) => ({ ...prev, [projectId]: 'loading' }))
    try {
      const list = await window.api.getModpackVersions(projectId)
      setVersions((prev) => ({ ...prev, [projectId]: list }))
    } catch (e) {
      setVersions((prev) => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
      setExpanded(null)
      setError(cleanError(e))
    }
  }

  const install = async (version: ModrinthModpackVersion): Promise<void> => {
    setDownloading(version.id)
    setError('')
    try {
      onPicked(await window.api.downloadModpack(version.id))
    } catch (e) {
      setError(`下载整合包失败：${cleanError(e)}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          title="返回版本列表"
          className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">下载整合包</h1>
          <p className="text-xs text-white/50">来自 Modrinth，选择版本后自动下载并进入安装</p>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索整合包（英文名效果更好，例如 Fabulously Optimized）"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-white/50">
            <input
              type="checkbox"
              checked={showUnstable}
              onChange={(e) => setShowUnstable(e.target.checked)}
              className="accent-emerald-500"
            />
            显示测试版
          </label>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {!loading && !error && hits.length === 0 && (
            <div className="py-10 text-center text-sm text-white/40">没有找到整合包</div>
          )}
          {hits.map((pack) => {
            const open = expanded === pack.projectId
            const list = versions[pack.projectId]
            const visible = Array.isArray(list)
              ? list.filter((v) => showUnstable || v.versionType === 'release').slice(0, 15)
              : []
            return (
              <div key={pack.projectId} className="overflow-hidden rounded-xl bg-black/20">
                <button
                  onClick={() => toggle(pack.projectId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <ProjectIcon url={pack.iconUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{pack.title}</span>
                      <span className="shrink-0 text-xs text-white/40">by {pack.author}</span>
                    </div>
                    <div className="truncate text-xs text-white/50" title={pack.description}>
                      {pack.description}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {pack.latestGameVersion && (
                        <span className="rounded bg-white/10 px-1.5 text-xs text-white/60">
                          {pack.latestGameVersion}
                        </span>
                      )}
                      {pack.loaders.map((l) => (
                        <span key={l} className="rounded bg-emerald-500/15 px-1.5 text-xs text-emerald-300">
                          {LOADER_NAMES[l] ?? l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-white/40">
                    <Download className="h-3.5 w-3.5" />
                    {formatDownloads(pack.downloads)}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>

                {open && (
                  <div className="border-t border-white/10 p-2">
                    {list === 'loading' && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/50">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在获取版本列表…
                      </div>
                    )}
                    {Array.isArray(list) && visible.length === 0 && (
                      <div className="px-3 py-2 text-xs text-white/40">
                        {list.length === 0 ? '这个整合包没有可下载的版本' : '只有测试版，勾选「显示测试版」查看'}
                      </div>
                    )}
                    {visible.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="truncate font-medium">{v.versionNumber}</span>
                            {TYPE_LABELS[v.versionType] && (
                              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 text-xs text-amber-300">
                                {TYPE_LABELS[v.versionType]}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-white/40">
                            Minecraft {v.gameVersions.join(' / ')} ·{' '}
                            {v.loaders.map((l) => LOADER_NAMES[l] ?? l).join(' / ')} · {formatSize(v.fileSize)} ·{' '}
                            {new Date(v.datePublished).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                        <button
                          onClick={() => install(v)}
                          disabled={downloading !== null}
                          className="flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {downloading === v.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {downloading === v.id ? '下载中' : '安装'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {hits.length > 0 && hits.length < total && (
            <button
              onClick={() => search(keyword, hits.length)}
              disabled={loading}
              className="w-full rounded-xl py-2.5 text-sm text-white/60 hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? '加载中…' : `加载更多（${hits.length} / ${total}）`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

export default ModpackBrowserPage
