import { Notification } from 'electron'
import { getSettings } from './config'
import { onInstallFinished } from './install'
import { getMainWindow } from './windows'

/**
 * 系统通知：下载、安装、更新等耗时的事情做完时，如果启动器在后台（最小化、隐藏或没有焦点），
 * 弹一个系统通知；启动器就在眼前时不打扰。可以在设置里关闭
 */
function inBackground(): boolean {
  const win = getMainWindow()
  return !win || !win.isVisible() || win.isMinimized() || !win.isFocused()
}

function showWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (!Notification.isSupported()) return
    if (!(await getSettings()).systemNotifications || !inBackground()) return
    const notification = new Notification({ title, body: body.slice(0, 200) })
    notification.on('click', showWindow)
    notification.show()
  } catch {
    // 通知失败不影响其他功能
  }
}

/** 启动时调用：安装游戏、检查修复、下载 Java 结束时通知（取消的不通知） */
export function setupNotifications(): void {
  onInstallFinished((status) => {
    const what =
      status.kind === 'java'
        ? `Java（${status.versionId}）`
        : status.kind === 'repair'
          ? `检查修复 ${status.versionId}`
          : status.versionId
    if (status.state === 'success') {
      void notify(
        status.kind === 'install' ? '安装完成' : status.kind === 'repair' ? '检查修复完成' : '下载完成',
        status.kind === 'install' ? `${what} 已经装好，可以开始玩了` : `${what} 已完成`
      )
    } else if (status.state === 'failed') {
      void notify(
        status.kind === 'install' ? '安装失败' : `${status.kind === 'repair' ? '检查修复' : '下载'}失败`,
        `${what}：${status.error ?? '未知原因'}`
      )
    }
  })
}
