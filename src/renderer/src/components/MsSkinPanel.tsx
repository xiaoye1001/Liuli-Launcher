import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Ban, Loader2, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import type { MicrosoftAccount, MsCape, MsSkinProfile, SkinModel } from '../../../shared/types'

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const MODELS: { key: SkinModel; label: string; desc: string }[] = [
  { key: 'default', label: '经典', desc: 'Steve 体型' },
  { key: 'slim', label: '纤细', desc: 'Alex 体型' }
]

/** 从披风贴图中裁出正面（贴图 64×32 时位于 (1,1)，大小 10×16） */
function CapeThumb({ image, alias }: { image: string; alias: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const img = new Image()
    img.onload = () => {
      const scale = img.width / 64
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, scale, scale, 10 * scale, 16 * scale, 0, 0, canvas.width, canvas.height)
    }
    img.src = image
  }, [image])

  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={64}
      aria-label={alias}
      className="h-16 w-10 rounded-sm bg-black/30 [image-rendering:pixelated]"
    />
  )
}

interface MsSkinPanelProps {
  account: MicrosoftAccount
  /** 档案变化时通知（用于 3D 预览显示皮肤与披风） */
  onProfile: (profile: MsSkinProfile | null) => void
  /** 皮肤修改后刷新账号列表 */
  onChanged: () => void
}

/** 正版账号的皮肤与披风设置 */
function MsSkinPanel({ account, onProfile, onChanged }: MsSkinPanelProps): JSX.Element {
  const [profile, setProfile] = useState<MsSkinProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [variant, setVariant] = useState<SkinModel>(account.skinModel)

  const apply = (next: MsSkinProfile): void => {
    setProfile(next)
    setVariant(next.skinModel)
    onProfile(next)
  }

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      apply(await window.api.getMsSkinProfile(account.uuid))
      onChanged()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setProfile(null)
    onProfile(null)
    setVariant(account.skinModel)
    setNotice('')
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.uuid])

  const run = async (key: string, action: () => Promise<MsSkinProfile | null>, done: string): Promise<void> => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const next = await action()
      if (next) {
        apply(next)
        onChanged()
        setNotice(done)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const upload = (): Promise<void> =>
    run(
      'upload',
      () => window.api.uploadMsSkin(account.uuid, variant === 'slim' ? 'slim' : 'classic'),
      '皮肤已更新，重新进入游戏或服务器后生效'
    )
  const reset = (): Promise<void> => run('reset', () => window.api.resetMsSkin(account.uuid), '已恢复默认皮肤')
  const chooseCape = (cape: MsCape | null): Promise<void> =>
    run(
      cape ? cape.id : 'none',
      () => window.api.setMsCape(account.uuid, cape ? cape.id : null),
      cape ? `已显示披风「${cape.alias}」` : '已隐藏披风'
    )

  const capes = profile?.capes ?? []
  const noCape = capes.every((c) => !c.active)

  return (
    <div className="mt-5">
      <div className="grid grid-cols-2 gap-3">
        {MODELS.map((m) => {
          const active = variant === m.key
          return (
            <button
              key={m.key}
              onClick={() => setVariant(m.key)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
              }`}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-xs text-white/50">{m.desc}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex gap-3">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={upload}
          disabled={!!busy || loading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传新皮肤
        </motion.button>
        <button
          onClick={reset}
          disabled={!!busy || loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20 disabled:opacity-40"
        >
          {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          恢复默认
        </button>
        <button
          onClick={load}
          disabled={!!busy || loading}
          title="重新读取正版档案"
          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 hover:bg-white/20 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}

      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">披风</div>
        {loading && !profile ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在读取正版档案…
          </div>
        ) : !profile ? (
          <div className="text-xs text-white/40">读取失败，点击右上方的刷新按钮重试</div>
        ) : capes.length === 0 ? (
          <div className="text-xs text-white/40">这个账号还没有披风（参加官方活动或购买特定版本可获得）</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => chooseCape(null)}
              disabled={!!busy || noCape}
              title="不显示披风"
              className={`flex w-20 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs transition-colors disabled:cursor-default ${
                noCape ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
              }`}
            >
              <div className="flex h-16 w-10 items-center justify-center rounded-sm bg-black/30">
                {busy === 'none' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                ) : (
                  <Ban className="h-4 w-4 text-white/40" />
                )}
              </div>
              不显示
            </button>
            {capes.map((c) => (
              <button
                key={c.id}
                onClick={() => chooseCape(c)}
                disabled={!!busy || c.active}
                title={c.alias}
                className={`relative flex w-20 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs transition-colors disabled:cursor-default ${
                  c.active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                <CapeThumb image={c.image} alias={c.alias} />
                <span className="w-full truncate text-center">{c.alias}</span>
                {busy === c.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-white/40">
        正版皮肤和披风保存在 Minecraft 官方服务器，所有玩家都能看到。皮肤需为 64×64 或 64×32 的 PNG
        图片，上传时使用上方选择的体型。修改后重新进入游戏或服务器生效。
      </p>
    </div>
  )
}

export default MsSkinPanel
