import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, Download, ImageIcon, Loader2, X } from 'lucide-react'
import { buildYearReport, drawYearReport, reportYears } from '../utils/yearReport'
import type { PlayStats } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 年度游玩报告：生成一张可以分享的图片，保存或复制 */
function YearReportDialog({ stats, onClose }: { stats: PlayStats; onClose: () => void }): JSX.Element {
  const years = useMemo(() => reportYears(stats), [stats])
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear())
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // 玩家名：正版 / 外置账号的名字，或者离线玩家名
  useEffect(() => {
    void Promise.all([window.api.getAccounts(), window.api.getSettings()])
      .then(([accounts, settings]) => {
        const account =
          accounts.accounts.find((a) => a.uuid === accounts.active) ??
          accounts.external.find((a) => a.id === accounts.active)
        setPlayerName(account ? account.name : settings.offlineName)
      })
      .catch(() => setPlayerName(''))
  }, [])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const image = useMemo(() => {
    if (playerName === null) return null
    const report = buildYearReport(stats, year)
    return report ? drawYearReport(report, playerName).toDataURL('image/png') : null
  }, [stats, year, playerName])

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label="年度游玩报告"
        className="flex max-h-[90vh] w-[30rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <ImageIcon className="h-4 w-4 text-emerald-300" />
          <span className="flex-1">年度游玩报告</span>
          {years.length > 1 && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="年份"
              className="cursor-pointer rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm font-normal outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-slate-800 text-white">
                  {y} 年
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onClose}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 justify-center overflow-y-auto">
          {image ? (
            <img src={image} alt={`${year} 年度游玩报告`} className="h-auto max-h-[60vh] w-auto rounded-xl shadow-xl" />
          ) : (
            <div className="flex items-center py-16 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        {message && (
          <div className="mt-3 flex items-start gap-1.5 break-all text-xs text-emerald-300" role="status">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {message}
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() =>
              image &&
              void run('copy', async () => {
                await window.api.copyReportImage(image)
                return '已复制，可以直接粘贴到聊天里'
              })
            }
            disabled={!image || !!busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            复制图片
          </button>
          <button
            onClick={() =>
              image &&
              void run('save', async () => {
                const path = await window.api.saveReportImage(image, `${year} 年度游玩报告`)
                return path ? `已保存到 ${path}` : ''
              })
            }
            disabled={!image || !!busy}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            保存图片
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default YearReportDialog
