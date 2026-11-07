import { useEffect, useRef, useState } from 'react'
import { ExternalLink, EyeOff, Puzzle } from 'lucide-react'
import type { PluginInfo } from '../../../shared/types'
import { PLUGIN_WIDGET_HEIGHT } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/**
 * 显示一个插件：插件页面在 sandbox 的 iframe 里（独立的空白来源，碰不到启动器的页面和 window.api），
 * 只能用 postMessage 调用启动器提供的接口：
 *   发：{ liuli: 1, id, method, params }    收：{ liuli: 1, id, result } 或 { liuli: 1, id, error }
 *   事件：{ liuli: 1, event: 'game.status', data }（有 game 权限时）
 * 界面相关的 ui.resize（设置高度）、ui.toast（显示一句提示）在这里直接处理
 *
 * widget：显示插件的主页小组件（manifest 里的 widget 页面），高度限制在 48～320，标题栏更小
 */
function PluginHost({
  plugin,
  widget = false,
  onOpen,
  onHide
}: {
  plugin: PluginInfo
  widget?: boolean
  /** 小组件：打开插件的完整页面 */
  onOpen?: () => void
  /** 小组件：不在主页显示 */
  onHide?: () => void
}): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const range = widget ? PLUGIN_WIDGET_HEIGHT : { min: 120, max: 4000 }
  const [height, setHeight] = useState(widget ? (plugin.widget?.height ?? 120) : 480)
  const [toast, setToast] = useState('')
  const entry = widget && plugin.widget ? plugin.widget.entry : plugin.entry
  const src = `liuli://plugin/${encodeURIComponent(plugin.id)}/${entry
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?v=${encodeURIComponent(plugin.version)}`

  useEffect(() => {
    const post = (data: unknown): void => {
      // 插件页面是空白来源（opaque origin），只能用 '*'；只发回给这个插件自己的 iframe
      frameRef.current?.contentWindow?.postMessage(data, '*')
    }
    const onMessage = (e: MessageEvent): void => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return
      const data = e.data as { liuli?: unknown; id?: unknown; method?: unknown; params?: unknown }
      if (!data || data.liuli !== 1 || typeof data.method !== 'string') return
      const id = typeof data.id === 'string' || typeof data.id === 'number' ? data.id : null
      const reply = (result: unknown, error?: string): void =>
        post(error ? { liuli: 1, id, error } : { liuli: 1, id, result })
      const params = (data.params && typeof data.params === 'object' ? data.params : {}) as Record<string, unknown>
      if (data.method === 'ui.resize') {
        const h = Number(params.height)
        if (Number.isFinite(h)) setHeight(Math.round(Math.min(range.max, Math.max(range.min, h))))
        reply(true)
        return
      }
      if (data.method === 'ui.toast') {
        setToast(String(params.text ?? '').slice(0, 200))
        setTimeout(() => setToast(''), 3000)
        reply(true)
        return
      }
      window.api.callPlugin(plugin.id, data.method, params).then(
        (result) => reply(result),
        (err) => reply(null, cleanError(err))
      )
    }
    window.addEventListener('message', onMessage)
    // 有「游戏状态」权限时，游戏状态变化推送给插件
    const off = plugin.permissions.includes('game')
      ? window.api.onGameStatus((s) =>
          post({ liuli: 1, event: 'game.status', data: { state: s.state, versionId: s.versionId } })
        )
      : undefined
    return () => {
      window.removeEventListener('message', onMessage)
      off?.()
    }
  }, [plugin.id, plugin.permissions, range.min, range.max])

  return (
    <section
      className="relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-xl backdrop-blur-xl"
      data-testid={widget ? 'plugin-widget' : 'plugin-host'}
    >
      {widget ? (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-xs text-white/50">
          <Puzzle className="h-3 w-3 text-violet-300" />
          <span className="truncate font-medium text-white/70">{plugin.name}</span>
          <div className="ml-auto flex items-center gap-0.5">
            {onOpen && (
              <button
                onClick={onOpen}
                title="打开插件"
                aria-label={`打开 ${plugin.name}`}
                className="rounded p-1 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
            {onHide && (
              <button
                onClick={onHide}
                title="不在主页显示（可以在插件管理里再打开）"
                aria-label={`在主页隐藏 ${plugin.name}`}
                className="rounded p-1 hover:bg-white/10 hover:text-white"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs text-white/50">
          <Puzzle className="h-3.5 w-3.5 text-violet-300" />
          <span className="font-medium text-white/80">{plugin.name}</span>
          <span>v{plugin.version}</span>
          {plugin.author && <span>· {plugin.author}</span>}
          <span className="ml-auto">插件运行在沙箱里，碰不到你的账号和文件</span>
        </div>
      )}
      <iframe
        ref={frameRef}
        key={`${plugin.id}@${plugin.version}:${entry}`}
        title={widget ? `${plugin.name}（小组件）` : plugin.name}
        src={src}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height }}
      />
      {toast && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white">
          {toast}
        </div>
      )}
    </section>
  )
}

export default PluginHost
