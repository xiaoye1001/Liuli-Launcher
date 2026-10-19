/**
 * 设置 → 个性化：主题方案、我的主题（保存 / 导入 / 导出）、按时间自动切换、背景粒子特效与鼠标视差。
 * 主题色、面板质感、壁纸、模糊与遮罩等细节调整在下方的「外观」中。
 */
import { useState } from 'react'
import {
  Check,
  Clock,
  Download,
  Film,
  Moon,
  MousePointer2,
  Move3d,
  Pause,
  Plus,
  Save,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  X
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import {
  PARTICLE_OPTIONS,
  THEME_PRESET_LIST,
  presetInfo,
  presetPatch,
  targetName,
  type ThemePresetInfo
} from '../themes/presets'
import { backgroundUrl } from '../utils/appearance'
import { isVideoBackground } from '../components/AppBackground'
import { MAX_CUSTOM_THEMES, sanitizeAutoTheme, themeDataFrom, themePatch, themePeriodAt } from '../../../shared/theme'
import type { AppSettings, AutoThemeSettings, CustomTheme, ParticleDensity, ThemeData } from '../../../shared/types'

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
  updateSlider: (patch: Partial<AppSettings>) => void
}

const PAUSE_TEXT: Record<string, string> = {
  game: '游戏运行中，背景动画与粒子已暂停',
  hidden: '窗口已最小化，背景动画已暂停',
  animations: '已关闭界面动画，背景保持静止',
  'reduced-motion': '系统设置了「减少动态效果」，背景保持静止'
}

const DENSITY_OPTIONS: { key: ParticleDensity; label: string }[] = [
  { key: 'low', label: '稀疏' },
  { key: 'normal', label: '正常' },
  { key: 'high', label: '密集' }
]

function cleanError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/20'}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-[#fff] shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
      />
    </button>
  )
}

/** 主题卡片上的小预览：底色 + 光斑 + 主题色圆点 */
function PresetPreview({ preset }: { preset: ThemePresetInfo }): JSX.Element {
  return (
    <div className="relative h-20 overflow-hidden rounded-lg" style={{ background: preset.preview }}>
      {preset.glow.map((color, i) => (
        <div
          key={i}
          className="preset-preview-glow"
          style={{
            width: 56,
            height: 56,
            background: color,
            opacity: preset.mode === 'light' ? 0.9 : 0.55,
            left: `${[8, 55, 30][i] ?? 10}%`,
            top: `${[-20, 10, 45][i] ?? 0}%`
          }}
        />
      ))}
      {/* 迷你面板：示意毛玻璃卡片 */}
      <div
        className="absolute bottom-2 left-2 right-8 h-5 rounded-md border"
        style={{
          background: preset.mode === 'light' ? 'rgb(255 255 255 / 0.6)' : 'rgb(255 255 255 / 0.08)',
          borderColor: preset.mode === 'light' ? 'rgb(255 255 255 / 0.8)' : 'rgb(255 255 255 / 0.12)'
        }}
      />
      {preset.accent && (
        <div
          className="absolute bottom-2.5 right-2.5 h-4 w-4 rounded-full shadow-lg"
          style={{ background: preset.accent, boxShadow: `0 0 12px ${preset.accent}` }}
        />
      )}
      <div className="absolute left-2 top-1.5 text-lg">{preset.emoji}</div>
    </div>
  )
}

/** 主题数据实际使用的主题色（自定义颜色或预设色名） */
function accentOf(data: ThemeData): string {
  if (data.accentColor === 'custom') return data.customAccent
  const named: Record<string, string> = {
    emerald: '#10b981',
    sky: '#0ea5e9',
    violet: '#8b5cf6',
    rose: '#f43f5e',
    amber: '#f59e0b',
    teal: '#14b8a6',
    indigo: '#6366f1',
    red: '#ef4444',
    lime: '#84cc16',
    slate: '#64748b'
  }
  return named[data.accentColor] ?? '#10b981'
}

