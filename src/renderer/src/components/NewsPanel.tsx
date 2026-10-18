import { useEffect, useState } from 'react'
import { EyeOff, Loader2, Newspaper, RefreshCw } from 'lucide-react'
import type { NewsList } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function formatDate(date: string): string {
  const time = Date.parse(date)
  return Number.isNaN(time) ? date : new Date(time).toLocaleDateString('zh-CN')
}

/** 主页的 Minecraft 官方新闻：横向滚动的卡片，点击在浏览器中打开全文 */
function NewsPanel({ onHide }: { onHide: () => void }): JSX.Element {
  const [news, setNews] = useState<NewsList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (force = false): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setNews(await window.api.getNews(force))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-sky-300" />
        <h2 className="text-sm font-semibold">Minecraft 新闻</h2>
        {news?.offline && <span className="text-xs text-white/40">（无法连接，显示的是上次获取的新闻）</span>}
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="刷新"
          className="ml-auto rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={onHide}
          title="不再显示新闻（可以在「设置 → 个性化」中重新打开）"
          className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>

      {!news && loading && (
        <div className="flex items-center gap-2 py-6 text-xs text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在获取新闻…
        </div>
      )}
      {error && !news && <div className="py-4 text-xs text-white/40">{error}</div>}
      {news && news.items.length === 0 && <div className="py-4 text-xs text-white/40">暂时没有新闻</div>}
      {news && news.items.length > 0 && (
        <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
          {news.items.map((item) => {
            const content = (
              <>
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/30">
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-medium leading-snug" title={item.title}>
                  {item.title}
                </div>
                <div className="mt-1 truncate text-xs text-white/40">
                  {[formatDate(item.date), /java edition/i.test(item.tag) ? '' : item.tag].filter(Boolean).join(' · ')}
                </div>
              </>
            )
            const className =
              'group w-52 shrink-0 rounded-xl bg-black/20 p-2 text-left transition-colors hover:bg-black/30'
            return item.link ? (
              <a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                title={item.text || item.title}
                className={className}
              >
                {content}
              </a>
            ) : (
              <div key={item.id} title={item.text || item.title} className={className}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default NewsPanel
