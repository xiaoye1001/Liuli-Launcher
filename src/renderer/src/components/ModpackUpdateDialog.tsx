import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, FileArchive, Loader2, PackageOpen } from 'lucide-react'
import type {
  InstalledModpack,
  InstalledVersion,
  ModpackInfo,
  ModpackUpdateCheck,
  ModpackUpdatePlan,
  ModrinthProjectVersion
} from '../../../shared/types'

function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }

/** 游戏版本 + 加载器，例如「1.20.1 · Forge 47.2.0」 */
function gameLabel(pack: Pick<ModpackInfo, 'minecraftVersion' | 'loader' | 'loaderVersion'>): string {
  const loader = pack.loader ? ` · ${LOADER_NAMES[pack.loader] ?? pack.loader} ${pack.loaderVersion}` : ''
  return `${pack.minecraftVersion}${loader}`
}

const TYPE_LABELS: Record<ModrinthProjectVersion['versionType'], { label: string; className: string }> = {
  release: { label: '正式版', className: 'bg-emerald-500/20 text-emerald-300' },
  beta: { label: '测试版', className: 'bg-amber-500/20 text-amber-300' },
  alpha: { label: '早期测试版', className: 'bg-rose-500/20 text-rose-300' }
}

/**
 * 更新整合包：从下载页安装的整合包可以在线选择新版本，其他整合包选择新版本的整合包文件。
 * 确认页列出变化和更新规则（保留存档和改过的配置），开始后进度显示在版本页上方
 */
