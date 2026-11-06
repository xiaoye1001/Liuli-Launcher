import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Check,
  ClipboardCopy,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import type { SchematicDetails, SchematicFile, SchematicList } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 数量写成「N 组 + M 个」（一组 64 个），很多时再加上潜影盒（27 组） */
export function stackText(count: number): string {
  if (count < 64) return ''
  const stacks = Math.floor(count / 64)
  const rest = count % 64
  const boxes = count / (27 * 64)
  return `${stacks} 组${rest ? ` + ${rest}` : ''}${boxes >= 1 ? ` · 约 ${boxes.toFixed(1)} 盒` : ''}`
}

function dimsText(d: { x: number; y: number; z: number } | null | undefined): string {
  return d ? `${d.x}×${d.y}×${d.z}` : ''
}

/** 投影文件管理：schematics 文件夹里的投影，查看材料清单 */
function SchematicsPanel({ versionId }: { versionId: string }): JSX.Element {
  const [list, setList] = useState<SchematicList | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [details, setDetails] = useState<SchematicDetails | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** 正在看的投影（读取期间换了别的投影时，旧的结果不显示） */
  const current = useRef<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setList(await window.api.listSchematics(versionId))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setLoading(false)
    }
  }, [versionId])

  useEffect(() => {
    void load()
  }, [load])

  const open = async (file: SchematicFile): Promise<void> => {
    setSelected(file.name)
    current.current = file.name
    setDetails(null)
    setDetailsError('')
    setKeyword('')
    if (file.format !== 'litematic') {
      setDetailsError('只能查看 .litematic 投影的材料清单；其他格式可以在游戏里用 Litematica 加载')
      return
    }
    setDetailsLoading(true)
    try {
      const result = await window.api.getSchematicDetails(versionId, file.name)
      if (current.current === file.name) setDetails(result)
    } catch (e) {
      if (current.current === file.name) setDetailsError(cleanError(e))
    } finally {
      if (current.current === file.name) setDetailsLoading(false)
    }
  }

  const act = async (action: () => Promise<unknown>): Promise<void> => {
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const materials = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const all = details?.materials ?? []
    return kw ? all.filter((m) => m.id.toLowerCase().includes(kw) || m.name.includes(kw)) : all
  }, [details, keyword])

  const copyList = (): void => {
    if (!details) return
    const text = [
      `${details.title || details.name} 材料清单`,
      ...details.materials.map((m) => {
        const stacks = stackText(m.count)
        return `${m.name || m.id}\t${m.count}${stacks ? `（${stacks}）` : ''}`
      })
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const button =
    'flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="schematics">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button onClick={() => void act(() => window.api.addSchematics(versionId))} className={button}>
          <Plus className="h-4 w-4" />
          添加投影
        </button>
        <button
          onClick={() => window.api.openSchematicsDir(versionId).catch((e) => setError(cleanError(e)))}
          className={button}
        >
          <FolderOpen className="h-4 w-4" />
          打开文件夹
        </button>
        <button onClick={() => void load()} title="刷新" aria-label="刷新投影列表" className={button}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {list && <span className="truncate text-xs text-white/40">{list.dir}</span>}
      </div>

      {list?.litematica === false && (
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          这个版本没有启用 Litematica（投影）模组，装好后才能在游戏里加载投影
        </div>
      )}
      {error && <div className="shrink-0 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 投影列表 */}
        <div className="min-h-0 w-[45%] shrink-0 space-y-1.5 overflow-y-auto pr-1">
          {list && list.files.length === 0 && (
            <div className="rounded-xl bg-black/20 px-4 py-6 text-center text-sm text-white/50">
              还没有投影文件。点「添加投影」，或者把 .litematic 文件放进 schematics 文件夹
            </div>
          )}
          {list?.files.map((file) => (
            <div
              key={file.name}
              data-testid="schematic-item"
              onClick={() => void open(file)}
              className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
                selected === file.name
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : 'border-white/5 bg-black/20 hover:bg-black/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>
                  {file.title || file.name}
                </span>
                <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[10px] uppercase text-white/50">
                  {file.format}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-white/50">
                {file.title && <span className="truncate font-mono">{file.name}</span>}
                {file.dims && <span>{dimsText(file.dims)}</span>}
                {!!file.totalBlocks && <span>{file.totalBlocks.toLocaleString()} 个方块</span>}
                {file.author && <span>作者 {file.author}</span>}
                <span>{fileSize(file.size)}</span>
                {file.broken && <span className="text-amber-300">读不出来</span>}
              </div>
              <div className="mt-1.5 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => window.api.showSchematic(versionId, file.name).catch((e) => setError(cleanError(e)))}
                  title="在文件夹中显示"
                  aria-label={`在文件夹中显示 ${file.name}`}
                  className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
                {confirmDelete === file.name ? (
                  <button
                    onClick={() =>
                      void act(async () => {
                        setConfirmDelete(null)
                        if (selected === file.name) {
                          current.current = null
                          setSelected(null)
                          setDetails(null)
                        }
                        await window.api.deleteSchematic(versionId, file.name)
                      })
                    }
                    onBlur={() => setConfirmDelete(null)}
                    className="rounded-md bg-red-500/30 px-2 py-0.5 text-xs text-red-100 hover:bg-red-500/50"
                  >
                    移到回收站
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(file.name)}
                    title="删除"
                    aria-label={`删除 ${file.name}`}
                    className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {list?.truncated && <div className="px-1 text-xs text-white/40">文件太多，只列出了前 500 个</div>}
        </div>

        {/* 材料清单 */}
        <div
          className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/5 p-4"
          data-testid="schematic-details"
        >
          {!selected ? (
            <div className="m-auto text-sm text-white/40">点左边的投影查看材料清单</div>
          ) : detailsLoading ? (
            <div className="m-auto flex items-center gap-2 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取…
            </div>
          ) : detailsError ? (
            <div className="m-auto max-w-sm text-center text-sm text-white/50">{detailsError}</div>
          ) : details ? (
            <>
              <div className="flex shrink-0 gap-3">
                {details.preview && (
                  <img src={details.preview} alt="预览" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{details.title || details.name}</div>
                  <div className="text-xs text-white/50">
                    {[
                      details.author && `作者 ${details.author}`,
                      details.size && `大小 ${dimsText(details.size)}`,
                      `${details.regions} 个区域`,
                      `${(details.totalBlocks || details.materials.reduce((n, m) => n + m.count, 0)).toLocaleString()} 个方块`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {details.description && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-white/40">{details.description}</div>
                  )}
                </div>
              </div>
              {!details.counted ? (
                <div className="mt-3 text-sm text-white/50">投影太大，没有统计材料清单</div>
              ) : (
                <>
                  <div className="mt-3 flex shrink-0 items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                      <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="搜索材料"
                        aria-label="搜索材料"
                        className="w-full rounded-lg border border-white/10 bg-black/20 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-emerald-400/50"
                      />
                    </div>
                    <button onClick={copyList} className={button} disabled={details.materials.length === 0}>
                      {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <ClipboardCopy className="h-4 w-4" />}
                      {copied ? '已复制' : '复制清单'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-white/40">共 {details.materials.length} 种材料</div>
                  <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {materials.map((m) => (
                          <tr key={m.id} className="border-b border-white/5" data-testid="material-row">
                            <td className="py-1.5 pr-2">
                              <div className="truncate">{m.name || m.id}</div>
                              {m.name && <div className="truncate font-mono text-[11px] text-white/40">{m.id}</div>}
                            </td>
                            <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                              <div className="font-medium">{m.count.toLocaleString()}</div>
                              <div className="text-[11px] text-white/40">{stackText(m.count)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default SchematicsPanel
