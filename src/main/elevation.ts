import { execFile } from 'child_process'

let cached: Promise<boolean> | null = null

/**
 * Windows 上是否以管理员身份运行。
 * 管理员窗口不接收普通权限程序（例如资源管理器）拖入的文件，这是 Windows 的安全限制，需要提示用户。
 * 判断方法：只有管理员才能成功执行 `net session`。
 */
export function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  if (!cached) {
    cached = new Promise((resolve) => {
      execFile('net', ['session'], { windowsHide: true, timeout: 5000 }, (error) => resolve(!error))
    })
  }
  return cached
}
