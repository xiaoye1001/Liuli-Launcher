import { useEffect, useState } from 'react'
import { Download, PartyPopper, X } from 'lucide-react'
import type { GameReleaseNews } from '../../../shared/types'

/** 主页的「Minecraft 新版本发布了」提醒：一键去安装，或者「知道了」 */
function GameReleaseBanner({ onInstall }: { onInstall?: (versionId: string) => void }): JSX.Element | null {
  const [news, setNews] = useState<GameReleaseNews | null>(null)

  useEffect(() => {
    window.api
      .getGameReleaseNews()
      .then(setNews)
      .catch(() => setNews(null))
    return window.api.onGameReleaseNews(setNews)
  }, [])

  if (!news) return null
  const dismiss = (): void => {
    setNews(null)
    void window.api.dismissGameReleaseNews().catch(() => undefined)
  }
  return (
    <div
      data-testid="game-release"
      className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-sm"
    >
      <PartyPopper className="h-4 w-4 shrink-0 text-emerald-300" />
      <span className="min-w-0 flex-1 truncate">
        Minecraft <b>{news.id}</b> {news.type === 'release' ? '正式版' : '快照'}发布了！
      </span>
      {onInstall && (
        <button
          onClick={() => {
            onInstall(news.id)
            dismiss()
          }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
        >
          <Download className="h-3.5 w-3.5" />
          去安装
        </button>
      )}
      <button
        onClick={dismiss}
        title="知道了"
        aria-label="关闭新版本提醒"
        className="shrink-0 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default GameReleaseBanner
