import { safeStorage } from 'electron'

/**
 * 登录凭证能否真正加密保存：
 * 系统不支持加密，或 Linux 上没有密钥环（basic_text 只是固定密钥混淆）时为 false
 */
export function isTokenEncryptionStrong(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    try {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text'
    } catch {
      return false
    }
  }
  return true
}

/** 用系统安全存储加密令牌；系统不支持加密时以明文保存（账号页面会提示） */
export function seal(value: string): { value: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(value).toString('base64'), encrypted: true }
  }
  return { value, encrypted: false }
}

export function unseal(value: string, encrypted: boolean): string {
  if (!encrypted) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    // 常见于免安装版换了电脑或系统账户：加密只在原来的电脑上有效
    throw new Error('无法读取保存的登录信息（可能换了电脑或系统账户），请重新登录这个账号')
  }
}
