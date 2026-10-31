import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Download,
  FileUp,
  Folder,
  FolderOpen,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2
} from 'lucide-react'
import GrassBlockIcon from '../components/GrassBlockIcon'
import PageHeader from '../components/PageHeader'
import { EmptyState, LoadingState } from '../components/EmptyState'
import { HEADER_BUTTON, HEADER_ICON_BUTTON } from '../components/headerButtons'
import WorldDetailsPanel from '../components/WorldDetailsPanel'
import type {
  InstalledVersion,
  WorldBackup,
  WorldDatapack,
  WorldGameMode,
  WorldInfo,
  WorldList
} from '../../../shared/types'

const GAME_MODES: Record<WorldGameMode, { label: string; className: string }> = {
  survival: { label: '生存', className: 'bg-emerald-500/20 text-emerald-300' },
  creative: { label: '创造', className: 'bg-sky-500/20 text-sky-300' },
  adventure: { label: '冒险', className: 'bg-amber-500/20 text-amber-300' },
  spectator: { label: '旁观', className: 'bg-violet-500/20 text-violet-300' },
  unknown: { label: '未知模式', className: 'bg-white/10 text-white/60' }
}
const DATAPACK_STATES: Record<WorldDatapack['state'], { label: string; className: string; title: string }> = {
  enabled: { label: '已启用', className: 'text-emerald-300', title: '' },
  disabled: { label: '已停用', className: 'text-white/40', title: '在游戏中用 /datapack enable 启用' },
  new: { label: '待加载', className: 'text-sky-300', title: '下次进入存档时自动启用' }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 最后游玩时间：一周内显示「x 天前」，更早显示日期 */
function formatLastPlayed(ms: number): string {
  if (!ms) return '未知'
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(ms).toLocaleDateString('zh-CN')
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 存档的数据包列表（展开后才加载） */
function DatapackPanel({
  versionId,
  world,
  onError,
  onDownload
}: {
  versionId: string
  world: WorldInfo
  onError: (message: string) => void
  onDownload: () => void
}): JSX.Element {
  const [packs, setPacks] = useState<WorldDatapack[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPacks(await window.api.listWorldDatapacks(versionId, world.folder))
    } catch (e) {
      onError(cleanError(e))
      setPacks([])
    }
  }, [versionId, world.folder, onError])

  useEffect(() => {
    load()
  }, [load])

  const act = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(key)
    try {
      await action()
      await load()
    } catch (e) {
      onError(cleanError(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-white/70">数据包</span>
        <span className="text-xs text-white/40">{packs ? `${packs.length} 个` : ''}</span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => act('add', () => window.api.addWorldDatapacks(versionId, world.folder))}
            disabled={pending !== null}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
          <button
            onClick={onDownload}
            title="从 Modrinth 下载数据包"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
          >
            <Download className="h-3 w-3" />
            下载
          </button>
          <button
            onClick={() =>
              window.api.openWorldDatapacksDir(versionId, world.folder).catch((e) => onError(cleanError(e)))
            }
            title="打开 datapacks 文件夹"
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {packs === null && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
        {packs?.length === 0 && <div className="text-xs text-white/40">这个存档还没有数据包</div>}
        {packs?.map((pack) => {
          const state = DATAPACK_STATES[pack.state]
          return (
            <div key={pack.fileName} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate" title={pack.fileName}>
                    {pack.fileName}
                  </span>
                  <span className={`shrink-0 text-xs ${state.className}`} title={state.title}>
                    {state.label}
                  </span>
                </div>
                <div className="truncate text-xs text-white/40">
                  {pack.isDirectory ? '文件夹' : formatSize(pack.size)}
                  {pack.description && ` · ${pack.description}`}
                </div>
              </div>
              <button
                onClick={() =>
                  act(pack.fileName, () => window.api.deleteWorldDatapack(versionId, world.folder, pack.fileName))
                }
                disabled={pending !== null}
                title="删除（移到回收站）"
                className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
              >
                {pending === pack.fileName ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface WorldsPageProps {
  version: InstalledVersion
  onBack: () => void
  /** 到下载页下载数据包（安装目标为该版本的这个存档） */
  onDownloadDatapacks: (world: string) => void
}

/** 某个版本的存档：查看信息、备份、导入、删除，管理存档里的数据包 */
function WorldsPage({ version, onBack, onDownloadDatapacks }: WorldsPageProps): JSX.Element {
  const [list, setList] = useState<WorldList | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 展开的是详情还是数据包 */
  const [panel, setPanel] = useState<'details' | 'datapacks'>('details')
  /** 正在操作的存档（备份可能需要一些时间） */
  const [pending, setPending] = useState<string | null>(null)
  const [tab, setTab] = useState<'worlds' | 'backups'>('worlds')
  const [backups, setBackups] = useState<WorldBackup[]>([])
  /** 等待确认覆盖还原的备份 */
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [worldList, backupList] = await Promise.all([
        window.api.listWorldInfos(version.id),
        window.api.listWorldBackups(version.id)
      ])
      setList(worldList)
      setBackups(backupList)
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

  const act = async (key: string, action: () => Promise<string | void>): Promise<void> => {
    setPending(key)
    setError('')
    setNotice('')
    try {
      const message = await action()
      if (message) setNotice(message)
      await load()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setPending(null)
    }
  }

  const kw = keyword.trim().toLowerCase()
  const worlds = useMemo(
    () =>
      (list?.worlds ?? []).filter(
        (w) => !kw || w.name.toLowerCase().includes(kw) || w.folder.toLowerCase().includes(kw)
      ),
    [list, kw]
  )
  const showError = useCallback((message: string) => setError(message), [])
  /** 存档文件夹名 → 显示名称 */
  const worldNames = useMemo(() => new Map((list?.worlds ?? []).map((w) => [w.folder, w.name])), [list])
  const backupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of backups) counts.set(b.world, (counts.get(b.world) ?? 0) + 1)
    return counts
  }, [backups])
  const shownBackups = useMemo(
    () =>
      backups.filter(
        (b) => !kw || b.world.toLowerCase().includes(kw) || (worldNames.get(b.world) ?? '').toLowerCase().includes(kw)
      ),
    [backups, kw, worldNames]
  )

  const restore = (backup: WorldBackup, asNew: boolean): Promise<void> =>
    act(`restore:${backup.file}`, async () => {
      setConfirming(null)
      const result = await window.api.restoreWorldBackup(version.id, backup.file, asNew)
      const when = new Date(backup.createdAt).toLocaleString('zh-CN')
      if (asNew || !backup.worldExists) return `已从 ${when} 的备份还原出存档「${result.folder}」`
      return `已把「${worldNames.get(backup.world) ?? backup.world}」还原到 ${when} 的备份${
        result.safetyBackup ? `，还原前的存档已备份为 ${result.safetyBackup}` : ''
      }`
    })

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：返回、标题、操作（与其他页面的标题栏对齐） */}
      <PageHeader
        onBack={onBack}
        backTitle="返回版本列表"
        icon={<Globe className="h-6 w-6 text-emerald-300" />}
        title={version.id}
        titleHint={version.id}
        subtitle={
          <span className="truncate" title={list?.dir}>
            存档 · {list?.dir ?? '…'}
          </span>
        }
        actions={
          <>
            <button
              onClick={() =>
                act('import', async () => {
                  const folder = await window.api.importWorld(version.id)
                  return folder ? `已导入存档「${folder}」` : undefined
                })
              }
              disabled={pending !== null}
              title="从 zip 压缩包导入存档"
              className={HEADER_BUTTON}
            >
              {pending === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              导入存档
            </button>
            <button
              onClick={() => window.api.openBackupsDir(version.id).catch((e) => setError(cleanError(e)))}
              title="打开备份文件夹"
              className={HEADER_BUTTON}
            >
              <Archive className="h-4 w-4" />
              备份文件夹
            </button>
            <button
              onClick={() => window.api.openWorldDir(version.id).catch((e) => setError(cleanError(e)))}
              title="打开 saves 文件夹"
              className={HEADER_ICON_BUTTON}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <button onClick={load} title="刷新" className={HEADER_ICON_BUTTON}>
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
      {notice && (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{notice}</span>
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 gap-1 rounded-xl bg-black/20 p-1">
            {(
              [
                ['worlds', `存档 ${list?.worlds.length ?? 0}`],
                ['backups', `备份 ${backups.length}`]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  tab === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={tab === 'worlds' ? '搜索存档' : '按存档名搜索备份'}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {!list && loading && <LoadingState />}
          {tab === 'backups' && (
            <>
              {backups.length === 0 && (
                <EmptyState icon={Archive}>还没有备份。在「存档」里点存档右侧的「备份」按钮即可备份</EmptyState>
              )}
              {backups.length > 0 && shownBackups.length === 0 && <EmptyState>没有匹配的备份</EmptyState>}
              {shownBackups.map((backup) => {
                const busy = pending === `restore:${backup.file}` || pending === `delbak:${backup.file}`
                return (
                  <div key={backup.file} className="flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      {busy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Archive className="h-5 w-5 text-white/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold" title={backup.world}>
                          {worldNames.get(backup.world) ?? backup.world}
                        </span>
                        {!backup.worldExists && (
                          <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/50">
                            存档已不在
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-white/50" title={backup.file}>
                        {new Date(backup.createdAt).toLocaleString('zh-CN')} · {formatLastPlayed(backup.createdAt)} ·{' '}
                        {formatSize(backup.size)}
                      </div>
                    </div>
                    {confirming === backup.file ? (
                      <div className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
                        覆盖当前存档？会先自动备份当前存档
                        <button
                          onClick={() => restore(backup, false)}
                          className="rounded-md bg-amber-500/80 px-2.5 py-1 font-medium text-white hover:bg-amber-500"
                        >
                          确认还原
                        </button>
                        <button onClick={() => setConfirming(null)} className="rounded-md px-2 py-1 hover:bg-white/10">
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => (backup.worldExists ? setConfirming(backup.file) : restore(backup, false))}
                          disabled={pending !== null}
                          title={backup.worldExists ? '用这个备份覆盖原存档' : '把这个备份还原为存档'}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          还原
                        </button>
                        {backup.worldExists && (
                          <button
                            onClick={() => restore(backup, true)}
                            disabled={pending !== null}
                            title="还原成一个新存档，不影响现在的存档"
                            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            还原为新存档
                          </button>
                        )}
                        <button
                          onClick={() =>
                            act(`delbak:${backup.file}`, async () => {
                              await window.api.deleteWorldBackup(version.id, backup.file)
                              return `已把备份 ${backup.file} 移到回收站`
                            })
                          }
                          disabled={pending !== null}
                          title="删除备份（移到回收站，可以找回）"
                          className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </>
          )}
          {tab === 'worlds' && list && list.worlds.length === 0 && (
            <EmptyState icon={Globe}>这个版本还没有存档，进入游戏创建一个世界，或点「导入存档」</EmptyState>
          )}
          {tab === 'worlds' && list && list.worlds.length > 0 && worlds.length === 0 && (
            <EmptyState>没有匹配的存档</EmptyState>
          )}
          {tab === 'worlds' &&
            worlds.map((world) => {
              const mode = GAME_MODES[world.gameMode]
              const open = expanded === world.folder
              const toggle = (next: 'details' | 'datapacks'): void => {
                if (open && panel === next) setExpanded(null)
                else {
                  setExpanded(world.folder)
                  setPanel(next)
                }
              }
              return (
                <div key={world.folder} className="overflow-hidden rounded-xl bg-black/20">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {world.icon ? (
                      <img
                        src={world.icon}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg [image-rendering:pixelated]"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <GrassBlockIcon className="h-8 w-8" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold" title={world.name}>
                          {world.name}
                        </span>
                        {world.name !== world.folder && (
                          <span className="truncate text-xs text-white/40" title="文件夹名">
                            <Folder className="mr-0.5 inline h-3 w-3" />
                            {world.folder}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {world.damaged ? (
                          <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-red-300">level.dat 无法读取</span>
                        ) : (
                          <>
                            <span className={`rounded-md px-2 py-0.5 ${mode.className}`}>{mode.label}</span>
                            {world.hardcore && (
                              <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-red-300">极限</span>
                            )}
                            {world.cheats && (
                              <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/60">允许作弊</span>
                            )}
                            {world.version && <span className="text-white/50">{world.version}</span>}
                          </>
                        )}
                        <span className="text-white/40">· 最后游玩 {formatLastPlayed(world.lastPlayed)}</span>
                        {(backupCounts.get(world.folder) ?? 0) > 0 && (
                          <button
                            onClick={() => {
                              setTab('backups')
                              setKeyword(world.folder)
                            }}
                            title="查看这个存档的备份"
                            className="text-sky-300 hover:underline"
                          >
                            · {backupCounts.get(world.folder)} 个备份
                          </button>
                        )}
                      </div>
                    </div>
                    {!world.damaged && (
                      <button
                        onClick={() => toggle('details')}
                        title="种子、难度、游戏规则等"
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                      >
                        详情
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${open && panel === 'details' ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                    <button
                      onClick={() => toggle('datapacks')}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                    >
                      数据包
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${open && panel === 'datapacks' ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() =>
                        act(world.folder, async () => {
                          const result = await window.api.backupWorld(version.id, world.folder)
                          const name = result.path.split(/[\\/]/).pop()
                          return `已备份「${world.name}」：${name}（${formatSize(result.size)}），可以在「备份」里还原`
                        })
                      }
                      disabled={pending !== null}
                      title="把存档打包成 zip 放到备份文件夹"
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                    >
                      {pending === world.folder ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                      备份
                    </button>
                    <button
                      onClick={() =>
                        window.api.openWorldDir(version.id, world.folder).catch((e) => setError(cleanError(e)))
                      }
                      title="打开存档文件夹"
                      className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        act(`delete:${world.folder}`, async () => {
                          await window.api.deleteWorld(version.id, world.folder)
                          return `已把存档「${world.name}」移到回收站`
                        })
                      }
                      disabled={pending !== null}
                      title="删除（移到回收站，可以找回）"
                      className="shrink-0 rounded-lg p-2 text-white/60 hover:bg-red-500/30 hover:text-red-200 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {open && panel === 'details' && <WorldDetailsPanel versionId={version.id} folder={world.folder} />}
                  {open && panel === 'datapacks' && (
                    <DatapackPanel
                      versionId={version.id}
                      world={world}
                      onError={showError}
                      onDownload={() => onDownloadDatapacks(world.folder)}
                    />
                  )}
                </div>
              )
            })}
        </div>
      </section>
    </div>
  )
}

export default WorldsPage
