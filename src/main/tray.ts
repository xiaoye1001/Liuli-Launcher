import { app, dialog, Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'
import { getGameStatus, killGame, onGameStatusChange } from './launch'
import { openLogWindow } from './logWindow'
import { getMainWindow } from './windows'

/**
 * 系统托盘图标：启动器窗口隐藏或最小化时（例如「游戏启动后隐藏启动器」），可以从托盘打开窗口、
 * 打开游戏日志或结束游戏。可以在设置里关闭
 */
let tray: Tray | null = null
let listening = false

function showWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

async function confirmKill(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: '结束游戏',
    message: '强制结束正在运行的游戏？',
    detail: '没有保存的进度会丢失。游戏卡死或无法正常关闭时才需要这样做。',
    buttons: ['取消', '结束游戏'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (response === 1) killGame()
}

function refresh(): void {
  if (!tray || tray.isDestroyed()) return
  const game = getGameStatus()
  const running = game.state === 'running'
  const label =
    game.state === 'running'
      ? `游戏运行中：${game.versionId}`
      : game.state === 'launching'
        ? `正在启动：${game.versionId}`
        : '游戏没有运行'
  tray.setToolTip(running ? `琉璃启动器 · ${label}` : '琉璃启动器')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示琉璃启动器', click: showWindow },
      { type: 'separator' },
      { label, enabled: false },
      { label: '打开游戏日志', click: () => openLogWindow() },
      { label: '结束游戏…', enabled: running, click: () => void confirmKill() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
}

/** 按设置显示或去掉托盘图标（启动时和设置变化时调用） */
export function syncTray(enabled: boolean): void {
  if (!enabled) {
    if (tray && !tray.isDestroyed()) tray.destroy()
    tray = null
    return
  }
  if (tray && !tray.isDestroyed()) return
  try {
    const image = nativeImage.createFromPath(icon).resize({ width: process.platform === 'darwin' ? 18 : 32 })
    tray = new Tray(image)
  } catch (e) {
    // 有的 Linux 桌面环境没有托盘
    console.warn('无法创建托盘图标：', e)
    tray = null
    return
  }
  // macOS 上点击图标显示菜单；Windows、Linux 上单击打开窗口，右键显示菜单
  if (process.platform !== 'darwin') tray.on('click', showWindow)
  if (!listening) {
    listening = true
    onGameStatusChange(() => refresh())
  }
  refresh()
}
