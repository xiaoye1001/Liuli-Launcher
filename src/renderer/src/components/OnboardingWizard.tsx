import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Download, Monitor, Moon, Palette, Sparkles, Sun, UserRound } from 'lucide-react'
import type { AccentColor, AppSettings, DownloadSource, ThemeMode } from '../../../shared/types'

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const THEMES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'system', label: '跟随系统', icon: Monitor },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'light', label: '浅色', icon: Sun }
]

const ACCENTS: { key: AccentColor; label: string; from: string; to: string }[] = [
  { key: 'emerald', label: '翡翠绿', from: '#10b981', to: '#06b6d4' },
  { key: 'sky', label: '天空蓝', from: '#0ea5e9', to: '#6366f1' },
  { key: 'violet', label: '星辰紫', from: '#8b5cf6', to: '#d946ef' },
  { key: 'rose', label: '樱花粉', from: '#f43f5e', to: '#f97316' },
  { key: 'amber', label: '琥珀橙', from: '#f59e0b', to: '#f97316' }
]

const SOURCES: { key: DownloadSource; label: string; desc: string }[] = [
  { key: 'bmclapi', label: 'BMCLAPI 镜像', desc: '国内高速镜像，在国内推荐用这个' },
  { key: 'mojang', label: '官方源', desc: 'Mojang 官方服务器，在国外或镜像出问题时用' }
]

const STEPS = ['欢迎', '名字', '外观', '下载源', '装游戏'] as const

/**
 * 新手引导：第一次打开启动器（还没装任何游戏版本）时，几步设好名字、外观、下载源，装上第一个游戏。
 * 每一步的选择立即保存；随时可以跳过，以后都能在设置里改
 */
