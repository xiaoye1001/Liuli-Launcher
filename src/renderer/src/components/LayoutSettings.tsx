import { useRef, useState } from 'react'
import { Eye, EyeOff, Lock, RotateCcw } from 'lucide-react'
import { NAV_ITEMS } from './Sidebar'
import { DEFAULT_SUBTITLE, DEFAULT_TITLE } from '../utils/appearance'
import { WELCOME_VARIABLES, renderWelcome } from '../utils/welcome'
import { HIDEABLE_PAGES } from '../../../shared/types'
import type { AppSettings } from '../../../shared/types'

const DEFAULT_WELCOME_TITLE = '欢迎回来，{name}'
const DEFAULT_WELCOME_SUBTITLE = '选择版本后点击启动，开始你的冒险。'

type TextKey = 'launcherTitle' | 'launcherSubtitle' | 'welcomeTitle' | 'welcomeSubtitle'

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
  updateSlider: (patch: Partial<AppSettings>) => void
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-emerald-400/50'

/** 设置 → 个性化 → 侧边栏与主页 */
function LayoutSettings({ settings, update, updateSlider }: Props): JSX.Element {
  // 输入框用自己的状态：保存时主进程会去掉首尾空格，不能把正在输入的内容覆盖掉
  const [text, setText] = useState<Record<TextKey, string>>({
    launcherTitle: settings.launcherTitle ?? '',
    launcherSubtitle: settings.launcherSubtitle ?? '',
    welcomeTitle: settings.welcomeTitle ?? '',
    welcomeSubtitle: settings.welcomeSubtitle ?? ''
  })
  const welcomeInputs = {
    welcomeTitle: useRef<HTMLInputElement>(null),
    welcomeSubtitle: useRef<HTMLInputElement>(null)
  }
  const lastWelcome = useRef<'welcomeTitle' | 'welcomeSubtitle'>('welcomeTitle')

  const change = (key: TextKey, value: string): void => {
    setText((prev) => ({ ...prev, [key]: value }))
    updateSlider({ [key]: value })
  }

  /** 离开输入框时去掉首尾空格（和保存的内容一致） */
  const trim = (key: TextKey): void => setText((prev) => ({ ...prev, [key]: prev[key].trim() }))

  /** 在最后编辑的欢迎语输入框的光标处插入变量 */
  const insertVariable = (variable: string): void => {
    const key = lastWelcome.current
    const input = welcomeInputs[key].current
    // 还没写过欢迎语时，从默认内容开始改
    const value = text[key] || (key === 'welcomeTitle' ? DEFAULT_WELCOME_TITLE : DEFAULT_WELCOME_SUBTITLE)
    const start = text[key] && input ? (input.selectionStart ?? value.length) : value.length
    const end = text[key] && input ? (input.selectionEnd ?? value.length) : value.length
    const next = value.slice(0, start) + variable + value.slice(end)
    change(key, next)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + variable.length, start + variable.length)
    })
  }

  const hidden = Array.isArray(settings.hiddenPages) ? settings.hiddenPages : []
  const togglePage = (key: string): void => {
    update({ hiddenPages: hidden.includes(key) ? hidden.filter((p) => p !== key) : [...hidden, key] })
  }

  const isDefault =
    !text.launcherTitle && !text.launcherSubtitle && !text.welcomeTitle && !text.welcomeSubtitle && hidden.length === 0
  const reset = (): void => {
    setText({ launcherTitle: '', launcherSubtitle: '', welcomeTitle: '', welcomeSubtitle: '' })
    void update({ launcherTitle: '', launcherSubtitle: '', welcomeTitle: '', welcomeSubtitle: '', hiddenPages: [] })
  }

  const values = { name: settings.offlineName, version: settings.selectedVersion }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">侧边栏与主页</div>
        {!isDefault && (
          <button onClick={reset} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" />
            全部恢复默认
          </button>
        )}
      </div>

      {/* 启动器名称 */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-white/60">启动器名称（也是窗口标题）</span>
          <input
            value={text.launcherTitle}
            maxLength={20}
            placeholder={DEFAULT_TITLE}
            aria-label="启动器名称"
            onChange={(e) => change('launcherTitle', e.target.value)}
            onBlur={() => trim('launcherTitle')}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-white/60">名称下方的小字</span>
          <input
            value={text.launcherSubtitle}
            maxLength={30}
            placeholder={DEFAULT_SUBTITLE}
            aria-label="名称下方的小字"
            onChange={(e) => change('launcherSubtitle', e.target.value)}
            onBlur={() => trim('launcherSubtitle')}
            className={inputClass}
          />
        </label>
      </div>

      {/* 侧边栏页面 */}
      <div className="mt-4 text-xs text-white/60">侧边栏显示的页面</div>
      <div className="mt-1.5 flex flex-wrap gap-2" aria-label="侧边栏显示的页面">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const hideable = HIDEABLE_PAGES.includes(item.key)
          const shown = !hidden.includes(item.key)
          return (
            <button
              key={item.key}
              role="checkbox"
              aria-checked={shown}
              disabled={!hideable}
              title={hideable ? (shown ? '点击隐藏' : '点击显示') : '始终显示'}
              onClick={() => togglePage(item.key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors disabled:cursor-default ${
                shown
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : 'border-white/10 bg-white/5 text-white/40 line-through'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {hideable ? (
                shown ? (
                  <Eye className="h-3.5 w-3.5 text-white/50" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )
              ) : (
                <Lock className="h-3.5 w-3.5 text-white/40" />
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 text-xs text-white/40">隐藏的页面只是不在侧边栏显示，从主页等处的按钮仍然可以打开</div>

      {/* 欢迎语 */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="block">
          <span className="text-xs text-white/60">主页欢迎语</span>
          <input
            ref={welcomeInputs.welcomeTitle}
            value={text.welcomeTitle}
            maxLength={60}
            placeholder={DEFAULT_WELCOME_TITLE}
            aria-label="主页欢迎语"
            onFocus={() => (lastWelcome.current = 'welcomeTitle')}
            onChange={(e) => change('welcomeTitle', e.target.value)}
            onBlur={() => trim('welcomeTitle')}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-white/60">欢迎语下方的说明</span>
          <input
            ref={welcomeInputs.welcomeSubtitle}
            value={text.welcomeSubtitle}
            maxLength={120}
            placeholder={DEFAULT_WELCOME_SUBTITLE}
            aria-label="欢迎语下方的说明"
            onFocus={() => (lastWelcome.current = 'welcomeSubtitle')}
            onChange={(e) => change('welcomeSubtitle', e.target.value)}
            onBlur={() => trim('welcomeSubtitle')}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/50">
        插入：
        {WELCOME_VARIABLES.map((v) => (
          <button
            key={v.key}
            // 按下时不让输入框失去焦点，才能插入到光标处
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertVariable(v.key)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10 hover:text-white"
          >
            {v.label} <span className="font-mono text-white/40">{v.key}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-black/20 px-4 py-3" aria-label="欢迎语预览">
        <div className="text-xs text-white/40">预览</div>
        <div className="mt-1 text-lg font-bold">
          {renderWelcome(text.welcomeTitle || DEFAULT_WELCOME_TITLE, values)}
        </div>
        <div className="mt-0.5 text-sm text-white/60">
          {renderWelcome(text.welcomeSubtitle || DEFAULT_WELCOME_SUBTITLE, values)}
        </div>
      </div>
    </div>
  )
}

export default LayoutSettings
