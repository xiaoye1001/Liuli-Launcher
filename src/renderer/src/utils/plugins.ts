import type { PluginPending, PluginPermission } from '../../../shared/types'
import { t } from './i18n'

/** 权限的中文说明（安装时给用户看） */
export const PERMISSION_TEXT: Record<PluginPermission, { title: string; desc: string; risky?: boolean }> = {
  versions: { title: t('读取版本列表'), desc: t('看到已经安装了哪些游戏版本（名字、游戏版本、加载器）') },
  launch: { title: t('启动游戏'), desc: t('用你选的账号启动某个游戏版本'), risky: true },
  game: { title: t('游戏状态'), desc: t('知道游戏是不是正在运行、运行的是哪个版本') },
  notifications: { title: t('系统通知'), desc: t('在系统里弹出通知') },
  network: { title: t('联网'), desc: t('访问下面列出的网站'), risky: true },
  clipboard: { title: t('写剪贴板'), desc: t('把文字复制到剪贴板') },
  'open-url': { title: t('打开网页'), desc: t('用系统浏览器打开 https 网页') },
  mods: { title: t('读取模组列表'), desc: t('看到某个版本装了哪些模组（名字、版本、是否启用）') },
  worlds: { title: t('读取存档列表'), desc: t('看到某个版本有哪些存档（名字、游戏模式、最后游玩时间）') },
  screenshots: { title: t('查看游戏截图'), desc: t('看到某个版本的截图和缩略图') },
  servers: { title: t('读取收藏的服务器'), desc: t('看到你收藏的服务器名字和地址') }
}

// ---------- 拖进窗口的插件 ----------
// 拖放在任意页面都能发生：先存在这里，跳到「更多 → 插件管理」后由插件管理接过去显示安装确认

let droppedPlugin: PluginPending | null = null
const droppedListeners = new Set<() => void>()

export function setDroppedPlugin(pending: PluginPending): void {
  // 上一个还没处理的拖放丢掉（主进程里解压的临时文件也删掉）
  if (droppedPlugin && droppedPlugin.token !== pending.token) void window.api.discardPlugin(droppedPlugin.token)
  droppedPlugin = pending
  for (const listener of droppedListeners) listener()
}

/** 取走拖进来的插件（取走后清空） */
export function takeDroppedPlugin(): PluginPending | null {
  const pending = droppedPlugin
  droppedPlugin = null
  return pending
}

/** 有新拖进来的插件时调用 listener；返回取消监听的函数 */
export function onDroppedPlugin(listener: () => void): () => void {
  droppedListeners.add(listener)
  return () => droppedListeners.delete(listener)
}

export function hasDroppedPlugin(): boolean {
  return droppedPlugin !== null
}