function OnboardingWizard({
  onInstall,
  onOpenAccount
}: {
  /** 去下载页安装这个版本 */
  onInstall: (versionId: string) => void
  /** 去账号页（正版登录） */
  onOpenAccount: () => void
}): JSX.Element | null {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [name, setName] = useState('')
  const [latest, setLatest] = useState<string | null>(null)
  const [latestError, setLatestError] = useState(false)

  useEffect(() => {
    void window.api
      .shouldShowOnboarding()
      .then(async (should) => {
        if (!should) return
        const s = await window.api.getSettings()
        setSettings(s)
        setName(s.offlineName)
        setShow(true)
      })
      .catch(() => undefined)
  }, [])

  // 到「装游戏」这一步时才读版本列表（用刚选好的下载源）
  useEffect(() => {
    if (!show || step !== 4 || latest) return
    setLatestError(false)
    window.api
      .getVersionList(false)
      .then((m) => setLatest(m.latest.release))
      .catch(() => setLatestError(true))
  }, [show, step, latest])

  if (!show || !settings) return null

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    try {
      setSettings(await window.api.updateSettings(patch))
    } catch {
      // 保存失败时保持界面上的选择，以后可以在设置里改
    }
  }

  const finish = async (): Promise<void> => {
    setShow(false)
    await window.api.updateSettings({ onboardingDone: true }).catch(() => undefined)
  }

  const nameOk = NAME_PATTERN.test(name)
  const next = async (): Promise<void> => {
    if (step === 1) {
      if (!nameOk) return
      if (name !== settings.offlineName) await update({ offlineName: name })
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const card = 'rounded-xl border px-4 py-3 text-left transition-colors'
  const on = 'border-emerald-400/50 bg-emerald-500/15'
  const off = 'border-white/10 bg-black/20 hover:bg-black/30'

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="新手引导"
        data-testid="onboarding"
        className="flex w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded-3xl border border-white/15 popover-background p-6 shadow-2xl"
      >
        {/* 进度 */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${i <= step ? 'bg-emerald-400' : 'bg-white/15'}`}
              />
              <span className={`text-[11px] ${i === step ? 'text-white' : 'text-white/40'}`}>{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 min-h-[16rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && (
                <div className="flex flex-col items-center pt-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/30">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold">欢迎使用琉璃启动器</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-white/60">
                    花一分钟设好名字、外观和下载源，再装上第一个游戏版本，就可以开始玩了。这些以后都能在设置里改。
                  </p>
                </div>
              )}

              {step === 1 && (
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <UserRound className="h-5 w-5 text-sky-300" />
                    你的游戏名字
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    离线模式下在游戏里显示的名字（3～16 个字母、数字或下划线）
                  </p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.trim())}
                    onKeyDown={(e) => e.key === 'Enter' && void next()}
                    maxLength={16}
                    autoFocus
                    aria-label="游戏名字"
                    className={`mt-4 w-full rounded-xl border bg-black/20 px-4 py-2.5 text-lg outline-none ${
                      nameOk ? 'border-white/15 focus:border-emerald-400/50' : 'border-red-400/50'
                    }`}
                  />
                  {!nameOk && <div className="mt-1.5 text-xs text-red-300">只能用 3～16 个英文字母、数字或下划线</div>}
                  <div className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-xs leading-5 text-white/60">
                    买了正版 Minecraft？可以用微软账号登录，皮肤和名字都和正版一致，还能进正版服务器。
                    <button
                      onClick={() => {
                        void finish()
                        onOpenAccount()
                      }}
                      className="ml-1 text-sky-300 hover:underline"
                    >
                      去登录正版账号
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <Palette className="h-5 w-5 text-violet-300" />
                    外观
                  </div>
                  <div className="mt-4 text-xs text-white/50">主题</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {THEMES.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.key}
                          onClick={() => void update({ theme: t.key })}
                          aria-pressed={settings.theme === t.key}
                          className={`${card} flex items-center gap-2 ${settings.theme === t.key ? on : off}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-4 text-xs text-white/50">主色调</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ACCENTS.map((a) => (
                      <button
                        key={a.key}
                        onClick={() => void update({ accentColor: a.key })}
                        aria-pressed={settings.accentColor === a.key}
                        aria-label={a.label}
                        title={a.label}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                          settings.accentColor === a.key ? 'border-white/60' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                        />
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-white/40">更多主题、壁纸、音乐和动画效果在「设置 → 个性化」</p>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <Download className="h-5 w-5 text-emerald-300" />
                    下载源
                  </div>
                  <p className="mt-1 text-xs text-white/50">下载游戏文件用的服务器，下载慢的时候可以换一个</p>
                  <div className="mt-4 space-y-2">
                    {SOURCES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => void update({ downloadSource: s.key })}
                        aria-pressed={settings.downloadSource === s.key}
                        className={`${card} flex w-full items-center gap-3 ${settings.downloadSource === s.key ? on : off}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-xs text-white/50">{s.desc}</div>
                        </div>
                        {settings.downloadSource === s.key && <Check className="h-4 w-4 text-emerald-300" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="flex flex-col items-center pt-2 text-center">
                  <h2 className="text-xl font-bold">装上第一个游戏</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-white/60">
                    推荐从最新的正式版开始。也可以稍后在「下载」页挑别的版本，或者装模组加载器和整合包。
                  </p>
                  {latestError ? (
                    <div className="mt-5 text-sm text-amber-300">读取版本列表失败，可以稍后在「下载」页安装</div>
                  ) : (
                    <button
                      onClick={() => {
                        if (!latest) return
                        void finish()
                        onInstall(latest)
                      }}
                      disabled={!latest}
                      className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                    >
                      <Download className="h-5 w-5" />
                      {latest ? `安装 Minecraft ${latest}` : '正在读取最新版本…'}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => void finish()} className="text-xs text-white/40 hover:text-white">
            {step === STEPS.length - 1 ? '稍后自己装' : '跳过引导'}
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              上一步
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button
              onClick={() => void next()}
              disabled={step === 1 && !nameOk}
              className="flex items-center gap-1 rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {step === 0 ? '开始' : '下一步'}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default OnboardingWizard
