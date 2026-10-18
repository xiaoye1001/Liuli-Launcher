import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, Type } from 'lucide-react'

/** 常见字体的中文名称（系统返回的一般是英文名） */
const FONT_LABELS: Record<string, string> = {
  'Microsoft YaHei': '微软雅黑',
  'Microsoft YaHei UI': '微软雅黑 UI',
  'Microsoft JhengHei': '微软正黑体',
  DengXian: '等线',
  SimSun: '宋体',
  NSimSun: '新宋体',
  SimHei: '黑体',
  KaiTi: '楷体',
  FangSong: '仿宋',
  YouYuan: '幼圆',
  LiSu: '隶书',
  STXihei: '华文细黑',
  STKaiti: '华文楷体',
  STSong: '华文宋体',
  'PingFang SC': '苹方',
  'Hiragino Sans GB': '冬青黑体',
  'Source Han Sans SC': '思源黑体',
  'Source Han Serif SC': '思源宋体',
  'Noto Sans SC': '思源黑体',
  'Noto Sans CJK SC': '思源黑体',
  'Noto Serif SC': '思源宋体',
  'Noto Serif CJK SC': '思源宋体',
  'HarmonyOS Sans SC': '鸿蒙黑体',
  'LXGW WenKai': '霞鹜文楷',
  'LXGW WenKai Screen': '霞鹜文楷 屏幕阅读版',
  'Smiley Sans': '得意黑',
  'WenQuanYi Micro Hei': '文泉驿微米黑',
  'Sarasa Gothic SC': '更纱黑体'
}

/** 无法读取系统字体时提供的常用字体 */
const COMMON_FONTS = [
  'Microsoft YaHei',
  'DengXian',
  'SimHei',
  'SimSun',
  'KaiTi',
  'PingFang SC',
  'Source Han Sans SC',
  'Noto Sans SC',
  'HarmonyOS Sans SC',
  'MiSans',
  'LXGW WenKai',
  'Segoe UI',
  'Arial',
  'Consolas'
]

/** 一次最多显示的字体数量（每个字体都要加载，太多会卡） */
const MAX_SHOWN = 150

type LocalFont = { family: string }
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFont[]>
  }
}

function label(family: string): string {
  const zh = FONT_LABELS[family]
  return zh ? `${zh}（${family}）` : family
}

/** 系统字体列表（打开过一次后缓存） */
let cachedFonts: string[] | null = null

async function loadFonts(): Promise<string[] | null> {
  if (cachedFonts) return cachedFonts
  if (!window.queryLocalFonts) return null
  try {
    const fonts = await window.queryLocalFonts()
    const families = [...new Set(fonts.map((f) => f.family).filter(Boolean))]
    // 有中文名的常用字体排在前面，其余按名称排序
    families.sort((a, b) => Number(!FONT_LABELS[a]) - Number(!FONT_LABELS[b]) || a.localeCompare(b))
    cachedFonts = families.length > 0 ? families : null
    return cachedFonts
  } catch {
    return null
  }
}

/** 界面字体选择：列出系统已安装的字体，可搜索，每个字体用它自己显示 */
function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [fonts, setFonts] = useState<string[] | null>(cachedFonts)
  const [loading, setLoading] = useState(false)
  const [fallback, setFallback] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (): void => {
    if (open) return setOpen(false)
    setOpen(true)
    setQuery('')
    if (fonts) return
    // 读取系统字体需要在点击时发起
    setLoading(true)
    void loadFonts().then((list) => {
      setLoading(false)
      setFallback(!list)
      setFonts(list ?? COMMON_FONTS)
    })
  }

  const choose = (font: string): void => {
    onChange(font)
    setOpen(false)
  }

  const keyword = query.trim().toLowerCase()
  const matches = useMemo(
    () => (fonts ?? []).filter((f) => !keyword || label(f).toLowerCase().includes(keyword)),
    [fonts, keyword]
  )
  const exact = matches.some((f) => f.toLowerCase() === keyword)

  return (
    <div ref={root} className="relative">
      <button
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="界面字体"
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-left hover:bg-black/30"
      >
        <Type className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="flex-1 truncate text-sm" style={value ? { fontFamily: `"${value}"` } : undefined}>
          {value ? label(value) : '默认字体'}
        </span>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[rgb(var(--c-popover))] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索字体，或输入字体名称"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="字体列表">
            {!keyword && <FontOption family="" selected={!value} onClick={() => choose('')} />}
            {keyword && !exact && (
              <button
                onClick={() => choose(query.trim())}
                className="w-full px-4 py-2 text-left text-sm text-emerald-300 hover:bg-white/10"
              >
                使用「{query.trim()}」
              </button>
            )}
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在读取系统字体…
              </div>
            )}
            {matches.slice(0, MAX_SHOWN).map((f) => (
              <FontOption key={f} family={f} selected={f === value} onClick={() => choose(f)} />
            ))}
            {matches.length > MAX_SHOWN && (
              <div className="px-4 py-2 text-xs text-white/40">
                还有 {matches.length - MAX_SHOWN} 个字体，输入名称搜索
              </div>
            )}
          </div>
          {fallback && (
            <div className="border-t border-white/10 px-4 py-2 text-xs text-white/40">
              无法读取系统字体列表，以上是常用字体；没有安装的字体会显示为默认字体
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FontOption({
  family,
  selected,
  onClick
}: {
  family: string
  selected: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/10 ${selected ? 'bg-emerald-500/15' : ''}`}
    >
      <span className="flex-1 truncate text-sm" style={family ? { fontFamily: `"${family}"` } : undefined}>
        {family ? label(family) : '默认字体'}
      </span>
      <span className="shrink-0 text-xs text-white/40" style={family ? { fontFamily: `"${family}"` } : undefined}>
        琉璃 Aa 123
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-emerald-300" />}
    </button>
  )
}

export default FontPicker
