import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, Puzzle, Search } from 'lucide-react'
import type { ModrinthProject } from '../../../shared/types'

function formatDownloads(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`
  if (n >= 1e6) return `${Math.round(n / 1e4)} 万`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`
  return String(n)
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 加载失败时显示占位图标 */
function ProjectIcon({ url }: { url?: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Puzzle className="h-5 w-5 text-white/40" />
      </div>
    )
  }
  return <img src={url} alt="" onError={() => setFailed(true)} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
}

interface ModrinthBrowserProps {
  versionId: string
  /** 安装了新模组后通知外层刷新已安装列表 */
  onInstalled: () => void
}

/** 在 Modrinth 搜索并安装适用于当前版本的模组 */
function ModrinthBrowser({ versionId, onInstalled }: ModrinthBrowserProps): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<ModrinthProject[]>([])
  const [total, setTotal] = useState(0)
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在安装的项目 */
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  /** 只保留最后一次搜索的结果，避免慢的请求覆盖新的结果 */
  const requestId = useRef(0)

  const search = useCallback(
    async (query: string, offset: number) => {
      const id = ++requestId.current
      setLoading(true)
      setError('')
      try {
        const result = await window.api.searchModrinth(versionId, query, offset)
        if (id !== requestId.current) return
        setHits((prev) => (offset === 0 ? result.hits : [...prev, ...result.hits]))
        setTotal(result.total)
        setContext(`${result.minecraftVersion} · ${result.loader}`)
      } catch (e) {
        if (id === requestId.current) setError(cleanError(e))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [versionId]
  )

  // 输入停止 400 毫秒后自动搜索；关键字为空时显示下载量最高的模组
  useEffect(() => {
    const timer = setTimeout(() => search(keyword, 0), keyword ? 400 : 0)
    return () => clearTimeout(timer)
  }, [keyword, search])

  const install = async (project: ModrinthProject): Promise<void> => {
    setInstalling((prev) => new Set(prev).add(project.projectId))
    setError('')
    setNotice('')
    try {
      const result = await window.api.installFromModrinth(versionId, project.projectId)
      const installedIds = new Set([project.projectId, ...result.installed.map((m) => m.projectId)])
      setHits((prev) => prev.map((h) => (installedIds.has(h.projectId) ? { ...h, installed: true } : h)))
      const deps = result.installed.filter((m) => m.dependency).map((m) => m.title)
      let message = `已安装 ${project.title}`
      if (deps.length > 0) message += `，同时安装了前置模组：${deps.join('、')}`
      if (result.missingDependencies.length > 0) {
        message += `。找不到适用的前置模组：${result.missingDependencies.join('、')}，可能无法启动`
      }
      setNotice(message)
      onInstalled()
    } catch (e) {
      setError(`${project.title} 安装失败：${cleanError(e)}`)
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev)
        next.delete(project.projectId)
        return next
      })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
          <Search className="h-4 w-4 text-white/40" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="在 Modrinth 搜索模组（英文名效果更好，例如 sodium）"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
        </div>
        {context && <span className="shrink-0 text-xs text-white/50">适用于 {context}</span>}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {notice && <div className="mt-3 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {!loading && !error && hits.length === 0 && (
          <div className="py-10 text-center text-sm text-white/40">没有找到适用于该版本的模组</div>
        )}
        {hits.map((project) => {
          const busy = installing.has(project.projectId)
          return (
            <div key={project.projectId} className="flex items-center gap-3 rounded-xl bg-black/20 px-4 py-2.5">
              <ProjectIcon url={project.iconUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{project.title}</span>
                  <span className="shrink-0 text-xs text-white/40">by {project.author}</span>
                </div>
                <div className="truncate text-xs text-white/50" title={project.description}>
                  {project.description}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs text-white/40">
                <Download className="h-3.5 w-3.5" />
                {formatDownloads(project.downloads)}
              </span>
              {project.installed ? (
                <span className="flex w-20 shrink-0 items-center justify-center gap-1 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已安装
                </span>
              ) : (
                <button
                  onClick={() => install(project)}
                  disabled={busy}
                  className="flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {busy ? '安装中' : '安装'}
                </button>
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
    </div>
  )
}

export default ModrinthBrowser
