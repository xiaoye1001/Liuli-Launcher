import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  FolderOpen,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import ModrinthBrowser from '../components/ModrinthBrowser'
import PageHeader from '../components/PageHeader'
import { EmptyState, LoadingState } from '../components/EmptyState'
import { HEADER_ICON_BUTTON, HEADER_PRIMARY } from '../components/headerButtons'
import ModIssuesCard from '../components/ModIssuesCard'
import type { InstalledVersion, ModInfo, ModKind, ModList, ModUpdate } from '../../../shared/types'

const TABS: { key: 'installed' | 'modrinth'; label: string }[] = [
  { key: 'installed', label: '已安装' },
  { key: 'modrinth', label: '下载模组' }
]

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
  const [tab, setTab] = useState<'installed' | 'modrinth'>('installed')
  /** 第一次打开「下载模组」时才加载，避免一进来就请求网络 */
  const [browserOpened, setBrowserOpened] = useState(false)
  /** 正在修改的模组文件名，避免重复点击 */
  const [pending, setPending] = useState<string | null>(null)
  /** 检查更新的结果：文件名 → 新版本；null 表示还没有检查 */
  const [updates, setUpdates] = useState<Record<string, ModUpdate> | null>(null)
  const [checking, setChecking] = useState(false)
  /** 从问题提示跳到「下载模组」时预先填好的搜索词 */
  const [searchPreset, setSearchPreset] = useState<{ text: string; nonce: number } | undefined>()

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

  /** 启用、禁用、删除模组后重新检查前置和重复模组 */
  const refreshIssues = (): void => {
    window.api
      .checkModIssues(version.id)
      .then((issues) => setList((prev) => prev && { ...prev, issues }))
      .catch(() => undefined)
  }

  const toggle = (mod: ModInfo): Promise<void> =>
    run(mod.fileName, async () => {
      const fileName = await window.api.setModEnabled(version.id, mod.fileName, !mod.enabled)
      setList(
        (prev) =>
          prev && {
            ...prev,
            mods: prev.mods.map((m) => (m.fileName === mod.fileName ? { ...m, fileName, enabled: !mod.enabled } : m))
          }
      )
      refreshIssues()
    })

  const remove = (mod: ModInfo): Promise<void> =>
    run(mod.fileName, async () => {
      await window.api.deleteMod(version.id, mod.fileName)
      setList((prev) => prev && { ...prev, mods: prev.mods.filter((m) => m.fileName !== mod.fileName) })
      setNotice(`已将 ${mod.name} 移到回收站`)
      refreshIssues()
    })

  const add = (): Promise<void> =>
    run(null, async () => {
      const count = await window.api.addMods(version.id)
      if (count > 0) {
        setNotice(`已添加 ${count} 个模组`)
        await load()
      }
    })

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    setError('')
    setNotice('')
    try {
      const result = await window.api.checkModUpdates(version.id)
      setUpdates(Object.fromEntries(result.map((u) => [u.fileName, u])))
      setNotice(
        result.length > 0
          ? `有 ${result.length} 个模组可以更新`
          : '所有模组都是最新的（只能检查 Modrinth 上发布的模组）'
      )
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setChecking(false)
    }
  }

  const updateOne = (mod: ModInfo, update: ModUpdate): Promise<void> =>
    run(mod.fileName, async () => {
      await window.api.updateMod(version.id, mod.fileName, update.newVersionId)
      setUpdates((prev) => {
        const next = { ...prev }
        delete next[mod.fileName]
        return next
      })
      setNotice(`已将 ${update.title || mod.name} 更新到 ${update.newVersion}，旧版本已移到回收站`)
      await load()
    })

  const updateAll = (): Promise<void> =>
    run('__all__', async () => {
      const list = Object.values(updates ?? {})
      const failed: string[] = []
      let done = 0
      for (const update of list) {
        try {
          await window.api.updateMod(version.id, update.fileName, update.newVersionId)
          done++
          setUpdates((prev) => {
            const next = { ...prev }
            delete next[update.fileName]
            return next
          })
        } catch (e) {
          failed.push(`${update.title || update.fileName}（${cleanError(e)}）`)
        }
      }
      await load()
      setNotice(`已更新 ${done} 个模组，旧版本已移到回收站`)
      if (failed.length > 0) setError(`以下模组更新失败：${failed.join('、')}`)
    })

  const updateCount = Object.keys(updates ?? {}).length
  const kw = keyword.trim().toLowerCase()
  const visible = useMemo(
    () =>
      (list?.mods ?? []).filter(
        (m) =>
          !kw ||
          m.name.toLowerCase().includes(kw) ||
          (m.zhName ?? '').toLowerCase().includes(kw) ||
          m.modId.toLowerCase().includes(kw) ||
          m.fileName.toLowerCase().includes(kw)
      ),
    [list, kw]
  )
  const enabledCount = list?.mods.filter((m) => m.enabled).length ?? 0
  const versionFamily = family(version.loader)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：返回、标题、操作（与其他页面的标题栏对齐） */}
      <PageHeader
        onBack={onBack}
        backTitle="返回版本列表"
        icon={<Puzzle className="h-6 w-6 text-violet-300" />}
        title={version.id}
        titleHint={version.id}
        subtitle={
          <span className="truncate" title={list?.dir}>
            {list ? `模组 · ${list.isolated ? '版本隔离' : '共用游戏目录'} · ${list.dir}` : '模组 · 正在读取…'}
          </span>
        }
        actions={
          <>
            <button onClick={add} disabled={pending !== null} className={HEADER_PRIMARY}>
              <Plus className="h-4 w-4" />
              添加模组
            </button>
            <button
              onClick={() => run(null, () => window.api.openModsDir(version.id))}
              title="打开 mods 文件夹"
              className={HEADER_ICON_BUTTON}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <button onClick={load} disabled={loading} title="刷新" className={HEADER_ICON_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {notice && <div className="rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}

      {/* 模组列表 */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex w-fit rounded-xl bg-black/20 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                if (t.key === 'modrinth') setBrowserOpened(true)
              }}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                tab === t.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              {t.key === 'installed' ? `${t.label}（${list?.mods.length ?? 0}）` : t.label}
            </button>
          ))}
        </div>

        {/* 两个标签页都保持挂载，切换时保留搜索结果 */}
        {browserOpened && (
          <div className={`min-h-0 flex-1 flex-col ${tab === 'modrinth' ? 'flex' : 'hidden'}`}>
            <ModrinthBrowser versionId={version.id} onInstalled={load} preset={searchPreset} />
          </div>
        )}
        <div className={`min-h-0 flex-1 flex-col ${tab === 'installed' ? 'flex' : 'hidden'}`}>
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-white/40" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索模组名称（支持中文名）或文件名"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
              />
            </div>
            <span className="shrink-0 text-xs text-white/50">
              共 {list?.mods.length ?? 0} 个 · 已启用 {enabledCount} 个
            </span>
            {updateCount > 0 ? (
              <button
                onClick={updateAll}
                disabled={pending !== null}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {pending === '__all__' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                )}
                全部更新（{updateCount}）
              </button>
            ) : null}
            <button
              onClick={checkUpdates}
              disabled={checking || pending !== null || !list?.mods.length}
              title="在 Modrinth 上查找适用于当前版本的新版本"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              检查更新
            </button>
          </div>

          {list && (
            <ModIssuesCard
              issues={list.issues}
              busy={pending !== null}
              onToggle={(fileName) => {
                const mod = list.mods.find((m) => m.fileName === fileName)
                if (mod) void toggle(mod)
              }}
              onSearch={(text) => {
                setSearchPreset({ text, nonce: Date.now() })
                setBrowserOpened(true)
                setTab('modrinth')
              }}
            />
          )}

          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && !list && <LoadingState />}
            {list && list.mods.length === 0 && (
              <EmptyState icon={Puzzle}>还没有模组，点「添加模组」选择 .jar 文件，或打开文件夹直接放进去</EmptyState>
            )}
            {list && list.mods.length > 0 && visible.length === 0 && <EmptyState>没有匹配的模组</EmptyState>}
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
                      {/* 常用模组显示中文名，原名放在后面 */}
                      <span className="truncate text-sm font-semibold">{mod.zhName ?? mod.name}</span>
                      {mod.zhName && <span className="truncate text-xs text-white/50">{mod.name}</span>}
                      {mod.version && <span className="shrink-0 font-mono text-xs text-white/50">{mod.version}</span>}
                      {kindInfo && (
                        <span className={`shrink-0 rounded px-1.5 text-xs ${kindInfo.className}`}>
                          {kindInfo.label}
                        </span>
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
                  {updates?.[mod.fileName] && (
                    <button
                      onClick={() => updateOne(mod, updates[mod.fileName])}
                      disabled={pending !== null}
                      title={`更新到 ${updates[mod.fileName].newFileName}`}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {pending === mod.fileName ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      )}
                      更新到 {updates[mod.fileName].newVersion}
                      {updates[mod.fileName].prerelease && '（测试版）'}
                    </button>
                  )}
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
        </div>
      </section>
    </div>
  )
}

export default ModsPage
