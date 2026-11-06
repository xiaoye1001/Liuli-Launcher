import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronDown, Loader2, Play, SearchCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import type { GameStatus, ModBisectState } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 模组二分排查：每轮只开一半可疑的模组，玩家进游戏试，几轮后找到出问题的模组 */
function ModBisectDialog({
  versionId,
  onClose,
  onChanged
}: {
  versionId: string
  onClose: () => void
  /** 模组开关变了：刷新模组列表 */
  onChanged: () => void
}): JSX.Element {
  const [state, setState] = useState<ModBisectState | null | undefined>(undefined)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [game, setGame] = useState<GameStatus | null>(null)
  const [showList, setShowList] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = busy ? () => undefined : onClose

  const refresh = useCallback(async () => {
    try {
      setState(await window.api.getModBisect(versionId))
    } catch (e) {
      setError(cleanError(e))
      setState(null)
    }
  }, [versionId])

  useEffect(() => {
    void refresh()
    window.api.getGameStatus().then(setGame)
    return window.api.onGameStatus(setGame)
  }, [refresh])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
      onChanged()
    }
  }

  const playing = game?.versionId === versionId && (game.state === 'launching' || game.state === 'running')
  const crashed = game?.versionId === versionId && game.state === 'crashed'

  const primary =
    'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50'
  const secondary =
    'flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => closeRef.current()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-label="模组二分排查"
        className="flex max-h-[85vh] w-[32rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 popover-background p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 font-semibold">
          <SearchCheck className="h-4 w-4 text-sky-300" />
          <span className="flex-1">模组二分排查</span>
          <button
            onClick={() => closeRef.current()}
            disabled={!!busy}
            title="关闭（排查进度会保留）"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto" data-testid="bisect">
          {state === undefined && (
            <div className="flex justify-center py-6 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {state === null && (
            <div className="space-y-3 text-sm">
              <p className="leading-6 text-white/70">
                {
                  '游戏崩溃或出问题，又不知道是哪个模组？每轮只启用一半可疑的模组，你进游戏试一下，告诉启动器问题还在不在，可疑范围每轮减半。几十个模组一般 5～7 轮就能找到。'
                }
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-white/50">
                <li>开始前会记下现在哪些模组是开着的，结束或中途退出时自动恢复</li>
                <li>某个模组需要的前置被关掉时，会自动把前置一起打开，避免因为缺前置而崩溃</li>
                <li>如果问题是两个模组一起才会出现，结果可能不准</li>
              </ul>
              <button
                onClick={() =>
                  void run('start', async () => {
                    setState(await window.api.startModBisect(versionId))
                  })
                }
                disabled={!!busy || playing}
                className={`${primary} w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white`}
              >
                {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                开始排查
              </button>
            </div>
          )}

          {state?.found && (
            <div className="space-y-3 text-sm" data-testid="bisect-found">
              <div className="rounded-xl bg-emerald-500/15 px-4 py-3">
                <div className="text-xs text-emerald-200/80">第 {state.round - 1} 轮找到了，出问题的模组很可能是：</div>
                <div className="mt-1 text-base font-semibold text-emerald-100">{state.found.name}</div>
                <div className="font-mono text-xs text-white/50">{state.found.fileName}</div>
              </div>
              <p className="text-xs text-white/50">
                模组已经恢复成排查前的样子。可以禁用它，或者去下载页找它的新版本 / 换一个版本试试
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    void run('finish', async () => {
                      await window.api.finishModBisect(versionId, true)
                      setState(null)
                      onClose()
                    })
                  }
                  disabled={!!busy || playing}
                  className={`${primary} bg-emerald-500/80 text-white hover:bg-emerald-500`}
                >
                  禁用这个模组
                </button>
                <button
                  onClick={() =>
                    void run('finish', async () => {
                      await window.api.finishModBisect(versionId, false)
                      setState(null)
                      onClose()
                    })
                  }
                  disabled={!!busy || playing}
                  className={secondary}
                >
                  保持原样
                </button>
              </div>
            </div>
          )}

          {state?.stuck && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-amber-200">
                剩下的 {state.suspects.length} 个模组互相依赖，没法再缩小范围了。问题出在它们之中：
                <div className="mt-1 text-xs text-white/60">{state.suspects.map((s) => s.name).join('、')}</div>
              </div>
              <button
                onClick={() =>
                  void run('finish', async () => {
                    await window.api.finishModBisect(versionId, false)
                    setState(null)
                    onClose()
                  })
                }
                disabled={!!busy || playing}
                className={`${secondary} w-full`}
              >
                结束并恢复
              </button>
            </div>
          )}

          {state && !state.found && !state.stuck && (
            <div className="space-y-3 text-sm" data-testid="bisect-round">
              <div className="rounded-xl bg-white/5 px-4 py-3">
                <div className="font-medium">第 {state.round} 轮</div>
                <div className="mt-0.5 text-xs text-white/60">
                  {`还有 ${state.suspects.length} 个可疑模组，这一轮启用了其中 ${state.testing.length} 个（其余暂时关闭），最多还要 ${state.roundsLeft} 轮`}
                </div>
                <button
                  onClick={() => setShowList((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 text-xs text-sky-300 hover:underline"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${showList ? 'rotate-180' : ''}`} />
                  这一轮启用的模组
                </button>
                {showList && (
                  <div className="mt-1 max-h-32 overflow-y-auto text-xs text-white/60">
                    {state.testing.map((t) => t.name).join('、')}
                  </div>
                )}
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-white/60">
                <li>点「启动游戏测试」，用会出问题的方式玩一下（进存档、做会崩溃的操作）</li>
                <li>退出游戏后，回来告诉启动器问题还在不在</li>
              </ol>
              <button
                onClick={() => void run('launch', () => window.api.launchGame(versionId))}
                disabled={!!busy || playing}
                className={`${secondary} w-full`}
              >
                {playing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {playing ? '游戏正在运行，退出游戏后回答' : '启动游戏测试'}
              </button>
              {crashed && (
                <div className="text-xs text-amber-300">
                  最近一次启动是崩溃退出的（如果是这一轮测试的，选「问题还在」）
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    void run('bad', async () => {
                      setState(await window.api.answerModBisect(versionId, 'bad'))
                    })
                  }
                  disabled={!!busy || playing}
                  className={`${primary} bg-rose-500/80 text-white hover:bg-rose-500`}
                >
                  {busy === 'bad' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
                  问题还在
                </button>
                <button
                  onClick={() =>
                    void run('good', async () => {
                      setState(await window.api.answerModBisect(versionId, 'good'))
                    })
                  }
                  disabled={!!busy || playing}
                  className={`${primary} bg-emerald-500/80 text-white hover:bg-emerald-500`}
                >
                  {busy === 'good' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                  问题消失了
                </button>
              </div>
              <button
                onClick={() =>
                  void run('finish', async () => {
                    await window.api.finishModBisect(versionId, false)
                    setState(null)
                  })
                }
                disabled={!!busy || playing}
                className="w-full text-center text-xs text-white/50 hover:text-white"
              >
                退出排查并恢复所有模组
              </button>
            </div>
          )}
        </div>

        {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
        {state && !state.found && !state.stuck && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-white/40">
            <CheckCircle2 className="h-3 w-3" />
            关掉这个窗口不会丢失进度，下次打开继续
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default ModBisectDialog
