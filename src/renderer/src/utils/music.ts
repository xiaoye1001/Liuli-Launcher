import { useSyncExternalStore } from 'react'
import type { AppSettings, GameStatus, MusicOrder } from '../../../shared/types'

/** 背景音乐的播放状态（整个主窗口共用一个播放器） */
export interface MusicState {
  enabled: boolean
  tracks: string[]
  current: string
  /** 正在发出声音 */
  playing: boolean
  /** 用户按了暂停 */
  userPaused: boolean
  /** 因游戏运行而暂停 */
  gamePaused: boolean
  error: string
  /** 正在只循环播放当前主题的专属音乐（音乐文件夹里有这首时） */
  themeTrack: string
}

let state: MusicState = {
  enabled: false,
  tracks: [],
  current: '',
  playing: false,
  userPaused: false,
  gamePaused: false,
  error: '',
  themeTrack: ''
}
let volume = 40
let order: MusicOrder = 'sequential'
let pauseInGame = true
/** 设置里的主题音乐（文件可能已经被删除，实际是否生效看 state.themeTrack） */
let themeMusic = ''
let gameRunning = false
/** 连续播放失败的次数：全部失败时停下，避免一直循环 */
let failures = 0
/** 随机播放时最近播过的曲目，避免很快重复 */
const history: string[] = []

const listeners = new Set<() => void>()
const audio = new Audio()
audio.preload = 'auto'

