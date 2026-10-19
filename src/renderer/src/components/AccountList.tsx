import { useEffect, useState } from 'react'
import { Check, CheckCircle2, ExternalLink, Globe, Loader2, LogIn, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import ExternalLoginForm from './ExternalLoginForm'
import SkinHead from './SkinHead'
import type { AccountsInfo, AppSettings, MsLoginStatus } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 移除按钮：第一次点击变成「确认移除」，再点一次才移除（几秒内不点会恢复） */
function RemoveButton({ title, onConfirm }: { title: string; onConfirm: () => void }): JSX.Element {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  if (armed) {
    return (
      <button
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
        onBlur={() => setArmed(false)}
        autoFocus
        className="shrink-0 rounded-lg bg-red-500/80 px-3 py-2 text-xs font-medium text-white hover:bg-red-500"
      >
        确认移除
      </button>
    )
  }
  return (
    <button
      onClick={() => setArmed(true)}
      title={title}
      aria-label={title}
      className="rounded-lg p-2.5 text-white/50 hover:bg-red-500/30 hover:text-red-200"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

interface AccountListProps {
  settings: AppSettings
  accounts: AccountsInfo
  onAccountsChange: (accounts: AccountsInfo) => void
  /** 离线账号变化后通知（离线账号保存在设置里） */
  onSettingsChange: (settings: AppSettings) => void
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

/** 输入玩家名的小表单：添加或重命名离线账号 */
function NameInput({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const valid = NAME_PATTERN.test(name)

  const submit = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSubmit(name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        autoFocus
        value={name}
        maxLength={16}
        placeholder="玩家名（字母、数字、下划线，3~16 位）"
        onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') onCancel()
        }}
        className={`min-w-0 flex-1 rounded-xl border bg-black/20 px-4 py-2.5 text-sm outline-none ${
          name && !valid ? 'border-red-400/60' : 'border-white/10 focus:border-emerald-400/50'
        }`}
      />
      <button
        onClick={submit}
        disabled={!valid || busy}
        title={submitLabel}
        className="flex items-center gap-1.5 rounded-xl bg-emerald-500/80 px-3 py-2.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {submitLabel}
      </button>
      <button
        onClick={onCancel}
        title="取消"
        className="rounded-lg p-2.5 text-white/50 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** 账号列表：离线账号 + 微软账号，添加微软账号（设备代码登录） */
function AccountList({ settings, accounts, onAccountsChange, onSettingsChange }: AccountListProps): JSX.Element {
  const [login, setLogin] = useState<MsLoginStatus>({ state: 'idle' })
  const [error, setError] = useState('')
  const [addingExternal, setAddingExternal] = useState(false)
  const [addingOffline, setAddingOffline] = useState(false)
  /** 正在重命名的离线账号 id */
  const [renaming, setRenaming] = useState('')

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

  /** 离线账号保存在设置里：更新设置后刷新账号列表 */
  const offlineAction = async (action: () => Promise<AppSettings>): Promise<void> => {
    setError('')
    try {
      onSettingsChange(await action())
      onAccountsChange(await window.api.getAccounts())
    } catch (e) {
      setError(cleanError(e))
      throw e
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
      {settings.offlineAccounts.map((account) => {
        const active = accounts.active === 'offline' && settings.activeOffline === account.id
        if (renaming === account.id) {
          return (
            <div key={account.id} className="flex items-center gap-2">
              <NameInput
                initial={account.name}
                submitLabel="保存"
                onCancel={() => setRenaming('')}
                onSubmit={(name) =>
                  offlineAction(() => window.api.renameOfflineAccount(account.id, name)).then(
                    () => setRenaming(''),
                    () => undefined
                  )
                }
              />
            </div>
          )
        }
        return (
          <div key={account.id} className="flex items-center gap-2">
            <button
              onClick={() => offlineAction(() => window.api.selectOfflineAccount(account.id)).catch(() => undefined)}
              className={rowClass(active)}
            >
              <SkinHead skin={account.skin} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{account.name}</div>
                <div className="text-xs text-white/50">离线账号{account.skin ? ' · 自定义皮肤' : ''}</div>
              </div>
              {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
            </button>
            <button
              onClick={() => setRenaming(account.id)}
              title="修改玩家名"
              className="rounded-lg p-2.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {settings.offlineAccounts.length > 1 && (
              <button
                onClick={() => offlineAction(() => window.api.removeOfflineAccount(account.id)).catch(() => undefined)}
                title="删除这个离线账号"
                className="rounded-lg p-2.5 text-white/50 hover:bg-red-500/30 hover:text-red-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}

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
          <RemoveButton
            title="移除该账号（不会影响你的微软账号本身，之后需要重新登录）"
            onConfirm={() => run(async () => onAccountsChange(await window.api.removeAccount(account.uuid)))}
          />
        </div>
      ))}

      {/* 外置账号 */}
      {accounts.external.map((account) => (
        <div key={account.id} className="flex items-center gap-2">
          <button
            onClick={() => run(async () => onAccountsChange(await window.api.setActiveAccount(account.id)))}
            className={rowClass(accounts.active === account.id)}
          >
            <SkinHead skin={account.skin} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{account.name}</div>
              <div className="truncate text-xs text-white/50" title={account.serverUrl}>
                外置账号 · {account.serverName} · {account.username}
              </div>
            </div>
            {accounts.active === account.id && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
          </button>
          <RemoveButton
            title="移除该账号（不会影响皮肤站上的账号，之后需要重新输入密码登录）"
            onConfirm={() => run(async () => onAccountsChange(await window.api.removeExternalAccount(account.id)))}
          />
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

      {addingOffline ? (
        <NameInput
          initial=""
          submitLabel="添加"
          onCancel={() => setAddingOffline(false)}
          onSubmit={(name) =>
            offlineAction(() => window.api.addOfflineAccount(name)).then(
              () => setAddingOffline(false),
              () => undefined
            )
          }
        />
      ) : (
        <button
          onClick={() => setAddingOffline(true)}
          title="每个离线账号有自己的玩家名和皮肤"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/20"
        >
          <UserPlus className="h-4 w-4" />
          添加离线账号
        </button>
      )}
      <button
        onClick={startLogin}
        disabled={loggingIn || !accounts.loginAvailable}
        title={accounts.loginAvailable ? undefined : '当前版本没有开启微软登录'}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-sky-500/20 disabled:opacity-50"
      >
        <LogIn className="h-4 w-4" />
        添加微软账号
      </button>
      {addingExternal ? (
        <ExternalLoginForm
          onCancel={() => setAddingExternal(false)}
          onDone={(next) => {
            setAddingExternal(false)
            onAccountsChange(next)
          }}
        />
      ) : (
        <button
          onClick={() => setAddingExternal(true)}
          title="LittleSkin 等支持 authlib-injector 的皮肤站账号"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/20"
        >
          <Globe className="h-4 w-4" />
          添加外置账号（皮肤站）
        </button>
      )}
      {!accounts.loginAvailable && (
        <p className="text-xs text-white/40">当前版本没有开启微软登录，可以使用离线账号。</p>
      )}
    </div>
  )
}

export default AccountList
