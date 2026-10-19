/**
 * 设置 → 个性化：主题方案（一键切换配色与动态背景）与背景粒子特效。
 * 主题色、面板质感、壁纸、模糊与遮罩等细节调整在下方的「外观」中。
 */
import { Check, Pause, Sparkles, Wand2 } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { PARTICLE_OPTIONS, THEME_PRESET_LIST, presetPatch, type ThemePresetInfo } from '../themes/presets'
import type { AppSettings } from '../../../shared/types'

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

const PAUSE_TEXT: Record<string, string> = {
  game: '游戏运行中，背景动画与粒子已暂停',
  hidden: '窗口已最小化，背景动画已暂停',
  animations: '已关闭界面动画，背景保持静止',
  'reduced-motion': '系统设置了「减少动态效果」，背景保持静止'
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

function Personalization({ settings, update }: Props): JSX.Element {
  const { pauseReason, particles } = useTheme()
  const current = settings.themePreset ?? 'aurora'
  const particle = settings.particleEffect ?? 'auto'

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
      <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
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
