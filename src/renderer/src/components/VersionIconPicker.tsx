import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Pencil, RotateCcw } from 'lucide-react'
import VersionIcon, { ICON_PRESET_KEYS, ICON_PRESETS } from './VersionIcon'
import type { InstalledVersion, VersionDisplay } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const POPOVER_WIDTH = 296

/** 版本图标：点击后选择内置图标、自定义图片或恢复默认 */
function VersionIconPicker({
  version,
  className = 'h-9 w-9',
  onChanged,
  onError
}: {
  version: InstalledVersion
  className?: string
  onChanged: (display: VersionDisplay) => void
  onError: (message: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // 弹出框放在图标下方，下方放不下时放到上方
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const height = popoverRef.current?.offsetHeight ?? 220
    const below = rect.bottom + 6
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)
    setPosition({ left, top })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = async (action: () => Promise<VersionDisplay | null>): Promise<void> => {
    setBusy(true)
    try {
      const display = await action()
      if (display) {
        onChanged(display)
        setOpen(false)
      }
    } catch (e) {
      onError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const current = version.icon ?? ''
  const optionClass = (active: boolean): string =>
    `flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
      active ? 'bg-emerald-500/25 ring-1 ring-emerald-400/60' : 'hover:bg-white/10'
    }`

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        title="更换图标"
        aria-label={`更换 ${version.id} 的图标`}
        className="group/icon relative shrink-0 rounded-lg"
      >
        <VersionIcon icon={version.icon} iconUrl={version.iconUrl} className={className} />
        <span className="absolute -bottom-1 -right-1 hidden rounded-full bg-black/60 p-0.5 group-hover/icon:block">
          <Pencil className="h-2.5 w-2.5 text-white" />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width: POPOVER_WIDTH }}
            className="fixed z-50 rounded-xl border border-white/10 popover-background p-2 text-sm text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="px-1 pb-1.5 text-xs text-white/50">{version.id} 的图标</div>
            <div className="grid grid-cols-6 gap-1">
              <button
                onClick={() => apply(() => window.api.setVersionIcon(version.id, null))}
                disabled={busy}
                title="草方块（默认）"
                className={optionClass(current === '')}
              >
                <VersionIcon className="h-8 w-8" />
              </button>
              {ICON_PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => apply(() => window.api.setVersionIcon(version.id, key))}
                  disabled={busy}
                  title={ICON_PRESETS[key].label}
                  className={optionClass(current === key)}
                >
                  <VersionIcon icon={key} className="h-8 w-8" />
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1 border-t border-white/10 pt-2">
              <button
                onClick={() => apply(() => window.api.pickVersionIcon(version.id))}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                使用图片…
              </button>
              {current && (
                <button
                  onClick={() => apply(() => window.api.setVersionIcon(version.id, null))}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export default VersionIconPicker
