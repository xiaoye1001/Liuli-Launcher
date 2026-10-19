/**
 * 主题数据（ThemeData）的读取、校验与应用。主进程（导入、保存设置时校验）和界面（保存、应用主题）共用。
 * 导入的主题文件来自外部，所有字段都按白名单逐项检查，不认识的字段直接丢弃。
 */
import { PARTICLE_EFFECTS, THEME_PRESETS } from './types'
import type {
  AccentColor,
  AppSettings,
  AutoThemeSettings,
  BackgroundFit,
  BackgroundMode,
  CustomTheme,
  ParticleDensity,
  ParticleEffect,
  ThemeData,
  ThemeMode,
  ThemePreset
} from './types'

export const MAX_CUSTOM_THEMES = 20
export const MAX_THEME_NAME = 24

const ACCENTS: AccentColor[] = [
  'emerald',
  'sky',
  'violet',
  'rose',
  'amber',
  'teal',
  'indigo',
  'red',
  'lime',
  'slate',
  'custom'
]
const THEME_MODES: ThemeMode[] = ['system', 'dark', 'light']
const DENSITIES: ParticleDensity[] = ['low', 'normal', 'high']
const BACKGROUND_MODES: BackgroundMode[] = ['off', 'fixed', 'random', 'slideshow']
const BACKGROUND_FITS: BackgroundFit[] = ['cover', 'contain', 'stretch', 'center', 'tile']

export const DEFAULT_AUTO_THEME: AutoThemeSettings = {
  enabled: false,
  day: 'preset:sky',
  night: 'preset:aurora',
  dayStart: '07:00',
  nightStart: '19:00'
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 背景库文件名：不能带路径 */
function libraryName(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\\/]/.test(value) || value === '.' || value === '..') return ''
  return value.slice(0, 200)
}

/** 校验并补全主题数据 */
export function sanitizeThemeData(raw: unknown): ThemeData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const accent =
    typeof r.customAccent === 'string' && /^#[0-9a-f]{6}$/i.test(r.customAccent) ? r.customAccent : '#10b981'
  return {
    themePreset: pick(r.themePreset, THEME_PRESETS, 'aurora' as ThemePreset),
    theme: pick(r.theme, THEME_MODES, 'dark' as ThemeMode),
    accentColor: pick(r.accentColor, ACCENTS, 'emerald' as AccentColor),
    customAccent: accent.toLowerCase(),
    panelOpacity: num(r.panelOpacity, 0, 60, 10),
    panelBlur: num(r.panelBlur, 0, 40, 24),
    particleEffect: pick(r.particleEffect, PARTICLE_EFFECTS, 'auto' as ParticleEffect),
    particleDensity: pick(r.particleDensity, DENSITIES, 'normal' as ParticleDensity),
    particleSpeed: num(r.particleSpeed, 50, 200, 100),
    particleInteract: bool(r.particleInteract, true),
    parallax: bool(r.parallax, true),
    backgroundMode: pick(r.backgroundMode, BACKGROUND_MODES, 'off' as BackgroundMode),
    backgroundImage: libraryName(r.backgroundImage),
    backgroundFit: pick(r.backgroundFit, BACKGROUND_FITS, 'cover' as BackgroundFit),
    backgroundBlur: num(r.backgroundBlur, 0, 40, 0),
    backgroundDim: num(r.backgroundDim, 0, 90, 30)
  }
}

/** 当前设置对应的主题数据 */
export function themeDataFrom(settings: AppSettings): ThemeData {
  return sanitizeThemeData(settings)
}

/**
 * 应用主题数据时要修改的设置。壁纸已经不在背景库里时不使用壁纸。
 * 「随机」「轮播」模式使用整个背景库，不需要指定图片
 */
export function themePatch(data: ThemeData, library: string[]): Partial<AppSettings> {
  const hasWallpaper = data.backgroundImage !== '' && library.includes(data.backgroundImage)
  let backgroundMode = data.backgroundMode
  if (backgroundMode === 'fixed' && !hasWallpaper) backgroundMode = 'off'
  if ((backgroundMode === 'random' || backgroundMode === 'slideshow') && library.length === 0) backgroundMode = 'off'
  return {
    themePreset: data.themePreset,
    theme: data.theme,
    accentColor: data.accentColor,
    customAccent: data.customAccent,
    panelOpacity: data.panelOpacity,
    panelBlur: data.panelBlur,
    particleEffect: data.particleEffect,
    particleDensity: data.particleDensity,
    particleSpeed: data.particleSpeed,
    particleInteract: data.particleInteract,
    parallax: data.parallax,
    backgroundMode,
    ...(hasWallpaper ? { backgroundImage: data.backgroundImage } : {}),
    backgroundFit: data.backgroundFit,
    backgroundBlur: data.backgroundBlur,
    backgroundDim: data.backgroundDim
  }
}

export function sanitizeThemeName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : ''
  return [...name].slice(0, MAX_THEME_NAME).join('') || '我的主题'
}

/** 校验「我的主题」列表 */
export function sanitizeCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: CustomTheme[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      name: sanitizeThemeName(r.name),
      createdAt: num(r.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
      data: sanitizeThemeData(r.data)
    })
    if (result.length >= MAX_CUSTOM_THEMES) break
  }
  return result
}

function validTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
}

function validTarget(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (/^preset:/.test(value) && THEME_PRESETS.includes(value.slice(7) as ThemePreset)) return value
  if (/^custom:[\w-]{1,64}$/.test(value)) return value
  return fallback
}

export function sanitizeAutoTheme(raw: unknown): AutoThemeSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    enabled: bool(r.enabled, false),
    day: validTarget(r.day, DEFAULT_AUTO_THEME.day),
    night: validTarget(r.night, DEFAULT_AUTO_THEME.night),
    dayStart: validTime(r.dayStart, DEFAULT_AUTO_THEME.dayStart),
    nightStart: validTime(r.nightStart, DEFAULT_AUTO_THEME.nightStart)
  }
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 现在是白天还是夜晚（夜晚开始时间可以早于白天开始时间，例如凌晨切换） */
export function themePeriodAt(auto: AutoThemeSettings, date = new Date()): 'day' | 'night' {
  const now = date.getHours() * 60 + date.getMinutes()
  const day = minutesOf(auto.dayStart)
  const night = minutesOf(auto.nightStart)
  if (day === night) return 'day'
  if (day < night) return now >= day && now < night ? 'day' : 'night'
  return now >= night && now < day ? 'night' : 'day'
}
