import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ListFilter,
  Loader2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react'
import { AI_PROVIDERS, aiProvider } from '../../../shared/aiProviders'
import type { AiConfig, AiConfigPatch } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const inputClass =
  'w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/70'
const buttonClass =
  'flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50'

/**
 * 设置 → AI 助手：选择服务商、填写接口地址、API Key 和模型。
 * API Key 只发给主进程加密保存，界面只显示末尾 4 位
 */
function AiSettings(): JSX.Element {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState<'' | 'key' | 'test' | 'models'>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const show = (next: AiConfig): void => {
    setConfig(next)
    setBaseUrl(next.baseUrl)
    setModel(next.model)
  }

  useEffect(() => {
    void window.api.aiGetConfig().then(show)
  }, [])

  const apply = async (patch: AiConfigPatch): Promise<boolean> => {
    try {
      show(await window.api.aiSetConfig(patch))
      return true
    } catch (e) {
      setMessage({ ok: false, text: cleanError(e) })
      return false
    }
  }

  if (!config) {
    return (
      <section className="flex justify-center rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      </section>
    )
  }

  const preset = aiProvider(config.provider)
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(config.baseUrl)
  // 本机运行的服务（例如本机的中转程序）Key 可以不填，但仍然可以填
  const showKey = preset.needsKey

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    setBusy('key')
    setMessage(null)
    if (await apply({ apiKey: keyInput })) {
      setKeyInput('')
      setEditingKey(false)
      setMessage({ ok: true, text: 'API Key 已加密保存' })
    }
    setBusy('')
  }

  const run = async (kind: 'test' | 'models'): Promise<void> => {
    setBusy(kind)
    setMessage(null)
    try {
      if (kind === 'test') {
        setMessage({ ok: true, text: await window.api.aiTest() })
      } else {
        const list = await window.api.aiListModels()
        setModels(list)
        setMessage({ ok: true, text: `找到 ${list.length} 个模型，点模型输入框可以选择` })
      }
    } catch (e) {
      setMessage({ ok: false, text: cleanError(e) })
    }
    setBusy('')
  }

  const commit = (patch: AiConfigPatch, changed: boolean): void => {
    if (changed) {
      setMessage(null)
      void apply(patch)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-300" />
        <div>
          <h2 className="text-lg font-semibold">AI 助手</h2>
          <p className="text-xs text-white/50">
            游戏崩溃或启动失败时，用 AI 分析原因并给出解决方法。需要填写你自己在服务商那里申请的 API Key
          </p>
        </div>
        {config.ready && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已设置
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
        <label htmlFor="ai-provider" className="text-white/70">
          服务商
        </label>
        <select
          id="ai-provider"
          value={config.provider}
          onChange={(e) => {
            setModels([])
            setEditingKey(false)
            setKeyInput('')
            commit({ provider: e.target.value }, e.target.value !== config.provider)
          }}
          className={`${inputClass} cursor-pointer`}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} className="bg-slate-800 text-white">
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="ai-base-url" className="text-white/70">
          接口地址
        </label>
        <input
          id="ai-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={() => commit({ baseUrl }, baseUrl !== config.baseUrl)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={preset.kind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.example.com/v1'}
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />

        {showKey && (
          <>
            <span className="text-white/70">API Key</span>
            {config.hasKey && !editingKey ? (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-emerald-300" />
                  <span className="truncate text-white/80">
                    已保存（末尾 <span className="font-mono">{config.keyHint}</span>）
                  </span>
                </div>
                <button onClick={() => setEditingKey(true)} className={buttonClass}>
                  更换
                </button>
                <button
                  onClick={() => {
                    setMessage(null)
                    void apply({ apiKey: null }).then((ok) => ok && setMessage({ ok: true, text: '已删除 API Key' }))
                  }}
                  title="删除保存的 API Key"
                  className={buttonClass}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
                  placeholder={local ? '本机服务不需要时可以不填' : '粘贴服务商提供的 API Key'}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="API Key"
                  className={`${inputClass} font-mono`}
                />
                <button
                  onClick={() => void saveKey()}
                  disabled={!keyInput.trim() || busy === 'key'}
                  className={buttonClass}
                >
                  {busy === 'key' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  保存
                </button>
                {editingKey && (
                  <button
                    onClick={() => {
                      setEditingKey(false)
                      setKeyInput('')
                    }}
                    className={buttonClass}
                  >
                    取消
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <label htmlFor="ai-model" className="text-white/70">
          模型
        </label>
        <div className="flex items-center gap-2">
          <input
            id="ai-model"
            list="ai-model-list"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => commit({ model }, model !== config.model)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={preset.modelHint}
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
          <datalist id="ai-model-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button onClick={() => void run('models')} disabled={busy !== ''} className={buttonClass}>
            {busy === 'models' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListFilter className="h-4 w-4" />}
            获取模型列表
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => void run('test')} disabled={busy !== '' || !config.ready} className={buttonClass}>
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          测试连接
        </button>
        {message && (
          <span
            className={`flex min-w-0 items-center gap-1.5 text-xs ${message.ok ? 'text-emerald-200' : 'text-red-200'}`}
          >
            {message.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="break-all">{message.text}</span>
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-black/20 px-4 py-3">
        <div>
          <div className="text-sm font-medium">崩溃后自动分析</div>
          <div className="text-xs text-white/50">
            游戏崩溃或启动失败时自动开始分析；关闭后需要在崩溃提示里手动点「分析原因」
          </div>
        </div>
        <button
          role="switch"
          aria-checked={config.autoAnalyze}
          aria-label="崩溃后自动分析"
          onClick={() => void apply({ autoAnalyze: !config.autoAnalyze })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            config.autoAnalyze ? 'bg-emerald-500' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${
              config.autoAnalyze ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/45">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          分析时会把崩溃报告和日志的关键部分发送给你选择的服务商，发送前会去掉登录令牌、电脑用户名等隐私信息；调用费用由服务商按你的账户计算。
          API Key 只保存在这台电脑上
          {config.keyEncrypted ? '，并用系统的安全存储加密' : '（系统没有可用的密钥环，以普通文件保存）'}
          ，换了接口地址后需要重新填写。
        </div>
      </div>
    </section>
  )
}

export default AiSettings