function set(patch: Partial<MusicState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function musicUrl(name: string): string {
  return `liuli://music/${encodeURIComponent(name)}`
}

/** 曲目名称：去掉扩展名 */
export function trackTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** 音量用平方曲线，小音量时调节更细 */
function targetVolume(): number {
  return Math.pow(Math.min(100, Math.max(0, volume)) / 100, 2)
}

// ---- 淡入淡出 ----
let fadeTimer: ReturnType<typeof setInterval> | undefined
function fadeTo(target: number, ms: number, done?: () => void): void {
  clearInterval(fadeTimer)
  const start = audio.volume
  const steps = Math.max(1, Math.round(ms / 30))
  let i = 0
  fadeTimer = setInterval(() => {
    i++
    audio.volume = Math.min(1, Math.max(0, start + ((target - start) * i) / steps))
    if (i >= steps) {
      clearInterval(fadeTimer)
      done?.()
    }
  }, 30)
}

/** 实际播放的列表：主题有专属音乐时只播这一首，否则播放全部音乐 */
function playlist(): string[] {
  return state.themeTrack ? [state.themeTrack] : state.tracks
}

/** 根据设置和音乐列表算出主题音乐是否生效 */
function updateThemeTrack(): boolean {
  const themeTrack = themeMusic && state.tracks.includes(themeMusic) ? themeMusic : ''
  if (themeTrack === state.themeTrack) return false
  set({ themeTrack })
  return true
}

function shouldPlay(): boolean {
  return state.enabled && state.tracks.length > 0 && !state.userPaused && !state.gamePaused
}

function pickNext(direction: 1 | -1): string {
  const tracks = playlist()
  const { current } = state
  if (tracks.length === 0) return ''
  if (order === 'shuffle' && tracks.length > 1) {
    if (direction === -1 && history.length > 1) {
      history.pop()
      const prev = history[history.length - 1]
      if (tracks.includes(prev)) return prev
    }
    // 尽量不选最近播过的一半曲目
    const recent = new Set(history.slice(-Math.floor(tracks.length / 2)))
    const pool = tracks.filter((t) => t !== current && !recent.has(t))
    const list = pool.length ? pool : tracks.filter((t) => t !== current)
    return list[Math.floor(Math.random() * list.length)]
  }
  const index = tracks.indexOf(current)
  return tracks[(index + direction + tracks.length) % tracks.length]
}

function load(name: string): void {
  if (!name) return
  set({ current: name, error: '' })
  if (history[history.length - 1] !== name) history.push(name)
  if (history.length > 50) history.shift()
  audio.src = musicUrl(name)
  audio.loop = order === 'single' || state.themeTrack !== ''
}

/** 根据当前状态开始或停止播放 */
function sync(): void {
  if (!shouldPlay()) {
    if (!audio.paused) fadeTo(0, 400, () => audio.pause())
    set({ playing: false })
    return
  }
  const list = playlist()
  if (!state.current || !list.includes(state.current)) load(list[0])
  if (audio.paused) {
    audio.volume = 0
    void audio.play().catch(() => undefined)
  }
  fadeTo(targetVolume(), 600)
}

audio.addEventListener('playing', () => {
  failures = 0
  set({ playing: true })
})
audio.addEventListener('pause', () => set({ playing: false }))
audio.addEventListener('ended', () => {
  load(pickNext(1))
  sync()
})
audio.addEventListener('error', () => {
  if (!state.current) return
  failures++
  if (failures >= state.tracks.length) {
    set({ playing: false, error: `无法播放「${trackTitle(state.current)}」，文件可能已损坏或格式不受支持` })
    return
  }
  // 播放失败时跳到下一首
  load(pickNext(1))
  sync()
})

function applySettings(settings: AppSettings): void {
  volume = Number.isFinite(settings.musicVolume) ? settings.musicVolume : 40
  order = settings.musicOrder ?? 'sequential'
  pauseInGame = settings.musicPauseInGame !== false
  themeMusic = typeof settings.themeMusic === 'string' ? settings.themeMusic : ''
  // 主题音乐是刚复制进音乐文件夹的：重新读取列表后再切换
  if (themeMusic && !state.tracks.includes(themeMusic)) void refreshMusic()
  // 切换到带音乐的主题（或取消）：淡出当前曲目，换成主题音乐（或全部音乐的第一首）
  if (updateThemeTrack() && state.current && !playlist().includes(state.current)) {
    const next = playlist()[0]
    if (!audio.paused) {
      fadeTo(0, 500, () => {
        load(next)
        sync()
      })
    } else load(next)
  }
  audio.loop = order === 'single' || state.themeTrack !== ''
  const enabled = settings.musicEnabled === true
  // 重新开启时取消之前的手动暂停
  set({
    enabled,
    userPaused: enabled && !state.enabled ? false : state.userPaused,
    gamePaused: pauseInGame && gameRunning
  })
  if (!audio.paused) fadeTo(targetVolume(), 200)
  sync()
}

function applyGameStatus(status: GameStatus): void {
  gameRunning = status.state === 'launching' || status.state === 'running'
  const gamePaused = pauseInGame && gameRunning
  if (gamePaused !== state.gamePaused) {
    set({ gamePaused })
    sync()
  }
}

/** 重新读取 music 文件夹（添加、删除，或用户直接往文件夹里放了文件） */
export async function refreshMusic(): Promise<void> {
  const tracks = await window.api.listMusic().catch(() => state.tracks)
  const same = tracks.length === state.tracks.length && tracks.every((t, i) => t === state.tracks[i])
  if (same) return
  failures = 0
  set({ tracks, error: '' })
  const themeChanged = updateThemeTrack()
  if (state.current && !tracks.includes(state.current)) {
    // 正在播放的曲目被删除了
    audio.pause()
    audio.removeAttribute('src')
    set({ current: '' })
  } else if (themeChanged && state.current && !playlist().includes(state.current)) {
    // 主题音乐刚复制进来：换成主题音乐
    load(playlist()[0])
  }
  sync()
}

let started = false
/** 只在主窗口调用一次 */
export function initMusic(): void {
  if (started) return
  started = true
  void Promise.all([window.api.getSettings(), window.api.getGameStatus(), window.api.listMusic()]).then(
    ([settings, status, tracks]) => {
      gameRunning = status.state === 'launching' || status.state === 'running'
      // 启动时从随机一首开始（随机播放）或第一首开始；主题有专属音乐时从那一首开始
      set({ tracks })
      themeMusic = typeof settings.themeMusic === 'string' ? settings.themeMusic : ''
      updateThemeTrack()
      if (state.themeTrack) load(state.themeTrack)
      else if (settings.musicOrder === 'shuffle' && tracks.length) {
        load(tracks[Math.floor(Math.random() * tracks.length)])
      }
      applySettings(settings)
      window.api.onSettingsChanged(applySettings)
      window.api.onGameStatus(applyGameStatus)
    }
  )
  // 切回启动器时重新扫描文件夹，用户直接放进去的音乐也能出现
  window.addEventListener('focus', () => void refreshMusic())
}

// ---- 控制 ----
export function togglePlay(): void {
  if (state.tracks.length === 0) return
  failures = 0
  // 按实际播放状态切换：出错或自动播放失败（没在播放）时，点一次就重新播放
  set({ userPaused: state.playing, error: '' })
  sync()
}

/** 手动切歌或选择其他曲目：不再只播主题音乐，回到全部音乐 */
function leaveThemeMusic(): void {
  if (!state.themeTrack) return
  themeMusic = ''
  set({ themeTrack: '' })
  void window.api.updateSettings({ themeMusic: '' }).catch(() => undefined)
}

export function nextTrack(): void {
  leaveThemeMusic()
  failures = 0
  load(pickNext(1))
  set({ userPaused: false })
  audio.volume = 0
  sync()
}

export function prevTrack(): void {
  // 播放超过 3 秒时，「上一首」先回到本曲开头
  if (audio.currentTime > 3 && order !== 'shuffle') {
    audio.currentTime = 0
    return
  }
  leaveThemeMusic()
  failures = 0
  load(pickNext(-1))
  set({ userPaused: false })
  audio.volume = 0
  sync()
}

export function playTrack(name: string): void {
  if (!state.tracks.includes(name)) return
  if (name !== state.themeTrack) leaveThemeMusic()
  failures = 0
  if (name !== state.current) load(name)
  set({ userPaused: false })
  sync()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMusic(): MusicState {
  return useSyncExternalStore(subscribe, () => state)
}
