import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Trash2
} from 'lucide-react'
import ScreenshotsPanel from '../components/ScreenshotsPanel'
import PageHeader from '../components/PageHeader'
import { EmptyState, LoadingState } from '../components/EmptyState'
import { HEADER_BUTTON, HEADER_ICON_BUTTON, HEADER_PRIMARY } from '../components/headerButtons'
import type {
  InstalledVersion,
  LocalResource,
  LocalResourceKind,
  LocalResourceList,
  ModUpdate
} from '../../../shared/types'

const TABS: [LocalResourceKind, string][] = [
  ['resourcepack', '资源包'],
  ['shader', '光影包']
]
const SHADER_LOADERS = { iris: 'Iris', oculus: 'Oculus', optifine: 'OptiFine' }

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 去掉 .zip 后缀作为显示名 */
function displayName(item: LocalResource): string {
  return item.isDirectory ? item.fileName : item.fileName.replace(/\.zip$/i, '')
}

interface LocalResourcesPageProps {
  version: InstalledVersion
  onBack: () => void
  /** 到下载页下载更多资源包 / 光影包 */
  onDownloadMore: (kind: LocalResourceKind) => void
}

/** 某个版本的资源包与光影包：启用资源包、切换光影、添加、删除 */
function LocalResourcesPage({ version, onBack, onDownloadMore }: LocalResourcesPageProps): JSX.Element {
  const [kind, setKind] = useState<LocalResourceKind>('resourcepack')
  /** 是否显示「截图」标签 */
  const [showShots, setShowShots] = useState(false)
  const [list, setList] = useState<LocalResourceList | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 正在修改的文件名，避免重复点击 */
  const [pending, setPending] = useState<string | null>(null)
  /** 检查更新的结果（文件名 → 更新），未检查时为 null */
  const [updates, setUpdates] = useState<Record<string, ModUpdate> | null>(null)
  const [checking, setChecking] = useState(false)
  /** 当前显示的版本和类别：切换标签后，之前发出的请求结果不再使用（否则会把资源包的列表显示在光影标签下） */
  const current = useRef({ versionId: version.id, kind })
  current.current = { versionId: version.id, kind }
  const isCurrent = (versionId: string, k: LocalResourceKind): boolean =>
    current.current.versionId === versionId && current.current.kind === k

  const load = useCallback(async () => {
    const versionId = version.id
    const requested = kind
    setLoading(true)
    try {
      const result = await window.api.listLocalResources(versionId, requested)
      if (!isCurrent(versionId, requested)) return
      setList(result)
      setError('')
    } catch (e) {
      if (isCurrent(versionId, requested)) setError(cleanError(e))
    } finally {
      if (isCurrent(versionId, requested)) setLoading(false)
    }
  }, [version.id, kind])

  useEffect(() => {
    setList(null)
    setNotice('')
    setUpdates(null)
    setChecking(false)
    load()
  }, [load])

  const act = async (fileName: string | null, action: () => Promise<unknown>): Promise<void> => {
    setPending(fileName ?? '')
    setError('')
    setNotice('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setPending(null)
    }
  }

  const checkUpdates = async (): Promise<void> => {
    const versionId = version.id
    const requested = kind
    setChecking(true)
    setError('')
    setNotice('')
    try {
      const result = await window.api.checkResourceUpdates(versionId, requested)
      if (!isCurrent(versionId, requested)) return
      setUpdates(Object.fromEntries(result.map((u) => [u.fileName, u])))
      setNotice(
        result.length > 0
          ? `有 ${result.length} 个${label}可以更新`
          : `没有发现新版本（只能检查从 Modrinth 下载的${label}）`
      )
    } catch (e) {
      if (isCurrent(versionId, requested)) setError(cleanError(e))
    } finally {
      if (isCurrent(versionId, requested)) setChecking(false)
    }
  }

  const removeUpdate = (fileName: string): void =>
    setUpdates((prev) => {
      const next = { ...prev }
      delete next[fileName]
      return next
    })

  const updateOne = (update: ModUpdate): Promise<void> =>
    act(update.fileName, async () => {
      await window.api.updateResource(version.id, kind, update.fileName, update.newVersionId)
      removeUpdate(update.fileName)
      setNotice(`已将 ${update.title || update.fileName} 更新到 ${update.newVersion}，旧版本已移到回收站`)
    })

  const updateAll = (): Promise<void> =>
    act('', async () => {
      const failed: string[] = []
      let done = 0
      for (const update of Object.values(updates ?? {})) {
        try {
          await window.api.updateResource(version.id, kind, update.fileName, update.newVersionId)
          removeUpdate(update.fileName)
          done++
        } catch (e) {
          failed.push(`${update.title || update.fileName}（${cleanError(e)}）`)
        }
      }
      if (failed.length > 0) throw new Error(`已更新 ${done} 个，失败：${failed.join('、')}`)
      setNotice(`已更新 ${done} 个${label}，旧版本已移到回收站`)
    })

  const updateCount = Object.keys(updates ?? {}).length

  const kw = keyword.trim().toLowerCase()
  const items = useMemo(
    () =>
      (list?.items ?? []).filter(
        (i) => !kw || i.fileName.toLowerCase().includes(kw) || i.description.toLowerCase().includes(kw)
      ),
    [list, kw]
  )
  const enabledCount = list?.items.filter((i) => i.enabled).length ?? 0
  const label = kind === 'resourcepack' ? '资源包' : '光影包'

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：返回、标题、操作（与其他页面的标题栏对齐） */}
      <PageHeader
        onBack={onBack}
        backTitle="返回版本列表"
        icon={<ImageIcon className="h-6 w-6 text-emerald-300" />}
        title={version.id}
        titleHint={version.id}
        subtitle={
          <span className="truncate" title={list?.dir}>
            {showShots ? '资源包、光影与截图' : `资源包与光影 · ${list?.dir ?? '…'}`}
          </span>
        }
        actions={
          showShots ? undefined : (
            <>
              <button
                onClick={() => window.api.openLocalResourceDir(version.id, kind).catch((e) => setError(cleanError(e)))}
                title="打开文件夹"
                className={HEADER_ICON_BUTTON}
              >
                <FolderOpen className="h-4 w-4" />
              </button>
              <button onClick={load} title="刷新" className={HEADER_ICON_BUTTON}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )
        }
      />

      {/* 分类与操作 */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex rounded-xl bg-black/20 p-1">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              onClick={() => {
                setKind(key)
                setShowShots(false)
              }}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                !showShots && kind === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              {text}
            </button>
          ))}
          <button
            onClick={() => setShowShots(true)}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              showShots ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            截图
          </button>
        </div>
        <div className={`ml-auto flex gap-3 ${showShots ? 'hidden' : ''}`}>
          {updateCount > 0 ? (
            <button
              onClick={updateAll}
              disabled={pending !== null}
              className="flex items-center gap-2 rounded-xl bg-sky-500/80 px-4 py-2 text-sm font-medium transition-colors hover:bg-sky-500 disabled:opacity-50"
            >
              {pending === '' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              全部更新（{updateCount}）
            </button>
          ) : (
            <button
              onClick={checkUpdates}
              disabled={checking || pending !== null}
              title={`在 Modrinth 上检查${label}的新版本`}
              className={HEADER_BUTTON}
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              检查更新
            </button>
          )}
          <button
            onClick={() => act(null, () => window.api.addLocalResources(version.id, kind))}
            disabled={pending !== null}
            className={HEADER_BUTTON}
          >
            <Plus className="h-4 w-4" />
            添加文件
          </button>
          <button
            onClick={() => onDownloadMore(kind)}
            title={`从 Modrinth 下载${label}到这个版本`}
            className={HEADER_PRIMARY}
          >
            <Download className="h-4 w-4" />
            下载{label}
          </button>
        </div>
      </div>

      {showShots ? (
        <ScreenshotsPanel versionId={version.id} />
      ) : (
        <>
          {/* 光影加载器状态 */}
          {kind === 'shader' && list && (
            <div
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm ${
                list.shaderLoader ? 'bg-black/20 text-white/70' : 'bg-amber-500/15 text-amber-200'
              }`}
            >
              {list.shaderLoader ? (
                <>
                  <Sun className="h-4 w-4 shrink-0 text-amber-300" />
                  <span className="flex-1">
                    光影加载器：{SHADER_LOADERS[list.shaderLoader]} ·{' '}
                    {list.shadersEnabled ? '光影已开启' : '光影未开启'}
                    。点「使用」切换光影，下次进入游戏生效。
                  </span>
                  {list.shadersEnabled && (
                    <button
                      onClick={() => act(null, () => window.api.setActiveShader(version.id, null))}
                      disabled={pending !== null}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
                    >
                      关闭光影
                    </button>
                  )}
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  没有检测到光影加载器的设置。光影需要 Iris（Fabric / NeoForge）、Oculus（Forge）或
                  OptiFine，装好后进入游戏打开一次光影设置，这里就能切换光影。
                </>
              )}
            </div>
          )}
          {kind === 'resourcepack' && (
            <p className="px-1 text-xs text-white/40">
              打开开关会在游戏中启用该资源包（后启用的在上层），下次进入游戏生效。已启用 {enabledCount} 个。
            </p>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {notice}
            </div>
          )}

          <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 text-white/40" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={`搜索${label}`}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
              />
              <span className="text-xs text-white/40">共 {list?.items.length ?? 0} 个</span>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {!list && loading && <LoadingState />}
              {list && list.items.length === 0 && (
                <EmptyState icon={ImageIcon}>
                  还没有{label}，可以点「下载{label}」或「添加文件」
                </EmptyState>
              )}
              {list && list.items.length > 0 && items.length === 0 && <EmptyState>没有匹配的{label}</EmptyState>}
              {items.map((item) => (
                <div
                  key={item.fileName}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    item.enabled ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-transparent bg-black/20'
                  }`}
                >
                  {item.icon ? (
                    <img src={item.icon} alt="" className="h-10 w-10 shrink-0 rounded-lg [image-rendering:pixelated]" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      {kind === 'shader' ? (
                        <Sun className="h-5 w-5 text-white/40" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-white/40" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold" title={item.fileName}>
                        {displayName(item)}
                      </span>
                      {kind === 'shader' && item.enabled && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          使用中
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div className="truncate text-xs text-white/50" title={item.description}>
                        {item.description}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      {item.isDirectory ? (
                        <>
                          <Folder className="h-3 w-3" />
                          文件夹
                        </>
                      ) : (
                        formatSize(item.size)
                      )}
                      {item.packFormat !== undefined && <span>· 格式版本 {item.packFormat}</span>}
                    </div>
                  </div>
                  {updates?.[item.fileName] && (
                    <button
                      onClick={() => updateOne(updates[item.fileName])}
                      disabled={pending !== null}
                      title={`更新到 ${updates[item.fileName].newFileName}`}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-500/20 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                      更新到 {updates[item.fileName].newVersion}
                      {updates[item.fileName].prerelease && '（测试版）'}
                    </button>
                  )}
                  {kind === 'resourcepack' ? (
                    <button
                      role="switch"
                      aria-checked={item.enabled}
                      onClick={() =>
                        act(item.fileName, () =>
                          window.api.setResourcePackEnabled(version.id, item.fileName, !item.enabled)
                        )
                      }
                      disabled={pending !== null}
                      title={item.enabled ? '点击停用' : '点击启用'}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait ${
                        item.enabled ? 'bg-emerald-500' : 'bg-white/20'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
                          item.enabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  ) : (
                    !item.enabled &&
                    list?.shaderLoader && (
                      <button
                        onClick={() => act(item.fileName, () => window.api.setActiveShader(version.id, item.fileName))}
                        disabled={pending !== null}
                        className="shrink-0 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                      >
                        使用
                      </button>
                    )
                  )}
                  <button
                    onClick={() =>
                      act(item.fileName, async () => {
                        await window.api.deleteLocalResource(version.id, kind, item.fileName)
                        setNotice(`已把 ${displayName(item)} 移到回收站`)
                      })
                    }
                    disabled={pending !== null}
                    title="删除（移到回收站）"
                    className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                  >
                    {pending === item.fileName ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default LocalResourcesPage