/** 我的主题卡片预览：有壁纸时显示壁纸，否则显示主题方案的底色 */
function CustomPreview({ theme, library }: { theme: CustomTheme; library: string[] }): JSX.Element {
  const { data } = theme
  const preset = presetInfo(data.themePreset)
  const wallpaper =
    data.backgroundMode === 'fixed' && data.backgroundImage && library.includes(data.backgroundImage)
      ? data.backgroundImage
      : ''
  const accent = accentOf(data)
  return (
    <div
      className="relative h-16 overflow-hidden rounded-lg bg-cover bg-center"
      style={
        wallpaper && !isVideoBackground(wallpaper)
          ? { backgroundImage: `url("${backgroundUrl(wallpaper)}")` }
          : { background: data.theme === 'light' && preset.mode !== 'light' ? '#e2e8f0' : preset.preview }
      }
    >
      {wallpaper && isVideoBackground(wallpaper) && (
        <video
          src={backgroundUrl(wallpaper)}
          muted
          preload="metadata"
          className="pointer-events-none h-full w-full object-cover"
        />
      )}
      {!wallpaper &&
        preset.glow
          .slice(0, 2)
          .map((color, i) => (
            <div
              key={i}
              className="preset-preview-glow"
              style={{ width: 44, height: 44, background: color, opacity: 0.5, left: `${[10, 55][i]}%`, top: '-10%' }}
            />
          ))}
      <div
        className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full"
        style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
      />
      {wallpaper && isVideoBackground(wallpaper) && (
        <Film className="absolute left-1.5 top-1.5 h-3.5 w-3.5 text-white drop-shadow" />
      )}
    </div>
  )
}

