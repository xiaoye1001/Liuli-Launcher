import { useState } from 'react'
import { Check, Loader2, Music2 } from 'lucide-react'
import { BUILTIN_THEMES, builtinMusicName, builtinWallpaperName } from '../../../shared/builtinThemes'
import type { AppSettings } from '../../../shared/types'
import plains from '../assets/themes/plains.webp'
import cherry from '../assets/themes/cherry.webp'
import auroraNight from '../assets/themes/aurora_night.webp'
import nether from '../assets/themes/nether.webp'
import theEnd from '../assets/themes/the_end.webp'

/** 精选主题的缩略图（打包进界面，体积很小；原图在 resources/themes） */
const THUMBNAILS: Record<string, string> = {
  plains,
  cherry,
  aurora_night: auroraNight,
  nether,
  the_end: theEnd
}

/**
 * 精选主题：启动器自带的几套完整外观（原创高清壁纸 + 原创背景音乐），点一下就应用。
 * 应用时会把壁纸放进背景库、音乐放进音乐文件夹，之后也能在背景库、音乐列表里单独使用或删除
 */
function BuiltinThemeGallery({
  settings,
  onMessage
}: {
  settings: AppSettings
  onMessage: (text: string, error?: boolean) => void
}): JSX.Element {
  const [applying, setApplying] = useState('')

  const apply = async (id: string, name: string): Promise<void> => {
    if (applying) return
    setApplying(id)
    try {
      await window.api.applyBuiltinTheme(id)
      onMessage(`已应用「${name}」，背景音乐已切换为主题音乐`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      onMessage(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true)
    } finally {
      setApplying('')
    }
  }

  return (
    <div className="mt-3 grid grid-cols-5 gap-3" aria-label="精选主题">
      {BUILTIN_THEMES.map((theme) => {
        const active =
          settings.backgroundMode === 'fixed' &&
          settings.backgroundImage === builtinWallpaperName(theme.id) &&
          settings.themeMusic === builtinMusicName(theme)
        const busy = applying === theme.id
        return (
          <button
            key={theme.id}
            onClick={() => void apply(theme.id, theme.name)}
            disabled={!!applying}
            title={`${theme.description}\n背景音乐：${theme.musicTitle}`}
            data-builtin-theme={theme.id}
            className={`group overflow-hidden rounded-xl border text-left transition-all disabled:cursor-wait ${
              active
                ? 'border-emerald-400/70 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
            }`}
          >
            <div className="relative aspect-video overflow-hidden">
              <img
                src={THUMBNAILS[theme.id]}
                alt=""
                draggable={false}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
                <Music2 className="h-3 w-3" />
                原创音乐
              </span>
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="truncate text-sm font-medium">{theme.name}</span>
              {active && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default BuiltinThemeGallery
