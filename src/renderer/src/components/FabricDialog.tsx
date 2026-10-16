import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Layers, Loader2, X } from 'lucide-react'
import type { FabricLoaderVersion } from '../../../shared/types'

interface FabricDialogProps {
  /** 要安装 Fabric 的 Minecraft 版本 */
  minecraftVersion: string
  onClose: () => void
  /** 用户确认安装，返回 Promise 以便显示错误 */
  onInstall: (loaderVersion: string) => Promise<void>
}

/** 去掉 Electron IPC 错误前缀，只保留真正的错误信息 */
function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

/** 选择 Fabric 加载器版本的弹窗 */
function FabricDialog({ minecraftVersion, onClose, onInstall }: FabricDialogProps): JSX.Element {
  const [loaders, setLoaders] = useState<FabricLoaderVersion[] | null>(null)
  const [selected, setSelected] = useState('')
  const [showUnstable, setShowUnstable] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.api
      .getFabricLoaders(minecraftVersion)
      .then((list) => {
        setLoaders(list)
        // 默认选择最新的稳定版
        setSelected((list.find((l) => l.stable) ?? list[0])?.version ?? '')
      })
      .catch((e) => {
        setLoaders([])
        setError(`获取 Fabric 版本失败：${cleanError(e)}`)
      })
  }, [minecraftVersion])

  // 按 Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible = (loaders ?? []).filter((l) => showUnstable || l.stable)

  const submit = async (): Promise<void> => {
    setSubmitting(true)
    setError('')
    try {
      await onInstall(selected)
    } catch (e) {
      setError(cleanError(e))
      setSubmitting(false)
    }
  }

  // 通过 Portal 渲染到 body，避免被页面切换动画的 transform 影响定位
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-8 text-white backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="popover-background flex max-h-full w-[440px] flex-col rounded-2xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
            <Layers className="h-5 w-5 text-amber-300" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">安装 Fabric</h2>
            <p className="text-xs text-white/50">Minecraft {minecraftVersion}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-white/50">
          <span>选择加载器版本</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showUnstable}
              onChange={(e) => setShowUnstable(e.target.checked)}
              className="accent-emerald-500"
            />
            显示测试版
          </label>
        </div>

        <div className="mt-2 min-h-[120px] flex-1 overflow-y-auto rounded-xl bg-black/20 p-1">
          {loaders === null && (
            <div className="flex h-28 items-center justify-center text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {loaders !== null && visible.length === 0 && !error && (
            <div className="flex h-28 items-center justify-center text-sm text-white/40">该版本暂不支持 Fabric</div>
          )}
          {visible.map((loader) => (
            <button
              key={loader.version}
              onClick={() => setSelected(loader.version)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                selected === loader.version ? 'bg-emerald-500/15' : 'hover:bg-white/10'
              }`}
            >
              <span className="flex-1 font-mono">{loader.version}</span>
              {!loader.stable && <span className="rounded bg-amber-500/20 px-1.5 text-xs text-amber-300">测试版</span>}
              {selected === loader.version && <Check className="h-4 w-4 text-emerald-400" />}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-white/40">
          将安装为新版本「{minecraftVersion}-fabric{selected || '…'}」，如果原版 {minecraftVersion} 尚未安装会一并下载。
          模组放入游戏目录下的 mods 文件夹即可。
        </p>

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!selected || submitting}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            开始安装
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export default FabricDialog
