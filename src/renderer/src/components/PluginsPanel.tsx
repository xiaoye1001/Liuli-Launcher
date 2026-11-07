import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import type { PluginInfo, PluginPending, PluginUpdate } from '../../../shared/types'
import { PERMISSION_TEXT, onDroppedPlugin, takeDroppedPlugin } from '../utils/plugins'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 权限列表（安装确认和插件详情共用）；before 是更新前的权限，新增的权限和网站会标出来 */
function PermissionList({
  plugin,
  before
}: {
  plugin: Pick<PluginInfo, 'permissions' | 'hosts'>
  before?: Pick<PluginInfo, 'permissions' | 'hosts'> | null
}): JSX.Element {
  if (plugin.permissions.length === 0) {
    return <div className="text-xs text-white/50">不需要任何权限（只能显示自己的页面、保存自己的数据）</div>
  }
  return (
    <ul className="space-y-1" data-testid="plugin-permissions">
      {plugin.permissions.map((p) => {
        const t = PERMISSION_TEXT[p]
        return (
          <li key={p} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.risky ? 'bg-amber-300' : 'bg-emerald-300'}`}
            />
            <span>
              <span className="font-medium text-white/85">{t.title}</span>
              {before && !before.permissions.includes(p) && (
                <span className="ml-1 rounded bg-amber-500/30 px-1 text-[10px] text-amber-100">新增</span>
              )}
              <span className="text-white/50">：{t.desc}</span>
              {p === 'network' && (
                <span className="ml-1 font-mono text-amber-200">
                  {plugin.hosts.map((h) => (before && !before.hosts.includes(h) ? `${h}（新增）` : h)).join('、')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** 插件管理：安装（先看权限再确认）、启用 / 停用、清除数据、卸载 */
function PluginsPanel({ onOpen }: { onOpen?: (id: string) => void }): JSX.Element {
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const [pending, setPending] = useState<PluginPending | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState('')
  /** 有新版本的插件（插件 id → 新版本） */
  const [updates, setUpdates] = useState<Record<string, PluginUpdate>>({})

  // 打开时看看有没有更新（一天最多真的联网查一次）
  useEffect(() => {
    void window.api
      .checkPluginUpdates()
      .then(setUpdates)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const load = (): void =>
      void window.api
        .listPlugins()
        .then(setPlugins)
        .catch((e) => setError(cleanError(e)))
    load()
    return window.api.onPluginsChanged(load)
  }, [])

  // 拖进窗口的插件：显示安装确认（还没确认的上一个丢掉）
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => {
    const take = (): void => {
      const dropped = takeDroppedPlugin()
      if (!dropped) return
      const old = pendingRef.current
      if (old && old.token !== dropped.token) void window.api.discardPlugin(old.token)
      setError('')
      setNotice('')
      setPending(dropped)
    }
    take()
    return onDroppedPlugin(take)
  }, [])

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
    }
  }

  const askConfirm = (key: string): boolean => {
    if (confirm === key) {
      setConfirm('')
      return true
    }
    setConfirm(key)
    setTimeout(() => setConfirm((c) => (c === key ? '' : c)), 3000)
    return false
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-violet-300" />
          <span className="font-semibold">插件</span>
          <button
            onClick={() =>
              void run('pick', async () => {
                const p = await window.api.pickPlugin()
                if (p) setPending(p)
              })
            }
            disabled={!!busy}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === 'pick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            安装插件
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span data-testid="plugin-update-summary">
            {Object.keys(updates).length > 0
              ? `${Object.keys(updates).length} 个插件有新版本`
              : '写了更新地址的插件，启动器每天会帮你看一次有没有新版本'}
          </span>
          <button
            onClick={() =>
              void run('check', async () => {
                const next = await window.api.checkPluginUpdates(true)
                setUpdates(next)
                return Object.keys(next).length ? '' : '插件都是最新的'
              })
            }
            disabled={!!busy}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === 'check' ? 'animate-spin' : ''}`} />
            检查更新
          </button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-white/50">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          {
            '插件是一个 .zip 文件，运行在隔离的沙箱里：碰不到你的账号、登录令牌、密钥和电脑上的文件，只能使用安装时你同意的权限。只安装你信任的人做的插件'
          }
        </p>
        {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        {notice && <div className="text-xs text-emerald-300">{notice}</div>}
      </section>

      {/* 安装确认 */}
      {pending && (
        <section
          className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 shadow-xl backdrop-blur-xl"
          data-testid="plugin-confirm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <span className="font-semibold">
              {pending.update ? '更新插件' : '安装插件'}「{pending.manifest.name}」
            </span>
            <span className="text-xs text-white/50">
              v{pending.manifest.version}
              {pending.update && `（现在是 v${pending.update.version}）`}
              {pending.manifest.author && ` · ${pending.manifest.author}`}
            </span>
          </div>
          {pending.manifest.description && <div className="text-sm text-white/70">{pending.manifest.description}</div>}
          {pending.manifest.widget && (
            <div className="text-xs text-white/60">带一个主页小组件，装好后显示在主页上（可以在这里关掉）</div>
          )}
          {pending.update && updates[pending.manifest.id]?.notes && (
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/20 px-3 py-2 text-xs text-white/60">
              {updates[pending.manifest.id].notes}
            </div>
          )}
          <div className="text-xs font-medium text-white/80">它需要这些权限：</div>
          <PermissionList plugin={pending.manifest} before={pending.update} />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                const token = pending.token
                setPending(null)
                void window.api.discardPlugin(token)
              }}
              className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              取消
            </button>
            <button
              onClick={() =>
                void run('install', async () => {
                  const p = pending
                  setPending(null)
                  setPlugins(await window.api.installPlugin(p.token))
                  setUpdates((u) => {
                    const { [p.manifest.id]: _, ...rest } = u
                    return rest
                  })
                  return `已${p.update ? '更新' : '安装'}「${p.manifest.name}」，在「插件」里打开`
                })
              }
              disabled={!!busy}
              className="flex items-center gap-1 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              同意并{pending.update ? '更新' : '安装'}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="text-sm font-medium text-white/80">已安装的插件</div>
        {!plugins ? (
          <Loader2 className="h-4 w-4 animate-spin text-white/50" />
        ) : plugins.length === 0 ? (
          <div className="text-xs text-white/50">还没有插件</div>
        ) : (
          plugins.map((p) => (
            <div key={p.id} className="space-y-2 rounded-xl bg-black/20 p-3" data-testid="plugin-row">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`font-medium ${p.enabled ? '' : 'text-white/40'}`}>{p.name}</span>
                <span className="text-xs text-white/40">
                  v{p.version}
                  {p.author && ` · ${p.author}`} · {p.id}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {updates[p.id] && (
                    <span className="flex items-center gap-1.5" data-testid="plugin-update">
                      <span className="text-xs text-emerald-300">有新版本 v{updates[p.id].version}</span>
                      {updates[p.id].download ? (
                        <button
                          onClick={() =>
                            void run(`update:${p.id}`, async () => {
                              const next = await window.api.preparePluginUpdate(p.id)
                              const old = pendingRef.current
                              if (old && old.token !== next.token) void window.api.discardPlugin(old.token)
                              setPending(next)
                            })
                          }
                          disabled={!!busy}
                          aria-label={`更新 ${p.name}`}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/70 px-2.5 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {busy === `update:${p.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="h-3.5 w-3.5" />
                          )}
                          更新
                        </button>
                      ) : (
                        <a
                          href={updates[p.id].page}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
                        >
                          去发布页面
                        </a>
                      )}
                    </span>
                  )}
                  {p.enabled && !p.error && onOpen && (
                    <button
                      onClick={() => onOpen(p.id)}
                      className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
                    >
                      打开
                    </button>
                  )}
                  {p.widget && (
                    <label className="flex items-center gap-1 text-xs text-white/60" title="把插件的小组件显示在主页上">
                      <input
                        type="checkbox"
                        checked={p.widgetShown}
                        disabled={!p.enabled || !!p.error || !!busy}
                        onChange={(e) =>
                          void run(`widget:${p.id}`, async () => {
                            setPlugins(await window.api.setPluginWidgetShown(p.id, e.target.checked))
                          })
                        }
                        aria-label={`在主页显示 ${p.name}`}
                        className="accent-emerald-500"
                      />
                      主页小组件
                    </label>
                  )}
                  <label className="flex items-center gap-1 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      disabled={!!p.error || !!busy}
                      onChange={(e) =>
                        void run(`toggle:${p.id}`, async () => {
                          setPlugins(await window.api.setPluginEnabled(p.id, e.target.checked))
                        })
                      }
                      aria-label={`启用 ${p.name}`}
                      className="accent-emerald-500"
                    />
                    启用
                  </label>
                  <button
                    onClick={() =>
                      askConfirm(`clear:${p.id}`) &&
                      void run(`clear:${p.id}`, async () => {
                        await window.api.clearPluginData(p.id)
                        return `已清除「${p.name}」保存的数据`
                      })
                    }
                    className={`rounded-lg px-2 py-1 text-xs ${confirm === `clear:${p.id}` ? 'bg-amber-500/80 text-white' : 'text-white/50 hover:bg-white/10'}`}
                  >
                    {confirm === `clear:${p.id}` ? '确认清除？' : '清除数据'}
                  </button>
                  <button
                    onClick={() =>
                      askConfirm(`rm:${p.id}`) &&
                      void run(`rm:${p.id}`, async () => {
                        setPlugins(await window.api.uninstallPlugin(p.id))
                        return `已卸载「${p.name}」`
                      })
                    }
                    aria-label={`卸载 ${p.name}`}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${confirm === `rm:${p.id}` ? 'bg-red-500/80 text-white' : 'text-white/50 hover:bg-red-500/30'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirm === `rm:${p.id}` && '确认卸载？'}
                  </button>
                </div>
              </div>
              {p.error ? (
                <div className="text-xs text-red-300">{p.error}</div>
              ) : (
                <>
                  {p.description && <div className="text-xs text-white/60">{p.description}</div>}
                  <PermissionList plugin={p} />
                </>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

export default PluginsPanel
