import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Download, FileArchive, Loader2, Package, Plus, Trash2, Undo2 } from 'lucide-react'
import type { InstalledVersion, ServerAddonFile, ServerAddonKind, ServerAddons } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function sizeText(n: number): string {
  if (n <= 0) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 一键开服：数据包、Fabric 服务端和服务端模组 */
function ServerAddonsPanel({
  serverId,
  version,
  running,
  installed
}: {
  serverId: string
  version: string
  running: boolean
  installed: InstalledVersion[]
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [addons, setAddons] = useState<ServerAddons | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState('')
  const fabricVersions = installed.filter(
    (v) => (v.loader === 'fabric' || v.loader === 'quilt') && v.minecraftVersion === version
  )
  const [importFrom, setImportFrom] = useState('')

  const load = useCallback(async () => {
    setAddons(await window.api.listServerAddons(serverId))
  }, [serverId])

  useEffect(() => {
    if (open) void load().catch((e) => setError(cleanError(e)))
  }, [open, load])

  useEffect(() => {
    if (!importFrom && fabricVersions[0]) setImportFrom(fabricVersions[0].id)
  }, [importFrom, fabricVersions])

  const run = async (key: string, action: () => Promise<string | void>): Promise<void> => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const message = await action()
      if (message) setNotice(message)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
      void load().catch(() => undefined)
    }
  }

  /** 删除要点两下 */
  const askConfirm = (key: string): boolean => {
    if (confirm === key) {
      setConfirm('')
      return true
    }
    setConfirm(key)
    setTimeout(() => setConfirm((c) => (c === key ? '' : c)), 3000)
    return false
  }

  const add = (kind: ServerAddonKind): Promise<void> =>
    run(`add:${kind}`, async () => {
      const r = await window.api.addServerAddons(serverId, kind)
      if (r.added.length === 0 && r.skipped.length === 0) return
      const parts: string[] = []
      if (r.added.length) parts.push(`已添加 ${r.added.length} 个，下次启动服务器生效`)
      if (r.skipped.length) parts.push(`没有添加：${r.skipped.join('；')}`)
      if (r.added.length === 0) throw new Error(parts.join('。'))
      return parts.join('。')
    })

  const list = (kind: ServerAddonKind, files: ServerAddonFile[]): JSX.Element => (
    <div className="space-y-1">
      {files.map((f) => {
        const key = `${kind}:${f.fileName}`
        return (
          <div key={f.fileName} data-testid={`server-${kind}`} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={f.enabled}
              disabled={running || f.folder || !!busy}
              onChange={(e) =>
                void run(`toggle:${key}`, () =>
                  window.api.setServerAddonEnabled(serverId, kind, f.fileName, e.target.checked)
                )
              }
              title={f.folder ? '文件夹形式的数据包不能停用' : f.enabled ? '停用' : '启用'}
              aria-label={`启用 ${f.name}`}
              className="accent-emerald-500"
            />
            <span className={`min-w-0 flex-1 truncate ${f.enabled ? '' : 'text-white/40 line-through'}`}>
              {f.name}
              {f.folder && <span className="ml-1 text-white/40">（文件夹）</span>}
            </span>
            <span className="shrink-0 text-white/40">{sizeText(f.size)}</span>
            <button
              onClick={() =>
                askConfirm(`rm:${key}`) &&
                void run(`rm:${key}`, async () => {
                  await window.api.removeServerAddon(serverId, kind, f.fileName)
                  return `已把 ${f.name} 移到回收站`
                })
              }
              disabled={running || !!busy}
              aria-label={`删除 ${f.name}`}
              className={`flex shrink-0 items-center gap-1 rounded p-1 disabled:opacity-40 ${
                confirm === `rm:${key}` ? 'bg-red-500/80 px-1.5 text-white' : 'text-white/50 hover:bg-red-500/30'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirm === `rm:${key}` && '确认删除？'}
            </button>
          </div>
        )
      })}
    </div>
  )

  const button =
    'flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50'

  return (
    <div className="mt-3" data-testid="server-addons">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        数据包和模组
        {addons && (
          <span className="text-white/40">
            {addons.loader ? `Fabric ${addons.loader.version}` : '原版'} · {addons.datapacks.length} 个数据包
            {addons.loader && ` · ${addons.mods.length} 个模组`}
          </span>
        )}
      </button>
      {open && addons && (
        <div className="mt-2 space-y-3 rounded-lg border border-white/10 p-3">
          {running && <div className="text-xs text-amber-200">服务器正在运行，先停止才能修改</div>}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileArchive className="h-4 w-4 text-sky-300" />
              <span className="font-medium">数据包</span>
              <span className="text-xs text-white/40">{`存档 ${addons.world} 的 datapacks 文件夹`}</span>
              <button onClick={() => void add('datapack')} disabled={running || !!busy} className={`ml-auto ${button}`}>
                {busy === 'add:datapack' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                添加数据包
              </button>
            </div>
            {addons.datapacks.length === 0 ? (
              <div className="text-xs text-white/50">还没有数据包。选 .zip 文件添加（根目录里要有 pack.mcmeta）</div>
            ) : (
              list('datapack', addons.datapacks)
            )}
            {!addons.worldExists && (
              <div className="text-xs text-white/40">存档还没有生成，第一次启动服务器时会一起加载</div>
            )}
          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-violet-300" />
              <span className="font-medium">Fabric 服务端和模组</span>
              {addons.loader && (
                <button
                  onClick={() =>
                    askConfirm('unfabric') &&
                    void run('unfabric', async () => {
                      await window.api.removeFabricServer(serverId)
                      return '已换回原版服务端（mods 文件夹还在，原版不会加载）'
                    })
                  }
                  disabled={running || !!busy}
                  className={`ml-auto ${confirm === 'unfabric' ? 'flex items-center gap-1.5 rounded-lg bg-red-500/80 px-2.5 py-1 text-xs text-white' : button}`}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {confirm === 'unfabric' ? '确认换回原版？' : '换回原版'}
                </button>
              )}
            </div>
            {!addons.loader ? (
              <div className="space-y-2 text-xs">
                <div className="text-white/50">
                  {
                    '想在服务器上装模组，先装 Fabric 服务端（从 Fabric 官方下载，用这个文件夹里的原版服务端启动）。第一次启动时它会下载需要的文件，要多等一会儿'
                  }
                </div>
                <button
                  onClick={() =>
                    void run('fabric', async () => {
                      const r = await window.api.installFabricServer(serverId)
                      return `已装好 Fabric ${r.loader}，现在可以添加模组了`
                    })
                  }
                  disabled={running || !!busy}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-500/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {busy === 'fabric' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  装 Fabric 服务端
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button onClick={() => void add('mod')} disabled={running || !!busy} className={button}>
                    {busy === 'add:mod' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    添加模组
                  </button>
                  {fabricVersions.length > 0 && (
                    <>
                      <span className="text-white/50">或者从</span>
                      <select
                        value={importFrom}
                        onChange={(e) => setImportFrom(e.target.value)}
                        aria-label="从哪个版本导入模组"
                        className="rounded-lg border border-white/15 bg-black/20 px-2 py-1 outline-none"
                      >
                        {fabricVersions.map((v) => (
                          <option key={v.id} value={v.id} className="bg-slate-800 text-white">
                            {v.id}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          void run('import', async () => {
                            const r = await window.api.importServerMods(serverId, importFrom)
                            const parts = [`导入了 ${r.copied.length} 个模组`]
                            if (r.clientOnly.length) parts.push(`跳过 ${r.clientOnly.length} 个只能在客户端用的`)
                            if (r.existing.length) parts.push(`${r.existing.length} 个已经有了`)
                            if (r.invalid.length) parts.push(`${r.invalid.length} 个不是 Fabric 模组`)
                            return parts.join('，')
                          })
                        }
                        disabled={running || !!busy || !importFrom}
                        className={button}
                      >
                        {busy === 'import' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        导入模组
                      </button>
                    </>
                  )}
                </div>
                {addons.mods.length === 0 ? (
                  <div className="text-xs text-white/50">还没有模组</div>
                ) : (
                  list('mod', addons.mods)
                )}
                <div className="text-xs text-white/40">
                  {'大多数模组需要 Fabric API，记得一起装；只能在客户端用的模组（例如小地图、光影）不用装到服务器'}
                </div>
              </>
            )}
          </div>
          {notice && <div className="text-xs text-emerald-300">{notice}</div>}
          {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        </div>
      )}
      {open && !addons && !error && <Loader2 className="mt-2 h-4 w-4 animate-spin text-white/50" />}
      {open && !addons && error && <div className="mt-2 text-xs text-red-300">{error}</div>}
    </div>
  )
}

export default ServerAddonsPanel
