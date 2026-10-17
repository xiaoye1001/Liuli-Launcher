import { getSettings, newOfflineId, updateSettings } from './config'
import type { AppSettings } from '../shared/types'

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/
const MAX_ACCOUNTS = 50

function checkName(name: string, settings: AppSettings, exceptId?: string): void {
  if (!NAME_PATTERN.test(name)) throw new Error('玩家名只能包含字母、数字和下划线，长度 3~16')
  const lower = name.toLowerCase()
  if (settings.offlineAccounts.some((a) => a.id !== exceptId && a.name.toLowerCase() === lower)) {
    throw new Error(`已经有名为 ${name} 的离线账号`)
  }
}

/** 添加离线账号，并切换为当前账号 */
export async function addOfflineAccount(name: string): Promise<AppSettings> {
  const settings = await getSettings()
  name = name.trim()
  checkName(name, settings)
  if (settings.offlineAccounts.length >= MAX_ACCOUNTS) throw new Error(`最多保存 ${MAX_ACCOUNTS} 个离线账号`)
  const id = newOfflineId()
  return updateSettings({
    offlineAccounts: [...settings.offlineAccounts, { id, name, skin: '', skinModel: 'default' }],
    activeOffline: id,
    activeAccount: 'offline'
  })
}

/** 切换到某个离线账号 */
export async function selectOfflineAccount(id: string): Promise<AppSettings> {
  const settings = await getSettings()
  if (!settings.offlineAccounts.some((a) => a.id === id)) throw new Error('离线账号不存在')
  return updateSettings({ activeOffline: id, activeAccount: 'offline' })
}

/** 修改离线账号的玩家名 */
export async function renameOfflineAccount(id: string, name: string): Promise<AppSettings> {
  const settings = await getSettings()
  name = name.trim()
  checkName(name, settings, id)
  if (!settings.offlineAccounts.some((a) => a.id === id)) throw new Error('离线账号不存在')
  return updateSettings({
    offlineAccounts: settings.offlineAccounts.map((a) => (a.id === id ? { ...a, name } : a))
  })
}

/** 删除离线账号（至少保留一个）；删除的是当前离线账号时改用列表中的第一个 */
export async function removeOfflineAccount(id: string): Promise<AppSettings> {
  const settings = await getSettings()
  if (settings.offlineAccounts.length <= 1) throw new Error('至少需要保留一个离线账号')
  const rest = settings.offlineAccounts.filter((a) => a.id !== id)
  return updateSettings({
    offlineAccounts: rest,
    activeOffline: settings.activeOffline === id ? rest[0].id : settings.activeOffline
  })
}
