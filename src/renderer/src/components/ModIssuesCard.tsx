import { useState } from 'react'
import { AlertTriangle, ChevronDown, Copy, Power, Search } from 'lucide-react'
import type { ModIssue } from '../../../shared/types'

/** 版本范围写成人能看懂的样子；任意版本时不显示 */
function rangeLabel(range: string): string {
  const value = range.trim()
  return !value || value === '*' ? '' : `（${value}）`
}

/** 模组列表上方的问题提示：缺少前置模组、前置被禁用、重复模组 */
function ModIssuesCard({
  issues,
  busy,
  onToggle,
  onSearch
}: {
  issues: ModIssue[]
  busy: boolean
  /** 启用或禁用某个模组文件 */
  onToggle: (fileName: string) => void
  /** 去「下载模组」搜索 */
  onSearch: (keyword: string) => void
}): JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (issues.length === 0) return null
  const missing = issues.filter((i) => i.kind === 'missing').length
  const duplicate = issues.length - missing
  const summary = [missing > 0 && `缺少 ${missing} 个前置模组`, duplicate > 0 && `${duplicate} 个模组重复`]
    .filter(Boolean)
    .join('，')

  const button =
    'flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50'

  return (
    <div className="mt-3 shrink-0 rounded-xl border border-amber-400/20 bg-amber-500/10 text-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span className="flex-1 font-medium text-amber-200">{summary}，游戏可能无法启动</span>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="max-h-44 space-y-2 overflow-y-auto px-4 pb-3">
          {issues.map((issue) =>
            issue.kind === 'missing' ? (
              <div key={`m:${issue.dependency}`} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div>
                    {issue.disabled ? '前置模组被禁用了：' : '缺少前置模组：'}
                    <span className={`font-semibold ${issue.disabled ? '' : 'font-mono'}`}>
                      {issue.disabled?.name ?? issue.dependency}
                    </span>
                    {issue.alternatives.length > 0 && (
                      <span className="text-white/50">（或 {issue.alternatives.join('、')}）</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-white/50">
                    {issue.requiredBy.map((r) => `${r.name}${rangeLabel(r.range)}`).join('、')} 需要它
                  </div>
                </div>
                {issue.disabled ? (
                  <button onClick={() => onToggle(issue.disabled!.fileName)} disabled={busy} className={button}>
                    <Power className="h-3.5 w-3.5" />
                    启用
                  </button>
                ) : (
                  <button onClick={() => onSearch(issue.dependency)} className={button} title="在「下载模组」中搜索">
                    <Search className="h-3.5 w-3.5" />
                    搜索下载
                  </button>
                )}
              </div>
            ) : (
              <div key={`d:${issue.modId}`} className="rounded-lg bg-black/20 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 text-white/50" />
                  同一个模组装了 {issue.mods.length} 个：
                  <span className="font-semibold">{issue.mods[0].name}</span>
                  <span className="text-xs text-white/50">只保留一个，禁用或删除其他的</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {issue.mods.map((m) => (
                    <div key={m.fileName} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono text-white/70" title={m.fileName}>
                        {m.fileName}
                      </span>
                      {m.version && <span className="shrink-0 text-white/50">{m.version}</span>}
                      <button onClick={() => onToggle(m.fileName)} disabled={busy} className={button}>
                        <Power className="h-3.5 w-3.5" />
                        禁用
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default ModIssuesCard
