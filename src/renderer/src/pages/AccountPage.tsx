import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, RotateCw, Shirt, Upload, UserRound } from 'lucide-react'
import SkinViewer3D, { type SkinAnimation } from '../components/SkinViewer3D'
import AccountList from '../components/AccountList'
import MsSkinPanel from '../components/MsSkinPanel'
import type { AccountsInfo, AppSettings, MsSkinProfile, SkinModel } from '../../../shared/types'
import PageHeader from '../components/PageHeader'

const ANIMATIONS: { key: SkinAnimation; label: string }[] = [
  { key: 'idle', label: '站立' },
  { key: 'walk', label: '行走' },
  { key: 'run', label: '奔跑' },
  { key: 'wave', label: '挥手' },
  { key: 'fly', label: '飞行' }
]

const MODELS: { key: SkinModel; label: string; desc: string }[] = [
  { key: 'default', label: '经典', desc: 'Steve 体型' },
  { key: 'slim', label: '纤细', desc: 'Alex 体型' }
]

/** 皮肤文件最大 256 KB */
const MAX_SKIN_SIZE = 256 * 1024

/** 读取并校验皮肤文件：必须是 64×64 或 64×32 的 PNG */
function readSkinFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'image/png') {
      reject(new Error('皮肤必须是 PNG 图片'))
      return
    }
    if (file.size > MAX_SKIN_SIZE) {
      reject(new Error('皮肤文件过大（超过 256 KB）'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onerror = () => reject(new Error('无法识别该图片'))
      img.onload = () => {
        const ok = img.width === 64 && (img.height === 64 || img.height === 32)
        if (ok) resolve(dataUrl)
        else reject(new Error(`皮肤尺寸应为 64×64 或 64×32，当前为 ${img.width}×${img.height}`))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

function AccountPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null)
  const [animation, setAnimation] = useState<SkinAnimation>('walk')
  const [autoRotate, setAutoRotate] = useState(true)
  const [error, setError] = useState('')
  const [msProfile, setMsProfile] = useState<MsSkinProfile | null>(null)
  const [tokenEncryption, setTokenEncryption] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getAccounts().then(setAccounts)
    window.api.getSystemInfo().then((info) => setTokenEncryption(info.tokenEncryption))
  }, [])

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    setSettings(await window.api.updateSettings(patch))
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      await update({ skinDataUrl: await readSkinFile(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!settings || !accounts) return <div />

  // 使用微软账号时预览正版皮肤
  const microsoft = accounts.accounts.find((a) => a.uuid === accounts.active)
  const external = accounts.external.find((a) => a.id === accounts.active)
  /** 正版或外置账号：皮肤与名字来自服务器 */
  const msAccount = microsoft ?? external
  // 正版档案读取后用最新皮肤，并显示当前披风
  const liveProfile = microsoft && msProfile?.uuid === microsoft.uuid ? msProfile : null
  const activeCape = liveProfile?.capes.find((c) => c.active)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 标题栏在最上面，和其他页面的标题位置一致 */}
      <PageHeader title="账号" subtitle="切换启动游戏使用的账号，更换皮肤和披风" />

      <div className="flex min-h-0 flex-1 gap-6">
        {/* 3D 预览 */}
        <section className="relative flex w-[40%] min-w-[280px] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute bottom-14 left-0 right-0 z-10 text-center text-xs text-white/30">
            拖动旋转 · 滚轮缩放
          </div>
          <div className="min-h-0 flex-1">
            <SkinViewer3D
              skin={liveProfile ? liveProfile.skin : msAccount ? msAccount.skin : settings.skinDataUrl}
              model={liveProfile ? liveProfile.skinModel : msAccount ? msAccount.skinModel : settings.skinModel}
              cape={activeCape?.image ?? ''}
              animation={animation}
              autoRotate={autoRotate}
              nameTag={msAccount ? msAccount.name : settings.offlineName}
            />
          </div>
          <div className="flex items-center gap-1 border-t border-white/10 bg-black/20 p-2">
            {ANIMATIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => setAnimation(a.key)}
                className={`relative flex-1 rounded-lg py-1.5 text-xs transition-colors ${
                  animation === a.key ? 'text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {animation === a.key && <div className="absolute inset-0 rounded-lg bg-white/15" />}
                <span className="relative z-10">{a.label}</span>
              </button>
            ))}
            <button
              onClick={() => setAutoRotate((r) => !r)}
              title={autoRotate ? '停止自动旋转' : '自动旋转'}
              className={`ml-1 rounded-lg p-2 ${autoRotate ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/50 hover:text-white'}`}
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* 账号与皮肤设置 */}
        <div className="page-scroll flex min-w-0 flex-1 flex-col gap-4">
          <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <UserRound className="h-5 w-5 text-sky-300" />
              <div>
                <h2 className="text-lg font-semibold">账号</h2>
                <p className="text-xs text-white/50">点击切换启动游戏使用的账号</p>
              </div>
            </div>
            <AccountList
              settings={settings}
              accounts={accounts}
              onAccountsChange={setAccounts}
              onSettingsChange={setSettings}
            />
            {!tokenEncryption && (
              <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                系统没有可用的密钥环，登录信息无法加密，会以普通文件保存在本机。请不要在公用电脑上登录正版或外置账号；
                Linux 用户可以安装并解锁 GNOME Keyring 或 KWallet 后重新登录
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <Shirt className="h-5 w-5 text-emerald-300" />
              <div>
                <h2 className="text-lg font-semibold">皮肤</h2>
                <p className="text-xs text-white/50">
                  {external
                    ? `正在使用 ${external.serverName} 的皮肤`
                    : msAccount
                      ? '正在使用正版皮肤'
                      : settings.skinDataUrl
                        ? '正在使用自定义皮肤'
                        : '正在使用默认皮肤'}
                </p>
              </div>
            </div>

            {external ? (
              <p className="mt-4 text-xs leading-5 text-white/40">
                外置账号的皮肤由 {external.serverName}{' '}
                提供，在使用同一皮肤站的服务器里，其他玩家都能看到。可以在皮肤站网站上修改，
                修改后删除账号重新登录即可在这里看到。
              </p>
            ) : microsoft ? (
              <MsSkinPanel
                account={microsoft}
                onProfile={setMsProfile}
                onChanged={() => window.api.getAccounts().then(setAccounts)}
              />
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {MODELS.map((m) => {
                    const active = settings.skinModel === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => update({ skinModel: m.key })}
                        className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-emerald-400/50 bg-emerald-500/15'
                            : 'border-white/5 bg-black/20 hover:bg-black/30'
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
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-500/20"
                  >
                    <Upload className="h-4 w-4" />
                    选择皮肤文件
                  </motion.button>
                  <button
                    onClick={() => update({ skinDataUrl: '' })}
                    disabled={!settings.skinDataUrl}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20 disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复默认
                  </button>
                  <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={onPickFile} />
                </div>

                {error && <div className="mt-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}

                <p className="mt-4 text-xs leading-5 text-white/40">
                  支持 64×64 或 64×32 的 PNG
                  皮肤文件。离线账号的皮肤仅在启动器中预览，进入游戏后其他玩家看不到（需要正版账号或皮肤站）。
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default AccountPage
