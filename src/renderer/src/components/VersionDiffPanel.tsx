import { useEffect, useState } from 'react'
import { ArrowRight, FileDiff, Loader2, Minus, Pencil, Plus } from 'lucide-react'
import type { InstalledVersion, VersionDiff, VersionDiffMod } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SELECT =
  'min-w-[10rem] rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none focus:border-emerald-400/50'

function ModLine({ mod }: { mod: VersionDiffMod }): JSX.Element {
  return (
    <span className="min-w-0 truncate">
      {mod.name}
      {mod.version && <span className="ml-1 text-xs text-white/50">{mod.version}</span>}
      {!mod.enabled && <span className="ml-1 text-xs text-amber-300">（已禁用）</span>}
    </span>
  )
}

function Group({
  icon: Icon,
  tint,
  title,
  count,
  children
}: {
  icon: typeof Plus
  tint: string
  title: string
  count: number
  children: React.ReactNode
}): JSX.Element | null {
  if (count === 0) return null
  return (
    <div className="space-y-1" data-testid={`diff-${title}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${tint}`}>
        <Icon className="h-3.5 w-3.5" />
        {title}（{count}）
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">{children}</div>
    </div>
  )
}

/** 版本差异对比：两个版本的模组和配置文件有什么不同 */
function VersionDiffPanel(): JSX.Element {
  const [versions, setVersions] = useState<InstalledVersion[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.getInstalledVersions().then((list) => {
      const modded = list.filter((v) => v.loader && v.loader !== 'optifine')
      const pool = modded.length >= 2 ? modded : list
      setVersions(list)
      setA(pool[0]?.id ?? '')
      setB(pool[1]?.id ?? '')
    })
  }, [])

  const compare = async (): Promise<void> => {
    setBusy(true)
    setError('')
    setDiff(null)
    try {
      setDiff(await window.api.compareVersions(a, b))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const row = 'flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-sm'
  const total = diff
    ? diff.mods.added.length +
      diff.mods.removed.length +
      diff.mods.changed.length +
      diff.configs.added.length +
      diff.configs.removed.length +
      diff.configs.changed.length
    : 0

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 font-semibold">
          <FileDiff className="h-4 w-4 text-sky-300" />
          版本差异对比
        </div>
        <p className="text-xs text-white/50">
          {
            '比较两个版本的模组（加了、删了、换了版本）和配置文件（config、defaultconfigs、kubejs、游戏设置）。整合包更新前先复制一份版本，更新后对比，就知道这次改了什么'
          }
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-white/50">
            原来的版本
            <select value={a} onChange={(e) => setA(e.target.value)} aria-label="原来的版本" className={SELECT}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight className="mb-2 h-4 w-4 text-white/40" />
          <label className="flex flex-col gap-1 text-xs text-white/50">
            新的版本
            <select value={b} onChange={(e) => setB(e.target.value)} aria-label="新的版本" className={SELECT}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => void compare()}
            disabled={busy || !a || !b || a === b}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDiff className="h-4 w-4" />}
            开始对比
          </button>
        </div>
        {error && <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
      </section>

      {diff && (
        <section
          className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur-xl"
          data-testid="diff-result"
        >
          <div className="text-sm">
            <b>{diff.a.id}</b>
            <span className="text-white/50">
              （{diff.a.minecraftVersion}
              {diff.a.loader ? ` · ${diff.a.loader}` : ''} · {diff.a.mods} 个模组）
            </span>
            <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-white/40" />
            <b>{diff.b.id}</b>
            <span className="text-white/50">
              （{diff.b.minecraftVersion}
              {diff.b.loader ? ` · ${diff.b.loader}` : ''} · {diff.b.mods} 个模组）
            </span>
          </div>
          {diff.sameFolder && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              这两个版本用的是同一个模组和配置文件夹（都没有开版本隔离），所以没有差别
            </div>
          )}
          {total === 0 && !diff.sameFolder && <div className="text-sm text-white/60">两个版本的模组和配置完全一样</div>}
          {total > 0 && (
            <div className="text-xs text-white/50">
              {`模组：新增 ${diff.mods.added.length}、删除 ${diff.mods.removed.length}、变化 ${diff.mods.changed.length}、相同 ${diff.mods.same}；配置文件：新增 ${diff.configs.added.length}、删除 ${diff.configs.removed.length}、修改 ${diff.configs.changed.length}`}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Group icon={Plus} tint="text-emerald-300" title="新增的模组" count={diff.mods.added.length}>
                {diff.mods.added.map((m) => (
                  <div key={m.fileName} className={row}>
                    <ModLine mod={m} />
                  </div>
                ))}
              </Group>
              <Group icon={Minus} tint="text-rose-300" title="删除的模组" count={diff.mods.removed.length}>
                {diff.mods.removed.map((m) => (
                  <div key={m.fileName} className={row}>
                    <ModLine mod={m} />
                  </div>
                ))}
              </Group>
              <Group icon={Pencil} tint="text-sky-300" title="有变化的模组" count={diff.mods.changed.length}>
                {diff.mods.changed.map((c) => (
                  <div key={c.to.fileName} className={`${row} flex-wrap`}>
                    <span className="truncate">{c.to.name}</span>
                    <span className="text-xs text-white/50">
                      {c.from.version || '—'}
                      {!c.from.enabled && '（禁用）'} → {c.to.version || '—'}
                      {!c.to.enabled && '（禁用）'}
                    </span>
                  </div>
                ))}
              </Group>
            </div>
            <div className="space-y-3">
              {(
                [
                  ['新增的配置文件', diff.configs.added, Plus, 'text-emerald-300'],
                  ['删除的配置文件', diff.configs.removed, Minus, 'text-rose-300'],
                  ['修改过的配置文件', diff.configs.changed, Pencil, 'text-sky-300']
                ] as const
              ).map(([title, files, icon, tint]) => (
                <Group key={title} icon={icon} tint={tint} title={title} count={files.length}>
                  {files.map((f) => (
                    <div key={f} className={`${row} font-mono text-xs`}>
                      <span className="truncate" title={f}>
                        {f}
                      </span>
                    </div>
                  ))}
                </Group>
              ))}
            </div>
          </div>
          {diff.truncated && <div className="text-xs text-white/40">配置文件太多，只比较了前 4000 个</div>}
        </section>
      )}
    </div>
  )
}

export default VersionDiffPanel
