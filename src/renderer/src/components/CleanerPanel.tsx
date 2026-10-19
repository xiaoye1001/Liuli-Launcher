import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { cleanIpcError, formatBytes } from '../utils/downloads'
import type { CleanCategory, CleanResult, CleanScan } from '../../../shared/types'

const CATEGORY_INFO: Record<CleanCategory, { label: string; desc: string }> = {
  logs: { label: '游戏日志', desc: '旧的游戏日志（保留最近一次，分享日志要用）' },
  crash: { label: '崩溃报告', desc: '崩溃报告和 Java 崩溃日志' },
  partial: { label: '下载残留', desc: '下载中断留下的临时文件（正在进行的下载不受影响）' },
  cache: { label: '启动器缓存', desc: 'OptiFine 安装器、一天前下载的整合包、旧的更新安装包' },
  assets: { label: '未使用的资源文件', desc: '已删除的版本留下的声音、语言等文件；以后需要时启动前会自动重新下载' }
}

/** 默认不勾选的类别（删除后需要时要重新下载） */
const OPT_IN: CleanCategory[] = ['assets']

/** 百宝箱：清理游戏垃圾缓存 */
function CleanerPanel(): JSX.Element {
  const [scan, setScan] = useState<CleanScan | null>(null)
  const [selected, setSelected] = useState<Set<CleanCategory>>(new Set())
  const [busy, setBusy] = useState<'scan' | 'clean' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<CleanResult | null>(null)
  const [error, setError] = useState('')

  const rescan = async (keepResult = false): Promise<void> => {
    setBusy('scan')
    setError('')
    if (!keepResult) setResult(null)
    try {
      const next = await window.api.scanCleanup()
      setScan(next)
      setSelected(new Set(next.items.filter((i) => i.count > 0 && !OPT_IN.includes(i.category)).map((i) => i.category)))
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void rescan()
  }, [])

  const toggle = (category: CleanCategory): void => {
    setConfirming(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const items = scan?.items ?? []
  const chosen = items.filter((i) => selected.has(i.category) && i.count > 0)
  const total = chosen.reduce((sum, i) => sum + i.bytes, 0)

  const clean = async (): Promise<void> => {
    setConfirming(false)
    setBusy('clean')
    setError('')
    try {
      setResult(await window.api.runCleanup(chosen.map((i) => i.category)))
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(null)
    }
    await rescan(true)
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trash2 className="h-5 w-5 text-rose-300" />
            清理游戏垃圾缓存
          </h2>
          <p className="truncate text-xs text-white/50" title={scan?.gameDir}>
            {scan ? `游戏目录：${scan.gameDir}` : '扫描当前游戏目录和启动器缓存'}
          </p>
        </div>
        <button
          onClick={() => void rescan()}
          disabled={busy !== null}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {busy === 'scan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新扫描
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {!scan && busy === 'scan' && <div className="py-6 text-center text-sm text-white/50">正在扫描…</div>}
        {items.map((item) => {
          const info = CATEGORY_INFO[item.category]
          const empty = item.count === 0
          return (
            <label
              key={item.category}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                empty ? 'bg-black/10 opacity-60' : 'cursor-pointer bg-black/20 hover:bg-black/30'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(item.category) && !empty}
                disabled={empty || busy !== null}
                onChange={() => toggle(item.category)}
                className="h-4 w-4 shrink-0 accent-emerald-400"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{info.label}</div>
                <div className="text-xs text-white/50">{info.desc}</div>
              </div>
              <div className="shrink-0 text-right text-sm">
                {empty ? (
                  <span className="text-white/40">没有</span>
                ) : (
                  <>
                    <div className="font-medium">{formatBytes(item.bytes)}</div>
                    <div className="text-xs text-white/40">{item.count} 个文件</div>
                  </>
                )}
              </div>
            </label>
          )
        })}
        {scan && !scan.assetsReliable && (
          <div className="rounded-xl bg-black/10 px-4 py-2 text-xs text-white/50">
            有版本的文件不完整或损坏，无法判断哪些资源文件没有用到，这次不提供「未使用的资源文件」
          </div>
        )}
      </div>

      {error && <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200">{error}</div>}
      {result && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          已清理 {result.count} 个文件，释放 {formatBytes(result.bytes)}
          {result.failed > 0 && `；${result.failed} 个文件正在被使用，没有删除`}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {confirming ? (
          <>
            <span className="mr-auto text-sm text-amber-200">
              将永久删除 {chosen.reduce((sum, i) => sum + i.count, 0)} 个文件，确定吗？
            </span>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
            >
              取消
            </button>
            <button
              onClick={() => void clean()}
              className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-400"
            >
              确定清理
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={chosen.length === 0 || busy !== null}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'clean' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {chosen.length === 0 ? '没有选择要清理的内容' : `清理选中的 ${formatBytes(total)}`}
          </button>
        )}
      </div>
    </section>
  )
}

export default CleanerPanel
