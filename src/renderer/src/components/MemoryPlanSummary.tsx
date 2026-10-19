import { AlertTriangle } from 'lucide-react'
import type { MemoryPlan } from '../../../shared/types'

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(2))} GB` : `${mb} MB`
}

/**
 * 自动分配内存的说明：预计分配多少，建议值由哪几项组成（基础、模组、光影、材质包、渲染距离……），
 * 以及受本机内存限制时的提示
 */
function MemoryPlanSummary({ plan, versionId }: { plan: MemoryPlan; versionId?: string }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="text-xs text-white/60">
        {versionId ? `启动「${versionId}」预计分配 ` : '预计分配 '}
        <span className="font-mono text-sm font-semibold text-white">{formatMemory(plan.memory)}</span>
        {plan.free !== null && <span className="text-white/40">（当前可用 {formatMemory(plan.free)}）</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {plan.factors.map((factor, i) => (
          <span
            key={factor.label}
            className={`rounded-lg px-2 py-1 text-xs ${i === 0 ? 'bg-white/10 text-white/70' : 'bg-sky-500/15 text-sky-300'}`}
          >
            {factor.label}
            <span className="ml-1 font-mono">
              {i === 0 ? '' : '+'}
              {formatMemory(factor.mb)}
            </span>
          </span>
        ))}
      </div>
      {(plan.capped || plan.limited) && (
        <div className="flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {plan.capped
              ? `建议 ${formatMemory(plan.recommended)}，但要给系统和其他程序留出内存，本机最多分配 ${formatMemory(plan.memory)}`
              : '当前可用内存不足，会少分配一些，建议启动前关闭其他程序'}
          </span>
        </div>
      )}
    </div>
  )
}

export default MemoryPlanSummary
