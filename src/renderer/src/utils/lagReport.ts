import type { LagReport, LagTip } from '../../../shared/types'

function mb(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`
}

/** 一句话说清这次卡不卡 */
export function lagSummary(r: LagReport): string {
  const parts: string[] = []
  if (r.oom) parts.push('内存不足')
  if (r.lagCount > 0) parts.push(`服务器跟不上 ${r.lagCount} 次，最长落后 ${(r.lagMaxMs / 1000).toFixed(1)} 秒`)
  if (r.timeouts > 0) parts.push(`连接超时 ${r.timeouts} 次`)
  if (r.highCpuShare >= 0.5) parts.push(`${Math.round(r.highCpuShare * 100)}% 的时间 CPU 满载`)
  if (r.tips.includes('memory') && r.peakMemoryMb !== null) parts.push(`电脑内存快用完了`)
  return parts.length ? parts.join('，') : '很流畅'
}

export const LAG_LEVELS: Record<LagReport['level'], { label: string; className: string }> = {
  good: { label: '流畅', className: 'bg-emerald-500/20 text-emerald-200' },
  some: { label: '有点卡', className: 'bg-amber-500/20 text-amber-200' },
  bad: { label: '很卡', className: 'bg-red-500/20 text-red-200' }
}

/** 建议：标题、说明，以及可以去哪里改 */
export function lagTipText(tip: LagTip, r: LagReport): { title: string; text: string; action?: 'versionSettings' } {
  switch (tip) {
    case 'oom':
      return {
        title: '游戏内存不够用了',
        text: '游戏报了内存不足（OutOfMemoryError）。在版本设置里调大内存，模组多的整合包可以用「大型整合包」预设',
        action: 'versionSettings'
      }
    case 'simulation':
      return {
        title: '游戏的服务器跟不上',
        text: '单人游戏也有内置服务器。可以降低「模拟距离」，少放实体（刷怪塔、大量动物、掉落物），同时跑很多红石机器也会拖慢；装性能优化模组（例如 Lithium）也有帮助'
      }
    case 'cpu':
      return {
        title: 'CPU 一直很忙',
        text: '可以降低渲染距离、关掉光影，或者关掉后台的其他程序'
      }
    case 'memory':
      return {
        title: '电脑内存快用完了',
        text: `游戏最多占用了 ${mb(r.peakMemoryMb ?? 0)}，电脑一共 ${mb(r.systemMemoryMb)}。关掉浏览器等其他程序，或者别给游戏分配太多内存（会挤占系统）`
      }
    case 'network':
      return {
        title: `和服务器的连接超时了 ${r.timeouts} 次`,
        text: '可能是网络不稳定，或者离服务器太远'
      }
  }
}

/** 这次的资源占用：内存峰值、平均 CPU */
export function lagResources(r: LagReport): string {
  const parts: string[] = []
  if (r.peakMemoryMb !== null) {
    parts.push(`内存最多 ${mb(r.peakMemoryMb)}${r.maxMemoryMb > 0 ? `（分配了 ${mb(r.maxMemoryMb)}）` : ''}`)
  }
  if (r.avgCpu !== null) parts.push(`CPU 平均 ${r.avgCpu}%`)
  return parts.join(' · ')
}
