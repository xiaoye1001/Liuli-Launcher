import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CircleSlash,
  Download,
  HelpCircle,
  Loader2,
  X,
  type LucideIcon
} from 'lucide-react'
import type { InstalledVersion, ModMigrationCheck, ModMigrationItem, PerformanceModResult } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

const STATUS: Record<ModMigrationItem['status'], { label: string; icon: LucideIcon; color: string }> = {
  available: { label: '可以迁移', icon: CheckCircle2, color: 'text-emerald-300' },
  installed: { label: '已经装了', icon: CheckCircle2, color: 'text-sky-300' },
  unavailable: { label: '还没有新版本', icon: CircleSlash, color: 'text-amber-300' },
  error: { label: '检查失败', icon: AlertTriangle, color: 'text-rose-300' }
}

/** 安装结果：新装了几个、已经有几个、哪些没有适用版本或失败 */
function summarize(results: PerformanceModResult[]): string {
  const count = (status: PerformanceModResult['status']): number => results.filter((r) => r.status === status).length
  const parts = [`新装了 ${count('installed')} 个`]
  if (count('already') > 0) parts.push(`已经有 ${count('already')} 个`)
  const unavailable = results.filter((r) => r.status === 'unavailable').map((r) => r.name)
  const failed = results.filter((r) => r.status === 'failed').map((r) => r.name)
  if (unavailable.length > 0) parts.push(`没有适用的版本：${unavailable.join('、')}`)
  if (failed.length > 0) parts.push(`下载失败：${failed.join('、')}`)
  return parts.join('；')
}

/** 模组版本迁移助手：检查这个版本的模组在另一个版本上有没有适用的版本，一键装过去 */
function ModMigrationDialog({ versionId, onClose }: { versionId: string; onClose: () => void }): JSX.Element {
  const [targets, setTargets] = useState<InstalledVersion[] | null>(null)
  const [target, setTarget] = useState('')
  const [check, setCheck] = useState<ModMigrationCheck | null>(null)
  const [busy, setBusy] = useState<'' | 'check' | 'apply'>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  useEffect(() => {
    window.api
      .getInstalledVersions()
      .then((list: InstalledVersion[]) => {
        const usable = list.filter((v) => v.id !== versionId && v.loader && v.loader !== 'optifine')
        setTargets(usable)
        setTarget(usable[0]?.id ?? '')
      })
      .catch((e: unknown) => {
        setError(cleanError(e))
        setTargets([])
      })
  }, [versionId])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const available = useMemo(() => check?.items.filter((i) => i.status === 'available') ?? [], [check])

  const runCheck = async (): Promise<void> => {
    setBusy('check')
    setCheck(null)
    setMessage('')
    setError('')
    try {
      setCheck(await window.api.checkModMigration(versionId, target))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const apply = async (): Promise<void> => {
    if (!check) return
    setBusy('apply')
    setMessage('')
    setError('')
    try {
      const results = await window.api.applyModMigration(
        versionId,
        check.targetId,
        available.map((i) => ({ projectId: i.projectId, title: i.title }))
      )
      setMessage(`已安装到「${check.targetId}」：${summarize(results)}`)
      setCheck(await window.api.checkModMigration(versionId, check.targetId).catch(() => check))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const counts = (status: ModMigrationItem['status']): number =>
    check?.items.filter((i) => i.status === status).length ?? 0

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label="迁移模组到其他版本"
        className="flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <ArrowRightLeft className="h-4 w-4 text-sky-300" />
          <span className="flex-1">迁移模组到其他版本</span>
          <button
            onClick={() => closeRef.current()}
            disabled={!!busy}
            title="关闭"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/50">
          换新的游戏版本时，检查「{versionId}」里已启用的模组在新版本上有没有适用的版本，再一键装过去（自动安装前置）
        </p>

        {!targets && (
          <div className="flex justify-center py-6 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {targets?.length === 0 && (
          <div className="mt-4 rounded-xl bg-white/5 px-4 py-5 text-center text-xs leading-5 text-white/60">
            还没有可以迁移到的版本：先在「下载」页安装新的游戏版本（带 Fabric、Forge 或 NeoForge，
            最好和现在用同一种加载器），再回来迁移
          </div>
        )}
        {targets && targets.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/60">迁移到</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value)
                setCheck(null)
                setMessage('')
              }}
              disabled={!!busy}
              aria-label="迁移到的版本"
              className="min-w-0 max-w-[16rem] flex-1 cursor-pointer truncate rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 outline-none"
            >
              {targets.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-800 text-white">
                  {v.id}（{v.minecraftVersion} · {LOADER_NAMES[v.loader ?? ''] ?? v.loader}）
                </option>
              ))}
            </select>
            <button
              onClick={() => void runCheck()}
              disabled={!!busy || !target}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {busy === 'check' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy === 'check' ? '正在检查…' : '检查'}
            </button>
          </div>
        )}

        {check && (
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {!check.sameLoader && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                两个版本的模组加载器不同，大多数模组不能通用
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(Object.keys(STATUS) as ModMigrationItem['status'][])
                .filter((s) => counts(s) > 0)
                .map((s) => (
                  <span key={s} className={`rounded-lg bg-white/10 px-2 py-1 ${STATUS[s].color}`}>
                    {STATUS[s].label} {counts(s)}
                  </span>
                ))}
              {check.unknown.length > 0 && (
                <span className="rounded-lg bg-white/10 px-2 py-1 text-white/60">无法检查 {check.unknown.length}</span>
              )}
            </div>
            {check.items.length === 0 && check.unknown.length === 0 && (
              <p className="text-xs text-white/50">这个版本没有已启用的模组</p>
            )}
            <div className="space-y-1">
              {check.items.map((item) => {
                const s = STATUS[item.status]
                const Icon = s.icon
                return (
                  <div
                    key={item.projectId}
                    className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-sm"
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${s.color}`} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className={`shrink-0 text-xs ${s.color}`} title={item.detail}>
                      {item.status === 'available' ? item.version : s.label}
                    </span>
                  </div>
                )
              })}
            </div>
            {check.unknown.length > 0 && (
              <div className="rounded-lg bg-black/20 px-3 py-2 text-xs text-white/50">
                <div className="mb-1 flex items-center gap-1.5 text-white/70">
                  <HelpCircle className="h-3.5 w-3.5" />
                  这些不是从 Modrinth 下载的，无法检查，需要自己找新版本：
                </div>
                <div className="break-all">{check.unknown.join('、')}</div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div className="mt-3 flex items-start gap-2 text-xs text-emerald-300" role="status">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}。游戏设置可以在目标版本的版本设置里「从其他版本复制设置」</span>
          </div>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}

        {check && available.length > 0 && (
          <button
            onClick={() => void apply()}
            disabled={!!busy}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy === 'apply' ? '正在安装…' : `把 ${available.length} 个模组装到「${check.targetId}」`}
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}

export default ModMigrationDialog
