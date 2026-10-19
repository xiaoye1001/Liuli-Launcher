/**
 * 窗口与 IPC 的安全防护：
 * - 所有窗口禁止跳转到别的页面（例如把网页链接或 html 文件拖进窗口），禁止 <webview>，新窗口只用系统浏览器打开网页
 * - IPC 只接受启动器自己页面的调用：即使窗口因为意外加载了别的页面，那个页面也调用不了 window.api
 */
import { app, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'

/** 启动器页面的地址（不含 #hash） */
function trustedPage(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) return new URL(process.env['ELECTRON_RENDERER_URL']).origin
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  // 只接受主框架（不接受页面里的 iframe）
  if (!frame || frame !== event.sender.mainFrame) return false
  const page = trustedPage()
  const url = frame.url.split('#')[0]
  return is.dev && process.env['ELECTRON_RENDERER_URL'] ? url.startsWith(`${page}/`) || url === page : url === page
}

/** 在注册任何 IPC 之前调用：之后所有 ipcMain.handle 都会先检查调用方 */
export function guardIpc(): void {
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) =>
    handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error('拒绝来自未知页面的调用')
      return listener(event, ...args)
    })
}

const ALLOWED_PERMISSIONS = new Set<string>(['clipboard-sanitized-write', 'local-fonts'])

/** 所有窗口（包括以后新建的）统一禁止跳转与内嵌网页 */
export function hardenWebContents(): void {
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault())
    contents.on('will-redirect', (event) => event.preventDefault())
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler((details) => {
      openExternalLink(details.url)
      return { action: 'deny' }
    })
  })
  // 只允许启动器用到的权限（复制按钮写剪贴板、字体选择读取本机字体）；
  // 摄像头、麦克风、定位、通知、USB / 串口等一律拒绝（Electron 默认会允许）
  void app.whenReady().then(() => {
    const ses = session.defaultSession
    ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
    ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
    ses.setDevicePermissionHandler(() => false)
  })
}

/** 只用系统浏览器打开 https 链接（新闻、模组页面、分享的日志等），其他协议一律忽略 */
export function openExternalLink(url: string): void {
  try {
    if (new URL(url).protocol !== 'https:') return
  } catch {
    return
  }
  shell.openExternal(url).catch(() => undefined)
}