function ModpackUpdateDialog({
  version,
  onClose,
  onStarted
}: {
  version: InstalledVersion
  onClose: () => void
  onStarted: (message: string) => void
}): JSX.Element {
  const [check, setCheck] = useState<ModpackUpdateCheck | null>(null)
  const [selected, setSelected] = useState('')
  const [plan, setPlan] = useState<ModpackUpdatePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 在线检查失败（网络问题），和「不能在线检查」区分开 */
  const [checkFailed, setCheckFailed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  /** 下载、准备或开始更新期间不能关闭对话框（否则后台准备好的版本可能和界面上的对不上） */
  const close = (): void => {
    if (!busy) onClose()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // 打开时把焦点移进对话框；按 Esc 关闭
  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let alive = true
    window.api
      .checkModpackUpdate(version.id)
      .then((result) => {
        if (!alive) return
        setCheck(result)
        setSelected(result.updates[0]?.id ?? '')
      })
      .catch((e) => {
        if (!alive) return
        setError(`检查更新失败：${cleanError(e)}`)
        setCheckFailed(true)
        // 检查失败时仍然可以用整合包文件更新
        setCheck({ current: version.modpack ?? null, updates: [], online: false })
      })
    return () => {
      alive = false
    }
  }, [version.id, version.modpack])

  // 进入确认页（或返回）时点过的按钮会消失：把焦点放回对话框，键盘操作不会跑到后面的页面
  useEffect(() => {
    dialogRef.current?.focus()
  }, [plan])

  const step = async (action: () => Promise<ModpackUpdatePlan | null>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (result) setPlan(result)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const start = async (): Promise<void> => {
    if (busy || !plan) return
    setBusy(true)
    setError('')
    try {
      await window.api.applyModpackUpdate(version.id, plan.token)
      onStarted(`正在把 ${version.id} 更新到 ${plan.next.name} ${plan.next.version}，进度显示在上方`)
    } catch (e) {
      setError(cleanError(e))
      setBusy(false)
    }
  }

  const current: InstalledModpack | null = plan ? plan.current : (check?.current ?? null)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label={`更新整合包 ${version.id}`}
        className="flex max-h-[85vh] w-[32rem] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <PackageOpen className="h-4 w-4 text-emerald-300" />
          更新整合包 · {version.id}
        </div>
        <div className="mt-2 text-xs text-white/50">
          {current ? (
            <>
              当前：{current.name} {current.version || '（没有版本号）'} · {gameLabel(current)}
            </>
          ) : (
            '这个版本没有整合包的安装记录（旧版本启动器安装的整合包，或者不是整合包）'
          )}
        </div>

        {!check && (
          <div className="flex justify-center py-10 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {check && !plan && (
          <>
            {check.online && (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                {check.updates.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-3 text-sm text-white/70">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    已经是最新版本
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="新版本">
                    {check.updates.map((v) => {
                      const type = TYPE_LABELS[v.versionType]
                      return (
                        <label
                          key={v.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                            selected === v.id
                              ? 'border-emerald-400/50 bg-emerald-500/10'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name="modpack-version"
                            checked={selected === v.id}
                            onChange={() => setSelected(v.id)}
                            className="accent-emerald-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{v.versionNumber || v.name}</span>
                            <span className="block truncate text-xs text-white/50">
                              {v.gameVersions.slice(0, 3).join('、')}
                              {v.datePublished && ` · ${new Date(v.datePublished).toLocaleDateString('zh-CN')}`}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded px-1.5 text-xs ${type.className}`}>{type.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {!check.online && (
              <p className="mt-4 rounded-xl bg-white/5 px-3 py-3 text-sm leading-6 text-white/70">
                {checkFailed
                  ? '暂时无法在线检查新版本。可以稍后再试，或者先下载新版本的整合包文件，再选择它来更新。'
                  : '这个整合包不是从下载页安装的，无法在线检查新版本。可以先下载新版本的整合包文件，再选择它来更新。'}
              </p>
            )}
            {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => void step(() => window.api.pickModpackUpdateFile(version.id))}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
              >
                <FileArchive className="h-3.5 w-3.5" />
                从整合包文件更新…
              </button>
              <div className="flex gap-2">
                <button
                  onClick={close}
                  disabled={busy}
                  className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
                >
                  取消
                </button>
                {check.updates.length > 0 && (
                  <button
                    onClick={() => void step(() => window.api.prepareModpackUpdate(version.id, selected))}
                    disabled={busy || !selected}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {busy ? '正在下载…' : '下一步'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {plan && (
          <>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate text-white/60">{plan.current?.version || '当前'}</div>
                <div className="truncate text-xs text-white/40">{plan.current ? gameLabel(plan.current) : '—'}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/40" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {plan.next.name} {plan.next.version}
                </div>
                <div className="truncate text-xs text-white/50">{gameLabel(plan.next)}</div>
              </div>
            </div>
            {plan.current && plan.current.name !== plan.next.name && (
              <div className="mt-3 flex gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs leading-5 text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                选择的整合包（{plan.next.name}）和当前的（{plan.current.name}）名称不同，请确认是同一个整合包的新版本
              </div>
            )}
            {plan.current && plan.current.minecraftVersion !== plan.next.minecraftVersion && (
              <div className="mt-3 flex gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs leading-5 text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                游戏版本会从 {plan.current.minecraftVersion} 变为 {plan.next.minecraftVersion}
                ：存档进入新版本后会被升级，无法再用旧版本打开，建议先在「存档」里备份
              </div>
            )}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-white/60">
              <li>游戏本体和模组加载器会按新版本重新安装，模组换成新版本</li>
              {plan.current ? (
                <>
                  <li>新版本不再需要的整合包文件会被删除（你自己加的模组不受影响）</li>
                  <li>存档、你改过的配置文件和按键设置会保留，禁用的模组更新后仍然禁用</li>
                </>
              ) : (
                <>
                  <li>
                    没有安装记录：新版本里没有的模组会移到版本文件夹里的
                    liuli-modpack-backup，要替换的文件也会先备份到那里
                  </li>
                  <li>存档和按键等个人设置保留现有的</li>
                </>
              )}
            </ul>
            {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => (busy ? undefined : setPlan(null))}
                disabled={busy}
                className="rounded-lg border border-white/10 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50"
              >
                上一步
              </button>
              <button
                onClick={() => void start()}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                开始更新
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default ModpackUpdateDialog
