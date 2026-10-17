import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Download, ExternalLink, Sparkles, X } from 'lucide-react'
import type { UpdateInfo } from '../../../shared/types'

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

/** 更新说明：去掉 Markdown 标记后按原样显示（只保留到「下载」说明之前，后面是通用的下载方法） */
export function ReleaseNotes({ notes }: { notes: string }): JSX.Element {
  const text = notes
    .split(/\n## 下载/)[0]
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
  return (
    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/20 px-3 py-2 text-xs leading-5 text-white/70">
      {text || '这个版本没有填写更新说明，可以在发布页面查看。'}
    </div>
  )
}

/** 下载按钮的说明文字 */
export function downloadLabel(info: UpdateInfo): string {
  return info.assetName ? `下载 ${info.assetName}（${formatSize(info.assetSize)}）` : '打开下载页面'
}

/** 启动后自动检查更新，发现新版本时在右下角提示 */
function UpdateNotice(): JSX.Element {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // 等启动器加载完再检查，不影响启动速度；检查失败不提示
    const timer = setTimeout(async () => {
      try {
        const settings = await window.api.getSettings()
        if (!settings.autoCheckUpdate) return
        const result = await window.api.checkUpdate()
        if (result.hasUpdate && result.latest !== settings.skippedVersion) setInfo(result)
      } catch {
        // 没有网络等情况，下次启动再检查
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-5 right-5 z-40 w-96 rounded-2xl border border-white/15 popover-background p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
              <Sparkles className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">发现新版本 v{info.latest}</div>
              <div className="text-xs text-white/50">当前版本 v{info.current}</div>
            </div>
            <button
              onClick={() => setInfo(null)}
              title="稍后提醒（下次启动时再提示）"
              className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            更新内容
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="mt-2">
              <ReleaseNotes notes={info.notes} />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => window.api.openUpdateLink('asset')}
              title={downloadLabel(info)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              下载新版本
            </button>
            <button
              onClick={() => window.api.openUpdateLink('page')}
              title="打开 GitHub 发布页面"
              className="rounded-lg border border-white/10 bg-white/10 p-2 hover:bg-white/20"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={async () => {
                await window.api.updateSettings({ skippedVersion: info.latest })
                setInfo(null)
              }}
              className="rounded-lg px-2 py-2 text-xs text-white/50 hover:bg-white/10 hover:text-white"
            >
              忽略此版本
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default UpdateNotice
