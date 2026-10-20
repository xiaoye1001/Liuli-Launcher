import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings } from './config'
import { getMainWindow } from './windows'
import type { GameStatus } from '../shared/types'

/**
 * 桌面启动悬浮窗：启动游戏时，如果启动器不在前台（最小化、隐藏、切到了其他窗口），
 * 在屏幕中央显示一个小的悬浮窗（发光方块动画 + 启动进度），游戏窗口出现后淡出关闭。
 * 启动器在前台时不显示（启动器里已经有全屏的启动动画）。
 * 悬浮窗不抢焦点、鼠标可以穿透，不影响正在使用的其他程序。
 */

const WIDTH = 340
const HEIGHT = 380
/** 游戏窗口出现后，留给悬浮窗播放淡出动画的时间 */
const LEAVE_DELAY = 900
/** 预览时显示多久 */
const PREVIEW_DURATION = 6500

let splash: BrowserWindow | null = null
let launching = false
/**
 * 游戏进程已经创建：游戏窗口（或 Forge / NeoForge 的加载窗口）随时会出现并获得焦点，
 * 这时不能再因为「启动器不在前台」而弹出悬浮窗，已经显示的也不再置顶，免得挡住游戏窗口
 */
let processStarted = false
let previewing = false
let closeTimer: ReturnType<typeof setTimeout> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function alive(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed()
}

/** 启动器是否在前台：主窗口可见、没有最小化，且焦点在启动器自己的某个窗口上 */
function launcherInFront(): boolean {
  const main = getMainWindow()
  if (!main || !main.isVisible() || main.isMinimized()) return false
  const focused = BrowserWindow.getFocusedWindow()
  return !!focused && focused !== splash
}

function createSplash(preview: boolean): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + (workArea.height - HEIGHT) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: '琉璃启动器 - 正在启动游戏',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  // 只是动画，鼠标点击穿透到下面的窗口
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'floating')
  win.on('closed', () => {
    if (splash === win) splash = null
  })
  const hash = preview ? 'launch-splash-preview' : 'launch-splash'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
  // 页面加载完再显示，避免闪一下白底
  win.once('ready-to-show', () => {
    if (!alive(win)) return
    if (processStarted) win.setAlwaysOnTop(false)
    if (previewing || (launching && !launcherInFront())) win.showInactive()
  })
  return win
}

/** 关闭悬浮窗（主窗口关闭时调用，保证应用能正常退出） */
export function closeLaunchSplash(): void {
  previewing = false
  launching = false
  closeSplash()
}

function closeSplash(): void {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
  if (alive(splash)) splash.destroy()
  splash = null
}

/**
 * 按当前情况显示或隐藏悬浮窗。fromFocus：由窗口焦点变化触发——游戏进程创建后，
 * 焦点离开启动器多半是游戏窗口出现了，这时只隐藏、不再新显示
 */
async function refresh(fromFocus: boolean): Promise<void> {
  if (previewing) return
  const want = launching && (await getSettings()).launchSplash && !launcherInFront()
  if (!launching) return
  if (want && fromFocus && processStarted && !(alive(splash) && splash.isVisible())) return
  if (want) {
    if (!alive(splash)) splash = createSplash(false)
    else if (!splash.isVisible() && !splash.webContents.isLoading()) splash.showInactive()
  } else if (alive(splash) && splash.isVisible()) {
    splash.hide()
  }
}

/** 等待中的判断是否由焦点变化触发（同时有状态变化时按状态变化处理） */
let pendingFromFocus = true

/** 窗口切换时焦点会短暂地不在任何窗口上：稍等一下再判断，避免悬浮窗闪烁 */
function scheduleRefresh(fromFocus: boolean): void {
  if (!launching) return
  pendingFromFocus = refreshTimer ? pendingFromFocus && fromFocus : fromFocus
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh(pendingFromFocus).catch(() => undefined)
  }, 200)
}

/** 主窗口切到前台、最小化、隐藏时重新判断（index.ts 创建主窗口后调用） */
export function watchMainWindowForSplash(win: BrowserWindow): void {
  for (const event of ['focus', 'blur', 'minimize', 'restore', 'show', 'hide'] as const) {
    win.on(event as 'focus', () => scheduleRefresh(true))
  }
}

/** 游戏状态变化（launch.ts 的 setStatus 调用） */
export function onLaunchStatusForSplash(status: GameStatus): void {
  if (status.state === 'launching') {
    if (previewing) {
      previewing = false
      closeSplash()
    }
    launching = true
    if (!status.startedAt) processStarted = false
    else if (!processStarted) {
      processStarted = true
      // 游戏窗口出现时要在悬浮窗上面
      if (alive(splash)) splash.setAlwaysOnTop(false)
    }
    scheduleRefresh(false)
    return
  }
  launching = false
  processStarted = false
  if (previewing) return
  if (status.state === 'running' && alive(splash) && splash.isVisible()) {
    // 游戏窗口出现：页面自己播放淡出动画，播完后关闭
    if (!closeTimer) closeTimer = setTimeout(closeSplash, LEAVE_DELAY)
    return
  }
  // 启动失败、取消：立即关闭，错误信息在启动器里显示
  closeSplash()
}

/** 在设置里预览悬浮窗（正在启动游戏时不预览） */
export function previewLaunchSplash(): void {
  if (launching) return
  closeSplash()
  previewing = true
  splash = createSplash(true)
  const win = splash
  closeTimer = setTimeout(() => {
    previewing = false
    if (splash === win) closeSplash()
  }, PREVIEW_DURATION)
}
