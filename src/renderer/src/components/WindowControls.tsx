import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'

/** 窗口右上角的最小化、最大化 / 还原、关闭按钮（Windows、Linux 不使用系统标题栏） */
function WindowControls({ className = '' }: { className?: string }): JSX.Element | null {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.api.customTitleBar) return
    window.api
      .isWindowMaximized()
      .then(setMaximized)
      .catch(() => undefined)
    return window.api.onWindowMaximized(setMaximized)
  }, [])

  if (!window.api.customTitleBar) return null
  const button = 'flex h-8 w-11 items-center justify-center text-white/70 transition-colors'
  return (
    <div className={`titlebar-no-drag flex ${className}`}>
      <button
        onClick={() => window.api.windowControl('minimize')}
        title="最小化"
        aria-label="最小化"
        className={`${button} hover:bg-white/10 hover:text-white`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.api.windowControl('maximize')}
        title={maximized ? '还原' : '最大化'}
        aria-label={maximized ? '还原' : '最大化'}
        className={`${button} hover:bg-white/10 hover:text-white`}
      >
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => window.api.windowControl('close')}
        title="关闭"
        aria-label="关闭"
        className={`${button} window-close hover:bg-red-600 hover:text-[#fff]`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default WindowControls