function sameTheme(a: ThemeData, b: ThemeData): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function Personalization({ settings, update, updateSlider }: Props): JSX.Element {
  const { pauseReason, particles } = useTheme()
  const current = settings.themePreset ?? 'aurora'
  const particle = settings.particleEffect ?? 'auto'
  const customThemes = Array.isArray(settings.customThemes) ? settings.customThemes : []
  const library = Array.isArray(settings.backgroundImages) ? settings.backgroundImages : []
  const auto = sanitizeAutoTheme(settings.autoTheme)
  const currentData = themeDataFrom(settings)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const run = async (action: () => Promise<string | null | void>): Promise<void> => {
    setMessage(null)
    try {
      const text = await action()
      if (text) setMessage({ text })
    } catch (e) {
      setMessage({ text: cleanError(e), error: true })
    }
  }

  const saveCurrent = (): void => {
    const theme: CustomTheme = {
      id: crypto.randomUUID(),
      name: name.trim() || `我的主题 ${customThemes.length + 1}`,
      createdAt: Date.now(),
      data: currentData
    }
    void run(async () => {
      await update({ customThemes: [...customThemes, theme] })
      setNaming(false)
      setName('')
      return `已保存「${theme.name}」`
    })
  }

  const removeTheme = (theme: CustomTheme): void => {
    void run(async () => {
      // 自动切换正在使用这个主题时，改回默认的预设
      const patchAuto: Partial<AppSettings> = {}
      if (auto.day === `custom:${theme.id}` || auto.night === `custom:${theme.id}`) {
        patchAuto.autoTheme = {
          ...auto,
          day: auto.day === `custom:${theme.id}` ? 'preset:sky' : auto.day,
          night: auto.night === `custom:${theme.id}` ? 'preset:aurora' : auto.night
        }
      }
      await update({ customThemes: customThemes.filter((t) => t.id !== theme.id), ...patchAuto })
      return `已删除「${theme.name}」`
    })
  }

  const exportTheme = (themeId?: string): void => {
    void run(async () => {
      const result = await window.api.exportTheme(themeId)
      if (!result) return null
      return result.wallpaperSkipped
        ? `已导出到 ${result.path}（壁纸超过 20 MB 或无法识别，没有一起打包）`
        : `已导出到 ${result.path}`
    })
  }

  const importTheme = (): void => {
    void run(async () => {
      const result = await window.api.importTheme()
      if (!result) return null
      return `已导入并应用「${result.name}」`
    })
  }

  const setAuto = (patch: Partial<AutoThemeSettings>): void => {
    void update({ autoTheme: { ...auto, ...patch } })
  }

  const period = themePeriodAt(auto)
  const targetOptions = (
    <>
      <optgroup label="主题方案">
        {THEME_PRESET_LIST.map((p) => (
          <option key={p.key} value={`preset:${p.key}`}>
            {p.emoji} {p.name}
          </option>
        ))}
      </optgroup>
      {customThemes.length > 0 && (
        <optgroup label="我的主题">
          {customThemes.map((t) => (
            <option key={t.id} value={`custom:${t.id}`}>
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
  const selectClass =
    'min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-emerald-400/50'
  const timeClass =
    'w-32 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-emerald-400/50'

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Wand2 className="h-5 w-5 text-emerald-300" />
        <div>
          <h2 className="text-lg font-semibold">主题方案</h2>
          <p className="text-xs text-white/50">一键切换配色、明暗与专属动态背景，之后仍可在下方微调主题色和面板质感</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-3" role="radiogroup" aria-label="主题方案">
        {THEME_PRESET_LIST.map((preset) => {
          const active = current === preset.key
          return (
            <button
              key={preset.key}
              role="radio"
              aria-checked={active}
              data-preset-card={preset.key}
              onClick={() => update(presetPatch(preset.key))}
              className={`group relative rounded-xl border p-2 text-left transition-all ${
                active
                  ? 'border-emerald-400/70 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-white/5 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <PresetPreview preset={preset} />
              <div className="mt-2 flex items-center gap-1.5 px-0.5">
                <span className="truncate text-sm font-medium">{preset.name}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
              </div>
              <div className="truncate px-0.5 text-[11px] text-white/50" title={preset.desc}>
                {preset.desc}
              </div>
            </button>
          )
        })}
      </div>

      {/* 我的主题 */}
      <div className="mt-6 flex items-center gap-2">
        <div className="text-sm font-medium">我的主题</div>
        <span className="text-xs text-white/40">
          {customThemes.length} / {MAX_CUSTOM_THEMES}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={importTheme}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
          >
            <Upload className="h-3.5 w-3.5" />
            导入主题…
          </button>
          <button
            onClick={() => exportTheme()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
            导出当前外观…
          </button>
          {!naming && customThemes.length < MAX_CUSTOM_THEMES && (
            <button
              onClick={() => setNaming(true)}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs hover:bg-emerald-500/25"
            >
              <Save className="h-3.5 w-3.5" />
              保存当前外观
            </button>
          )}
        </div>
      </div>
      {naming && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            saveCurrent()
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder={`我的主题 ${customThemes.length + 1}`}
            aria-label="主题名称"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-emerald-400/50"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500/80 px-4 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" />
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false)
              setName('')
            }}
            className="rounded-xl p-2 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="取消"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
      {customThemes.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 px-4 py-4 text-center text-xs text-white/40">
          调好主题、主题色、壁纸和粒子后，点「保存当前外观」存成自己的主题，也可以导入别人分享的 .liulitheme 文件
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-3" aria-label="我的主题">
          {customThemes.map((theme) => {
            const active = sameTheme(theme.data, currentData)
            return (
              <div key={theme.id} className="group relative" data-custom-theme={theme.name}>
                <button
                  onClick={() => update(themePatch(theme.data, library))}
                  title="应用这个主题"
                  className={`block w-full rounded-xl border p-2 text-left transition-all ${
                    active
                      ? 'border-emerald-400/70 bg-emerald-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
                  }`}
                >
                  <CustomPreview theme={theme} library={library} />
                  <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    <span className="truncate text-sm font-medium">{theme.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                  </div>
                </button>
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    onClick={() => exportTheme(theme.id)}
                    title="导出"
                    aria-label={`导出 ${theme.name}`}
                    className="rounded-md bg-black/60 p-1 text-white/80 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeTheme(theme)}
                    title="删除"
                    aria-label={`删除 ${theme.name}`}
                    className="rounded-md bg-black/60 p-1 text-white/80 hover:bg-red-500/80 hover:text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {message && (
        <div
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${message.error ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {/* 按时间自动切换 */}
      <div className="mt-6 rounded-xl bg-black/20 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-emerald-300" />
            <div>
              <div className="text-sm font-medium">按时间自动切换主题</div>
              <div className="text-xs text-white/50">
                白天和夜晚各用一套主题，到点自动切换；中途手动换的主题保留到下一个切换点
              </div>
            </div>
          </div>
          <Switch
            checked={auto.enabled}
            onChange={() => setAuto({ enabled: !auto.enabled })}
            label="按时间自动切换主题"
          />
        </div>
        {auto.enabled && (
          <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2 text-sm">
              <Sun className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="w-10 shrink-0">白天</span>
              <span className="shrink-0 text-xs text-white/50">从</span>
              <input
                type="time"
                value={auto.dayStart}
                onChange={(e) => e.target.value && setAuto({ dayStart: e.target.value })}
                aria-label="白天开始时间"
                className={timeClass}
              />
              <span className="shrink-0 text-xs text-white/50">起使用</span>
              <select
                value={auto.day}
                onChange={(e) => setAuto({ day: e.target.value })}
                aria-label="白天的主题"
                className={selectClass}
              >
                {targetOptions}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Moon className="h-4 w-4 shrink-0 text-indigo-300" />
              <span className="w-10 shrink-0">夜晚</span>
              <span className="shrink-0 text-xs text-white/50">从</span>
              <input
                type="time"
                value={auto.nightStart}
                onChange={(e) => e.target.value && setAuto({ nightStart: e.target.value })}
                aria-label="夜晚开始时间"
                className={timeClass}
              />
              <span className="shrink-0 text-xs text-white/50">起使用</span>
              <select
                value={auto.night}
                onChange={(e) => setAuto({ night: e.target.value })}
                aria-label="夜晚的主题"
                className={selectClass}
              >
                {targetOptions}
              </select>
            </div>
            <div className="text-xs text-white/40" data-auto-status>
              现在是{period === 'day' ? '白天' : '夜晚'}，使用「
              {targetName(period === 'day' ? auto.day : auto.night, customThemes)}」
            </div>
          </div>
        )}
      </div>

      {/* 粒子特效 */}
      <div className="mt-6 flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-emerald-300" />
        背景粒子特效
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="背景粒子特效">
        {PARTICLE_OPTIONS.map((option) => {
          const active = particle === option.key
          return (
            <button
              key={option.key}
              role="radio"
              aria-checked={active}
              onClick={() => update({ particleEffect: option.key })}
              className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-white/60">粒子数量</div>
          <div className="mt-2 flex rounded-xl bg-black/20 p-1" role="radiogroup" aria-label="粒子数量">
            {DENSITY_OPTIONS.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-checked={settings.particleDensity === o.key}
                onClick={() => update({ particleDensity: o.key })}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  settings.particleDensity === o.key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <div className="flex justify-between text-xs text-white/60">
            <span>粒子速度</span>
            <span>{settings.particleSpeed ?? 100}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={200}
            step={10}
            value={settings.particleSpeed ?? 100}
            aria-label="粒子速度"
            onChange={(e) => updateSlider({ particleSpeed: Number(e.target.value) })}
            className="mt-3 w-full accent-emerald-500"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MousePointer2 className="h-4 w-4 text-white/50" />
          <div>
            <div className="text-sm">鼠标互动</div>
            <div className="text-xs text-white/50">鼠标靠近时，花瓣、星尘、萤火虫等粒子会轻轻躲开</div>
          </div>
        </div>
        <Switch
          checked={settings.particleInteract !== false}
          onChange={() => update({ particleInteract: settings.particleInteract === false })}
          label="鼠标互动"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Move3d className="h-4 w-4 text-white/50" />
          <div>
            <div className="text-sm">鼠标视差</div>
            <div className="text-xs text-white/50">移动鼠标时背景光斑、壁纸和粒子分层轻微移动，带来立体感</div>
          </div>
        </div>
        <Switch
          checked={settings.parallax !== false}
          onChange={() => update({ parallax: settings.parallax === false })}
          label="鼠标视差"
        />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/40">
        {pauseReason ? (
          <>
            <Pause className="h-3.5 w-3.5" />
            {PAUSE_TEXT[pauseReason]}
          </>
        ) : (
          <>
            {particles ? `当前显示：${PARTICLE_OPTIONS.find((o) => o.key === particles)?.label}。` : '当前不显示粒子。'}
            启动游戏或最小化窗口时会自动暂停，不占用性能
          </>
        )}
      </div>
    </section>
  )
}

export default Personalization
