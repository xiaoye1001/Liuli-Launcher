import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, PackagePlus } from 'lucide-react'
import type { ModpackInfo } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface DropOverlayProps {
  /** 拖入的整合包读取成功 */
  onModpack: (info: ModpackInfo) => void
}

/**
 * 全窗口拖放：把整合包（.mrpack / .zip）拖进启动器任意位置即可导入。
 * 同时阻止浏览器默认的「打开拖入的文件」行为。
 */
function DropOverlay({ onModpack }: DropOverlayProps): JSX.Element | null {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** dragenter / dragleave 会在子元素之间反复触发，用计数判断是否真的离开窗口 */
  const depth = useRef(0)
  const onModpackRef = useRef(onModpack)
  onModpackRef.current = onModpack

  useEffect(() => {
    // 从文件管理器拖入时类型里有 Files；部分程序拖出的文件在拖动过程中类型为空，也按文件处理。
    // 只有页面内部的拖动（文字、图片等，类型为 text/plain 之类）才忽略
    const hasFiles = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types ?? []
      return types.includes('Files') || types.length === 0
    }
    let errorTimer: ReturnType<typeof setTimeout> | undefined

    const showError = (message: string): void => {
      setError(message)
      clearTimeout(errorTimer)
      errorTimer = setTimeout(() => setError(''), 4000)
    }

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth.current += 1
      setDragging(true)
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onOver = (e: DragEvent): void => {
      // 始终允许放下（否则浏览器不会触发 drop），放下后再检查是不是整合包
      e.preventDefault()
      if (e.dataTransfer && hasFiles(e)) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (!file) {
        showError('没有读取到文件，请从文件管理器中把整合包拖进来')
        return
      }
      if (!/\.(mrpack|zip)$/i.test(file.name)) {
        showError('只支持拖入整合包（.mrpack 或 .zip 文件）')
        return
      }
      const path = window.api.getPathForFile(file)
      if (!path) {
        showError('无法获取文件位置，请改用「导入整合包」按钮选择文件')
        return
      }
      setLoading(true)
      try {
        onModpackRef.current(await window.api.loadModpackFile(path))
      } catch (err) {
        showError(cleanError(err))
      } finally {
        setLoading(false)
      }
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      clearTimeout(errorTimer)
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!dragging && !loading && !error) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {(dragging || loading) && (
        <div className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-emerald-400/70 bg-black/60 backdrop-blur-sm">
          {loading ? (
            <Loader2 className="h-12 w-12 animate-spin text-emerald-300" />
          ) : (
            <PackagePlus className="h-12 w-12 text-emerald-300" />
          )}
          <div className="text-lg font-semibold">{loading ? '正在读取整合包…' : '松开以导入整合包'}</div>
          {!loading && (
            <div className="text-sm text-white/60">
              支持 Modrinth（.mrpack）、CurseForge、MultiMC / Prism、MCBBS 整合包（.zip）
            </div>
          )}
        </div>
      )}
      {error && !dragging && !loading && (
        <div className="absolute bottom-8 flex items-center gap-2 rounded-xl bg-red-500/90 px-4 py-3 text-sm text-[#fff] shadow-xl">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}

export default DropOverlay
