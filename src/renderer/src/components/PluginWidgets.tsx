import { useEffect, useState } from 'react'
import type { PluginInfo } from '../../../shared/types'
import PluginHost from './PluginHost'

/**
 * 主页上的插件小组件：启用了、带小组件、选了「在主页显示」的插件，每个一张小卡片（一个就占一整行，多个时两列）。
 * 没有小组件时什么都不显示
 */
function PluginWidgets({ onOpenPlugin }: { onOpenPlugin?: (id: string) => void }): JSX.Element | null {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  useEffect(() => {
    const load = (): void =>
      void window.api
        .listPlugins()
        .then((list) => setPlugins(list.filter((p) => p.enabled && !p.error && p.widget && p.widgetShown)))
        .catch(() => setPlugins([]))
    load()
    return window.api.onPluginsChanged(load)
  }, [])
  if (plugins.length === 0) return null
  return (
    <div
      className={`grid shrink-0 gap-3 ${plugins.length > 1 ? 'grid-cols-2' : ''}`}
      data-testid="plugin-widgets"
      aria-label="插件小组件"
    >
      {plugins.map((p) => (
        <PluginHost
          key={p.id}
          plugin={p}
          widget
          onOpen={onOpenPlugin ? () => onOpenPlugin(p.id) : undefined}
          onHide={() => void window.api.setPluginWidgetShown(p.id, false)}
        />
      ))}
    </div>
  )
}

export default PluginWidgets
