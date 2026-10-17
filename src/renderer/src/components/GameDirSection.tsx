import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Box,
  Check,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  X,
  XCircle
} from 'lucide-react'
import type { GameDirInfo, GameDirSummary } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const iconButton =
  'rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent'

/** 一个游戏目录：名字、路径、版本数量，以及切换、重命名、打开、移除 */
function DirRow({
  dir,
  busy,
  onUse,
  onRename,
  onOpen,
  onRemove
}: {
  dir: GameDirSummary
  busy: boolean
  onUse: () => void
  onRename: (name: string) => Promise<void>
  onOpen: () => void
  onRemove: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(dir.name)

  const submit = async (): Promise<void> => {
    if (!name.trim()) return
    await onRename(name)
    setEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
        dir.current ? 'bg-emerald-500/15 ring-1 ring-emerald-400/30' : 'bg-black/20'
      }`}
    >
      <FolderOpen className={`h-5 w-5 shrink-0 ${dir.current ? 'text-emerald-300' : 'text-white/40'}`} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              maxLength={32}
              aria-label="目录名字"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-1 text-sm outline-none focus:border-emerald-400/50"
            />
            <button onClick={submit} disabled={!name.trim()} title="保存" className={iconButton}>
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setEditing(false)} title="取消" className={iconButton}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{dir.name}</span>
            {dir.current && (
              <span className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">使用中</span>
            )}
            {dir.isDefault && (
              <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/60">默认</span>
            )}
            {dir.isOfficial && (
              <span className="shrink-0 rounded-md bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">官方启动器</span>
            )}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-white/50">
          <span className="min-w-0 truncate font-mono" title={dir.path}>
            {dir.path}
          </span>
          <span className="shrink-0">
            {dir.exists ? `· ${dir.versionCount} 个版本` : <span className="text-amber-300">· 找不到文件夹</span>}
          </span>
        </div>
      </div>
      {!editing && (
        <div className="flex shrink-0 items-center gap-1">
          {!dir.current && (
            <button
              onClick={onUse}
              disabled={busy}
              className="mr-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            >
              使用
            </button>
          )}
          <button
            onClick={() => {
              setName(dir.name)
              setEditing(true)
            }}
            title="重命名"
            className={iconButton}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onOpen} disabled={!dir.exists} title="在文件管理器中打开" className={iconButton}>
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={onRemove}
            disabled={busy || dir.current || dir.isDefault}
            title={
              dir.current
                ? '正在使用的目录不能移除'
                : dir.isDefault
                  ? '默认目录不能移除'
                  : '从列表中移除（不会删除文件夹里的文件）'
            }
            className={iconButton}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/** 设置页的「游戏目录」：可以添加多个 .minecraft 文件夹并在它们之间切换 */
function GameDirSection({ onChanged }: { onChanged: () => void }): JSX.Element {
  const [info, setInfo] = useState<GameDirInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    window.api
      .getGameDirInfo()
      .then(setInfo)
      .catch((e) => setError(cleanError(e)))
  }, [])

  /** 执行操作，统一处理加载状态与错误；切换了目录时通知设置页刷新 */
  const run = async (action: () => Promise<GameDirInfo | null | void>, message?: string): Promise<void> => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const before = info?.path
      const next = await action()
      if (next) {
        setInfo(next)
        if (next.path !== before) {
          onChanged()
          const current = next.dirs.find((d) => d.current)
          setNotice(`已切换到「${current?.name ?? next.path}」`)
        } else if (message) {
          setNotice(message)
        }
      }
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const officialListed = info?.dirs.some((d) => d.isOfficial)

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <FolderOpen className="h-5 w-5 text-sky-300" />
        <div>
          <h2 className="text-lg font-semibold">游戏目录</h2>
          <p className="text-xs text-white/50">
            游戏版本、存档、资源包等文件的存放位置（.minecraft 文件夹）。可以添加多个目录并随时切换
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {!info && !error && (
          <div className="flex items-center gap-2 py-3 text-xs text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取…
          </div>
        )}
        {info?.dirs.map((dir) => (
          <DirRow
            key={dir.path}
            dir={dir}
            busy={busy}
            onUse={() => run(() => window.api.setGameDir(dir.path))}
            onRename={(name) => run(() => window.api.renameGameDir(dir.path, name))}
            onOpen={() => window.api.openGameDir(dir.path).catch((e) => setError(cleanError(e)))}
            onRemove={() =>
              run(() => window.api.removeGameDir(dir.path), `已从列表中移除「${dir.name}」，文件夹里的文件没有删除`)
            }
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => run(() => window.api.pickGameDir())}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
          添加文件夹...
        </motion.button>
        {info?.officialExists && !officialListed && (
          <button
            onClick={() => run(() => window.api.setGameDir(info.officialDir))}
            disabled={busy}
            title={info.officialDir}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            <Box className="h-4 w-4" />
            添加官方启动器目录
          </button>
        )}
      </div>

      {notice && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
    </section>
  )
}

export default GameDirSection
