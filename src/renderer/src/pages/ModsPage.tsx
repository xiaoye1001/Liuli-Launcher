import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import type { InstalledVersion, ModInfo, ModKind, ModList } from '../../../shared/types'

const KIND_LABELS: Record<Exclude<ModKind, 'unknown'>, { label: string; className: string }> = {
  fabric: { label: 'Fabric', className: 'bg-amber-500/20 text-amber-300' },
  quilt: { label: 'Quilt', className: 'bg-fuchsia-500/20 text-fuchsia-300' },
  forge: { label: 'Forge', className: 'bg-sky-500/20 text-sky-300' },
  neoforge: { label: 'NeoForge', className: 'bg-rose-500/20 text-rose-300' }
}

/** Fabric 与 Quilt 互通，Forge 与 NeoForge 同源；不同阵营的模组不能互相加载 */
function family(kind: string | undefined): 'fabric' | 'forge' | undefined {
  if (kind === 'fabric' || kind === 'quilt') return 'fabric'
  if (kind === 'forge' || kind === 'neoforge') return 'forge'
  return undefined
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface ModsPageProps {
  version: InstalledVersion
  onBack: () => void
}

/** 模组管理：查看、启用/禁用、删除、添加某个版本的模组 */
function ModsPage({ version, onBack }: ModsPageProps): JSX.Element {
  const [list, setList] = useState<ModList | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在修改的模组文件名，避免重复点击 */
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await window.api.listMods(version.id))
      setError('')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }, [version.id])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fileName: string | null, action: () => Promise<void>): Promise<void> => {
    setPending(fileName)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setPending(null)
    }
  }

  const toggle = (mod: ModInfo): Promise<void> =>
    run(mod.fileName, async () => {
      const fileName = await window.api.setModEnabled(version.id, mod.fileName, !mod.enabled)
      setList((prev) =>
        prev && {
          ...prev,
          mods: prev.mods.map((m) => (m.fileName === mod.fileName ? { ...m, fileName, enabled: !mod.enabled } : m))
        }
      )
    })

  const remove = (mod: ModInfo): Promise<void> =>
    run(mod.fileName, async () => {
      await window.api.deleteMod(version.id, mod.fileName)
      setList((prev) => prev && { ...prev, mods: prev.mods.filter((m) => m.fileName !== mod.fileName) })
      setNotice(`已将 ${mod.name} 移到回收站`)
    })

  const add = (): Promise<void> =>
    run(null, async () => {
      const count = await window.api.addMods(version.id)
      if (count > 0) {
        setNotice(`已添加 ${count} 个模组`)
        await load()
      }
    })

  const kw = keyword.trim().toLowerCase()
  const visible = useMemo(
    () =>
      (list?.mods ?? []).filter(
        (m) =>
          !kw ||
          m.name.toLowerCase().includes(kw) ||
          m.modId.toLowerCase().includes(kw) ||
          m.fileName.toLowerCase().includes(kw)
      ),
    [list, kw]
  )
  const enabledCount = list?.mods.filter((m) => m.enabled).length ?? 0
  const versionFamily = family(version.loader)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：返回、标题、操作 */}
      <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            title="返回版本列表"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
            <Puzzle className="h-5 w-5 text-violet-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold" title={version.id}>
              模组管理 · {version.id}
            </h1>
            <p className="truncate text-xs text-white/50" title={list?.dir}>
              {list ? `${list.isolated ? '版本隔离' : '共用游戏目录'} · ${list.dir}` : '正在读取…'}
            </p>
          </div>
          <button
            onClick={add}
            disabled={pending !== null}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            添加模组
          </button>
          <button
            onClick={() => run(null, () => window.api.openModsDir(version.id))}
            title="打开 mods 文件夹"
            className="rounded-xl border border-white/10 bg-white/10 p-2.5 hover:bg-white/20"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            title="刷新"
            className="rounded-xl border border-white/10 bg-white/10 p-2.5 hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {notice && <div className="rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}

      {/* 模组列表 */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索模组名称或文件名"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>
          <span className="shrink-0 text-xs text-white/50">
            共 {list?.mods.length ?? 0} 个 · 已启用 {enabledCount} 个
          </span>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {loading && !list && (
            <div className="flex h-full items-center justify-center text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {list && list.mods.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/40">
              <Puzzle className="h-8 w-8" />
              还没有模组，点「添加模组」选择 .jar 文件，或打开文件夹直接放进去
            </div>
          )}
          {list && list.mods.length > 0 && visible.length === 0 && (
            <div className="py-10 text-center text-sm text-white/40">没有匹配的模组</div>
          )}
          {visible.map((mod) => {
            const kindInfo = mod.kind !== 'unknown' ? KIND_LABELS[mod.kind] : null
            const mismatch = versionFamily && family(mod.kind) && family(mod.kind) !== versionFamily
            return (
              <div
                key={mod.fileName}
                className={`flex items-center gap-3 rounded-xl bg-black/20 px-4 py-2.5 transition-opacity ${
                  mod.enabled ? '' : 'opacity-50'
                }`}
              >
                {mod.icon ? (
                  <img src={mod.icon} alt="" className="h-10 w-10 shrink-0 rounded-lg [image-rendering:pixelated]" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Puzzle className="h-5 w-5 text-white/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{mod.name}</span>
                    {mod.version && <span className="shrink-0 font-mono text-xs text-white/50">{mod.version}</span>}
                    {kindInfo && (
                      <span className={`shrink-0 rounded px-1.5 text-xs ${kindInfo.className}`}>{kindInfo.label}</span>
                    )}
                    {mismatch && (
                      <span
                        title={`这是 ${kindInfo?.label} 模组，当前版本无法加载`}
                        className="flex shrink-0 items-center gap-1 rounded bg-red-500/20 px-1.5 text-xs text-red-300"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        不兼容
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-white/40" title={mod.description || mod.fileName}>
                    {mod.description || mod.fileName}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-white/30">{formatSize(mod.size)}</span>
                {/* 启用开关 */}
                <button
                  role="switch"
                  aria-checked={mod.enabled}
                  onClick={() => toggle(mod)}
                  disabled={pending !== null}
                  title={mod.enabled ? '点击禁用' : '点击启用'}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait ${
                    mod.enabled ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                      mod.enabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => remove(mod)}
                  disabled={pending !== null}
                  title="删除（移到回收站）"
                  className="rounded-lg p-2 text-white/50 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default ModsPage
