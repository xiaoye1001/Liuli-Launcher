import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, LogIn, Trash2, X } from 'lucide-react'
import SkinHead from './SkinHead'
import type { AccountsInfo, AppSettings, MsLoginStatus } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface AccountListProps {
  settings: AppSettings
  accounts: AccountsInfo
  onAccountsChange: (accounts: AccountsInfo) => void
}

/** 账号列表：离线账号 + 微软账号，添加微软账号（设备代码登录） */
function AccountList({ settings, accounts, onAccountsChange }: AccountListProps): JSX.Element {
  const [login, setLogin] = useState<MsLoginStatus>({ state: 'idle' })
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getMicrosoftLoginStatus().then(setLogin)
    return window.api.onMicrosoftLogin((status) => {
      setLogin(status)
      // 登录成功后刷新账号列表（新账号会自动设为当前账号）
      if (status.state === 'success') window.api.getAccounts().then(onAccountsChange)
    })
  }, [onAccountsChange])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setError('')
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const startLogin = (): Promise<void> =>
    run(async () => {
      setLogin(await window.api.startMicrosoftLogin())
    })

  const loggingIn = login.state === 'waiting' || login.state === 'authorizing'
  const rowClass = (active: boolean): string =>
    `flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
      active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
    }`

  return (
    <div className="space-y-3">
      {/* 离线账号 */}
      <button
        onClick={() => run(async () => onAccountsChange(await window.api.setActiveAccount('offline')))}
        className={rowClass(accounts.active === 'offline')}
      >
        <SkinHead skin={settings.skinDataUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{settings.offlineName}</div>
          <div className="text-xs text-white/50">离线账号 · 在主页修改玩家名</div>
        </div>
        {accounts.active === 'offline' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
      </button>

      {/* 微软账号 */}
      {accounts.accounts.map((account) => (
        <div key={account.uuid} className="flex items-center gap-2">
          <button
            onClick={() => run(async () => onAccountsChange(await window.api.setActiveAccount(account.uuid)))}
            className={rowClass(accounts.active === account.uuid)}
          >
            <SkinHead skin={account.skin} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{account.name}</div>
              <div className="text-xs text-white/50">微软账号 · 正版</div>
            </div>
            {accounts.active === account.uuid && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
          </button>
          <button
            onClick={() => run(async () => onAccountsChange(await window.api.removeAccount(account.uuid)))}
            title="移除该账号（不会影响你的微软账号本身）"
            className="rounded-lg p-2.5 text-white/50 hover:bg-red-500/30 hover:text-red-200"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* 登录进度 */}
      {login.state === 'waiting' && (
        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4">
          <div className="text-sm text-white/70">在浏览器中打开微软登录页，输入下面的代码：</div>
          <div className="mt-2 flex items-center gap-3">
            <span className="select-all whitespace-nowrap rounded-lg bg-black/30 px-4 py-2 font-mono text-2xl font-bold tracking-widest">
              {login.userCode}
            </span>
            <button
              onClick={() => window.api.openMicrosoftLoginPage()}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-sky-500/80 px-4 py-2.5 text-sm font-medium hover:bg-sky-500"
            >
              <ExternalLink className="h-4 w-4" />
              复制代码并登录
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            等待你在浏览器中完成登录…
            <button
              onClick={() => window.api.cancelMicrosoftLogin()}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
          </div>
        </div>
      )}
      {login.state === 'authorizing' && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在验证 Xbox 与 Minecraft 账号…
        </div>
      )}
      {login.state === 'failed' && login.error && (
        <div className="rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">登录失败：{login.error}</div>
      )}
      {error && <div className="rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">{error}</div>}

      <button
        onClick={startLogin}
        disabled={loggingIn || !accounts.loginAvailable}
        title={accounts.loginAvailable ? undefined : '当前版本没有开启微软登录'}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-sky-500/20 disabled:opacity-50"
      >
        <LogIn className="h-4 w-4" />
        添加微软账号
      </button>
      {!accounts.loginAvailable && (
        <p className="text-xs text-white/40">当前版本没有开启微软登录，可以使用离线账号。</p>
      )}
    </div>
  )
}

export default AccountList
