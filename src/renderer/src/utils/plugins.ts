import type { PluginPermission } from '../../../shared/types'

/** 权限的中文说明（安装时给用户看） */
export const PERMISSION_TEXT: Record<PluginPermission, { title: string; desc: string; risky?: boolean }> = {
  versions: { title: '读取版本列表', desc: '看到已经安装了哪些游戏版本（名字、游戏版本、加载器）' },
  launch: { title: '启动游戏', desc: '用你选的账号启动某个游戏版本', risky: true },
  game: { title: '游戏状态', desc: '知道游戏是不是正在运行、运行的是哪个版本' },
  notifications: { title: '系统通知', desc: '在系统里弹出通知' },
  network: { title: '联网', desc: '访问下面列出的网站', risky: true },
  clipboard: { title: '写剪贴板', desc: '把文字复制到剪贴板' },
  'open-url': { title: '打开网页', desc: '用系统浏览器打开 https 网页' }
}
