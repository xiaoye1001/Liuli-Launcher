import { useEffect, useRef, useState } from 'react'
import { Check, FolderPlus, Loader2, Pencil, Plus, Shirt, Trash2 } from 'lucide-react'
import type { AppSettings, MsSkinProfile, SkinModel, WardrobeSkin } from '../../../shared/types'

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 读取皮肤文件（PNG），尺寸和大小由主进程检查 */
function readPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'image/png') {
      reject(new Error('皮肤必须是 PNG 图片'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

/** 皮肤正面的平面预览：头、身体、手臂、腿（含外层） */
function SkinFront({ image, model }: { image: string; model: SkinModel }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!alive || !ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 16, 32)
      const arm = model === 'slim' ? 3 : 4
      const legacy = img.height === 32
      const part = (sx: number, sy: number, w: number, h: number, dx: number, dy: number, flip = false): void => {
        if (flip) {
          ctx.save()
          ctx.translate(dx + w, dy)
          ctx.scale(-1, 1)
          ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
          ctx.restore()
        } else {
          ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h)
        }
      }
      // 内层
      part(8, 8, 8, 8, 4, 0)
      part(20, 20, 8, 12, 4, 8)
      part(44, 20, arm, 12, 4 - arm, 8)
      if (legacy) part(44, 20, arm, 12, 12, 8, true)
      else part(36, 52, arm, 12, 12, 8)
      part(4, 20, 4, 12, 4, 20)
      if (legacy) part(4, 20, 4, 12, 8, 20, true)
      else part(20, 52, 4, 12, 8, 20)
      // 外层（64×64 皮肤才有身体、手臂、腿的外层）
      part(40, 8, 8, 8, 4, 0)
      if (!legacy) {
        part(20, 36, 8, 12, 4, 8)
        part(44, 36, arm, 12, 4 - arm, 8)
        part(52, 52, arm, 12, 12, 8)
        part(4, 36, 4, 12, 4, 20)
        part(4, 52, 4, 12, 8, 20)
      }
    }
    img.src = image
    return () => {
      alive = false
    }
  }, [image, model])
  return (
    <canvas
      ref={canvasRef}
      width={16}
      height={32}
      style={{ width: 48, height: 96, imageRendering: 'pixelated' }}
      className="shrink-0"
    />
  )
}

interface SkinWardrobeProps {
  /** 当前账号正在用的皮肤（放进衣柜用）；没有时为 null */
  current: { image: string; model: SkinModel; name: string } | null
  /** 当前是离线账号时，用来标出正在穿的那套 */
  offlineSkin?: string
  /** 换上之后通知页面刷新 */
  onWorn: (result: { kind: 'offline'; settings: AppSettings } | { kind: 'microsoft'; profile: MsSkinProfile }) => void
  /** 正版账号：换皮肤会上传到官方 */
  microsoft: boolean
}

