import { safeStorage } from 'electron'

/** 用系统安全存储加密令牌；系统不支持加密时以明文保存 */
export function seal(value: string): { value: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(value).toString('base64'), encrypted: true }
  }
  return { value, encrypted: false }
}

export function unseal(value: string, encrypted: boolean): string {
  return encrypted ? safeStorage.decryptString(Buffer.from(value, 'base64')) : value
}
