import { useState } from 'react'
import { ArrowLeftRight, CheckCircle2, FileDown, FileUp, Loader2 } from 'lucide-react'
import type {
  AppSettings,
  SettingsImportPreview,
  SettingsImportResult,
  SettingsTransferPart
} from '../../../shared/types'

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const PARTS: { key: SettingsTransferPart; label: string; unit: string }[] = [
  { key: 'settings', label: '设置', unit: '项' },
  { key: 'themes', label: '我的主题', unit: '个' },
  { key: 'servers', label: '服务器', unit: '个' },
  { key: 'seeds', label: '种子收藏', unit: '个' },
  { key: 'collections', label: '模组合集', unit: '个' },
  { key: 'skins', label: '皮肤衣柜', unit: '套' }
]

function countsText(counts: Partial<Record<SettingsTransferPart, number>>): string {
  return PARTS.filter((p) => (counts[p.key] ?? 0) > 0)
    .map((p) => `${p.label} ${counts[p.key]} ${p.unit}`)
    .join('、')
}

/** 设置页「其它」：导出 / 导入启动器设置 */
function SettingsTransferSection({ onSettings }: { onSettings: (settings: AppSettings) => void }): JSX.Element {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [exported, setExported] = useState('')
  const [preview, setPreview] = useState<SettingsImportPreview | null>(null)
  const [parts, setParts] = useState<Set<SettingsTransferPart>>(new Set())
  const [result, setResult] = useState<SettingsImportResult | null>(null)

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const doExport = (): Promise<void> =>
    run('export', async () => {
      setResult(null)
      const r = await window.api.exportLauncherSettings()
      if (r) setExported(`已导出到 ${r.path}（${countsText(r.counts) || '没有内容'}）`)
    })

  const pick = (): Promise<void> =>
    run('pick', async () => {
      setExported('')
      setResult(null)
      const p = await window.api.readSettingsImport()
      if (!p) return
      setPreview(p)
      setParts(new Set(PARTS.filter((part) => p.counts[part.key] > 0).map((part) => part.key)))
    })

  const doImport = (): Promise<void> =>
    run('import', async () => {
      if (!preview) return
      const r = await window.api.applySettingsImport(preview.token, [...parts])
      setPreview(null)
      setResult(r)
      onSettings(await window.api.getSettings())
    })

  const button =
    'flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40'

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl"
      data-testid="settings-transfer"
    >
      <div className="flex items-center gap-3">
        <ArrowLeftRight className="h-5 w-5 text-sky-300" />
        <div>
          <h2 className="text-lg font-semibold">导出 / 导入设置</h2>
          <p className="text-xs text-white/50">
            换电脑或重装后一键恢复：设置、我的主题、服务器、种子收藏、模组合集、皮肤衣柜。不包含账号、密钥和密码
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void doExport()} disabled={!!busy} className={button}>
          {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          导出设置
        </button>
        <button onClick={() => void pick()} disabled={!!busy} className={button}>
          {busy === 'pick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          导入设置
        </button>
      </div>

      {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      {exported && (
        <div className="mt-3 break-all rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">
          {exported}
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-xl bg-black/20 p-4" data-testid="settings-import-preview">
          <div className="text-sm font-medium">选择要导入的内容</div>
          <div className="mt-0.5 text-xs text-white/50">
            {preview.launcherVersion ? `来自 v${preview.launcherVersion}` : '来自琉璃启动器'}
            {preview.exportedAt ? ` · ${new Date(preview.exportedAt).toLocaleString('zh-CN')} 导出` : ''}
            。已经有的服务器、种子、合集、皮肤会跳过，不会删除现有的内容
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
            {PARTS.map((p) => {
              const n = preview.counts[p.key]
              return (
                <label
                  key={p.key}
                  className={`flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm ${n === 0 ? 'opacity-40' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    disabled={n === 0}
                    checked={parts.has(p.key)}
                    onChange={(e) =>
                      setParts((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(p.key)
                        else next.delete(p.key)
                        return next
                      })
                    }
                    aria-label={p.label}
                    className="accent-emerald-500"
                  />
                  {p.label}
                  <span className="text-xs text-white/40">
                    {n} {p.unit}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void doImport()}
              disabled={!!busy || parts.size === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === 'import' && <Loader2 className="h-4 w-4 animate-spin" />}
              导入所选
            </button>
            <button onClick={() => setPreview(null)} disabled={!!busy} className={button}>
              取消
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200"
          data-testid="settings-import-result"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div>导入完成</div>
            <div className="text-xs text-emerald-200/80">
              {PARTS.filter((p) => result.added[p.key] !== undefined)
                .map((p) => {
                  const added = result.added[p.key] ?? 0
                  const skipped = result.skipped[p.key] ?? 0
                  const verb = p.key === 'settings' ? '改了' : '加入'
                  return `${p.label}：${verb} ${added} ${p.unit}${skipped > 0 ? `（${skipped} ${p.unit}${p.key === 'settings' ? '本来就一样' : '已有或无效，跳过'}）` : ''}`
                })
                .join('；')}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default SettingsTransferSection