/** 皮肤衣柜：保存多套皮肤，一键换上 */
function SkinWardrobe({ current, offlineSkin, onWorn, microsoft }: SkinWardrobeProps): JSX.Element {
  const [skins, setSkins] = useState<WardrobeSkin[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api
      .listWardrobe()
      .then(setSkins)
      .catch(() => setSkins([]))
  }, [])

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const addCurrent = (): Promise<void> =>
    run('add', async () => {
      if (!current) return
      setSkins(await window.api.addToWardrobe(current.image, current.name, current.model))
      setNotice('已放进衣柜')
    })

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    void run('add', async () => {
      const problems: string[] = []
      for (const file of files.slice(0, 20)) {
        try {
          const image = await readPng(file)
          setSkins(await window.api.addToWardrobe(image, file.name.replace(/\.png$/i, ''), 'default'))
        } catch (err) {
          problems.push(`${file.name}：${errorText(err)}`)
        }
      }
      if (problems.length > 0) throw new Error(problems.join('；'))
      setNotice(files.length > 1 ? `已放进 ${files.length} 套皮肤` : '已放进衣柜')
    })
  }

  const wear = (skin: WardrobeSkin): Promise<void> =>
    run(`wear:${skin.id}`, async () => {
      const result = await window.api.wearWardrobeSkin(skin.id)
      onWorn(result)
      setNotice(result.kind === 'microsoft' ? `已换上「${skin.name}」，正版皮肤已更新` : `已换上「${skin.name}」`)
    })

  const saveName = (skin: WardrobeSkin): Promise<void> =>
    run(`name:${skin.id}`, async () => {
      setEditing(null)
      if (draft.trim() && draft.trim() !== skin.name) {
        setSkins(await window.api.updateWardrobeSkin(skin.id, { name: draft }))
      }
    })

  const button =
    'flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-40'

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl"
      data-testid="wardrobe"
    >
      <div className="flex items-center gap-3">
        <Shirt className="h-5 w-5 text-violet-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">皮肤衣柜</h2>
          <p className="text-xs text-white/50">
            {microsoft ? '保存多套皮肤，一键换上（会上传到正版账号）' : '保存多套皮肤，一键换上'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void addCurrent()} disabled={!current || !!busy} className={button}>
          {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          把现在的皮肤放进衣柜
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={button}>
          <FolderPlus className="h-4 w-4" />
          从文件添加
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png"
          multiple
          className="hidden"
          aria-label="选择要放进衣柜的皮肤文件"
          onChange={onPickFile}
        />
      </div>

      {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}

      {skins && skins.length === 0 && (
        <p className="mt-4 text-xs leading-5 text-white/40">
          衣柜还是空的。把现在的皮肤放进来，或者从文件添加几套（64×64 或 64×32 的 PNG），以后点一下就能换上。
        </p>
      )}
      {skins && skins.length > 0 && (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
          {skins.map((skin) => {
            const wearing = !microsoft && !!offlineSkin && offlineSkin === skin.image
            return (
              <div
                key={skin.id}
                data-testid="wardrobe-skin"
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${
                  wearing ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/5 bg-black/20'
                }`}
              >
                <SkinFront image={skin.image} model={skin.model} />
                {editing === skin.id ? (
                  <input
                    autoFocus
                    value={draft}
                    maxLength={40}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void saveName(skin)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveName(skin)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    aria-label="皮肤名字"
                    className="w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-center text-sm outline-none focus:border-emerald-400/50"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditing(skin.id)
                      setDraft(skin.name)
                    }}
                    title="改名字"
                    className="group flex w-full min-w-0 items-center justify-center gap-1 text-sm"
                  >
                    <span className="truncate">{skin.name}</span>
                    <Pencil className="h-3 w-3 shrink-0 text-white/30 group-hover:text-white/70" />
                  </button>
                )}
                <div className="flex w-full items-center gap-1">
                  <button
                    onClick={() =>
                      void run(`model:${skin.id}`, async () =>
                        setSkins(
                          await window.api.updateWardrobeSkin(skin.id, {
                            model: skin.model === 'slim' ? 'default' : 'slim'
                          })
                        )
                      )
                    }
                    disabled={!!busy}
                    title="切换体型"
                    className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60 hover:bg-white/20"
                  >
                    {skin.model === 'slim' ? '纤细' : '经典'}
                  </button>
                  <span className="flex-1" />
                  {confirmDelete === skin.id ? (
                    <button
                      onClick={() =>
                        void run(`del:${skin.id}`, async () => {
                          setConfirmDelete(null)
                          setSkins(await window.api.removeFromWardrobe(skin.id))
                        })
                      }
                      onBlur={() => setConfirmDelete(null)}
                      className="rounded-md bg-red-500/30 px-1.5 py-0.5 text-[11px] text-red-100 hover:bg-red-500/50"
                    >
                      确认删除
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(skin.id)}
                      title="从衣柜删除"
                      aria-label={`删除 ${skin.name}`}
                      className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => void wear(skin)}
                  disabled={!!busy || wearing}
                  aria-label={`换上 ${skin.name}`}
                  className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-60 ${
                    wearing
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                  }`}
                >
                  {busy === `wear:${skin.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : wearing ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Shirt className="h-3.5 w-3.5" />
                  )}
                  {wearing ? '正在穿' : '换上'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default SkinWardrobe
