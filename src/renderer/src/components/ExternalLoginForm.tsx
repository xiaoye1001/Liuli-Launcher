import { useState } from 'react'
import { KeyRound, Loader2, UserRound, X } from 'lucide-react'
import type { AccountsInfo } from '../../../shared/types'

/** 常用的外置登录服务器 */
const PRESETS: { label: string; url: string }[] = [
  { label: 'LittleSkin', url: 'https://littleskin.cn/api/yggdrasil' },
  { label: '其他皮肤站', url: '' }
]

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface ExternalLoginFormProps {
  onDone: (accounts: AccountsInfo) => void
  onCancel: () => void
}

/** 外置登录：选择皮肤站，填写邮箱（用户名）和密码；账号下有多个角色时选择一个 */
function ExternalLoginForm({ onDone, onCancel }: ExternalLoginFormProps): JSX.Element {
  const [preset, setPreset] = useState(0)
  const [customUrl, setCustomUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [choose, setChoose] = useState<{ pendingId: string; profiles: { id: string; name: string }[] } | null>(null)

  const server = PRESETS[preset].url || customUrl

  const finish = async (): Promise<void> => {
    setPassword('')
    onDone(await window.api.getAccounts())
  }

  const login = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await window.api.loginExternal(server, username, password)
      if ('account' in result) await finish()
      else setChoose(result)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const select = async (profileId: string): Promise<void> => {
    if (!choose) return
    setBusy(true)
    setError('')
    try {
      await window.api.selectExternalProfile(choose.pendingId, profileId)
      await finish()
    } catch (e) {
      setError(cleanError(e))
      setChoose(null)
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/70'

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">添加外置账号</div>
        <button
          onClick={onCancel}
          title="取消"
          className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {choose ? (
        <div className="mt-3">
          <div className="text-xs text-white/60">这个账号有多个角色，选择要使用的角色：</div>
          <div className="mt-2 space-y-1.5">
            {choose.profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => select(p.id)}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-left text-sm hover:bg-black/30 disabled:opacity-50"
              >
                <UserRound className="h-4 w-4 text-white/50" />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <span className="text-xs text-white/60">皮肤站</span>
            <div className="mt-1 flex gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setPreset(i)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    preset === i
                      ? 'border-emerald-400/50 bg-emerald-500/15'
                      : 'border-white/10 bg-black/20 hover:bg-black/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {!PRESETS[preset].url && (
              <input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="皮肤站地址，例如 https://skin.example.com（填首页地址即可）"
                spellCheck={false}
                className={inputClass}
              />
            )}
          </div>
          <label className="block">
            <span className="text-xs text-white/60">邮箱或用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              spellCheck={false}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/60">密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && server && username && password && login()}
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <button
            onClick={login}
            disabled={busy || !server || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            登录
          </button>
          <p className="text-xs leading-5 text-white/40">
            密码只用于这一次登录，启动器不会保存密码。在使用同一皮肤站的服务器里可以显示你的皮肤。
          </p>
        </div>
      )}
      {error && <div className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</div>}
    </div>
  )
}

export default ExternalLoginForm
