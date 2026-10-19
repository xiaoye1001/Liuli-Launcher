import { useState } from 'react'
import { CheckCircle2, Gauge, Loader2, Play } from 'lucide-react'
import { cleanIpcError, formatSpeed } from '../utils/downloads'
import type { DownloadSource, SpeedTestReport, SpeedTestResult } from '../../../shared/types'

const SOURCE_LABELS: Record<DownloadSource, string> = { bmclapi: 'BMCLAPI 镜像', mojang: '官方源' }
const SOURCE_DESC: Record<DownloadSource, string> = {
  bmclapi: '游戏文件走 BMCLAPI，模组走 MCIM',
  mojang: '游戏文件走 Mojang，模组走 Modrinth'
}
const TARGET_LABELS: Record<SpeedTestResult['target'], string> = { game: '游戏文件', mods: '模组' }

function Cell({ result, best }: { result?: SpeedTestResult; best: boolean }): JSX.Element {
  if (!result) return <div className="text-white/30">—</div>
  if (result.speed === null) {
    return (
      <div>
        <div className="text-rose-300">失败</div>
        <div className="text-xs text-white/40">{result.error ?? ''}</div>
      </div>
    )
  }
  return (
    <div>
      <div className={`font-medium ${best ? 'text-emerald-300' : ''}`}>{formatSpeed(result.speed)}</div>
      <div className="text-xs text-white/40">
        延迟 {result.latency} ms · {result.host}
      </div>
    </div>
  )
}

/** 百宝箱：下载源测速 */
function SpeedTestPanel(): JSX.Element {
  const [report, setReport] = useState<SpeedTestReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')

  const run = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      setReport(await window.api.runSpeedTest())
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(false)
    }
  }

  const useSource = async (source: DownloadSource): Promise<void> => {
    setSwitching(true)
    try {
      const saved = await window.api.updateSettings({ downloadSource: source })
      setReport((prev) => (prev ? { ...prev, current: saved.downloadSource } : prev))
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setSwitching(false)
    }
  }

  const find = (source: DownloadSource, target: SpeedTestResult['target']): SpeedTestResult | undefined =>
    report?.results.find((r) => r.source === source && r.target === target)
  const fasterOf = (target: SpeedTestResult['target']): DownloadSource | null => {
    const a = find('mojang', target)?.speed ?? null
    const b = find('bmclapi', target)?.speed ?? null
    if (a === null && b === null) return null
    return (b ?? -1) >= (a ?? -1) ? 'bmclapi' : 'mojang'
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Gauge className="h-5 w-5 text-sky-300" />
            下载源测速
          </h2>
          <p className="text-xs text-white/50">
            对比官方源与国内镜像的延迟和下载速度，约需 20 ~ 40 秒，会使用少量流量（约 16 MB）
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {busy ? '正在测速…' : report ? '重新测速' : '开始测速'}
        </button>
      </div>

      {error && <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200">{error}</div>}

      {report && (
        <>
          <div className="mt-4 overflow-hidden rounded-xl bg-black/20">
            <div className="grid grid-cols-[6rem_1fr_1fr] gap-3 border-b border-white/5 px-4 py-2 text-xs text-white/50">
              <span />
              <span>{SOURCE_LABELS.mojang}</span>
              <span>{SOURCE_LABELS.bmclapi}</span>
            </div>
            {(['game', 'mods'] as const).map((target) => {
              const faster = fasterOf(target)
              return (
                <div key={target} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-white/70">{TARGET_LABELS[target]}</span>
                  <Cell result={find('mojang', target)} best={faster === 'mojang'} />
                  <Cell result={find('bmclapi', target)} best={faster === 'bmclapi'} />
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
            {report.recommended ? (
              <div className="min-w-0 text-sm">
                <div>
                  推荐使用 <span className="font-semibold text-emerald-300">{SOURCE_LABELS[report.recommended]}</span>
                  <span className="ml-2 text-xs text-white/50">{SOURCE_DESC[report.recommended]}</span>
                </div>
                <div className="text-xs text-white/50">当前下载源：{SOURCE_LABELS[report.current]}</div>
              </div>
            ) : (
              <div className="text-sm text-rose-200">两个下载源都无法连接，请检查网络或代理设置</div>
            )}
            {report.recommended &&
              (report.recommended === report.current ? (
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  已在使用
                </span>
              ) : (
                <button
                  onClick={() => void useSource(report.recommended!)}
                  disabled={switching}
                  className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
                >
                  切换到{SOURCE_LABELS[report.recommended]}
                </button>
              ))}
          </div>
        </>
      )}
    </section>
  )
}

export default SpeedTestPanel
