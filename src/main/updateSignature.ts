/**
 * 官网版本信息的数字签名（Ed25519）：
 * GitHub Actions 用只保存在仓库 Secret 里的私钥，给每个版本的安装包清单（文件名、大小、SHA-256）签名；
 * 启动器内置公钥，验证通过才使用清单里的版本号和 SHA-256。官网服务器被入侵时，
 * 攻击者能替换安装包和 latest.json，但伪造不了签名，启动器不会安装被替换的文件。
 * 签名文件由 scripts/update-signing.mjs 生成，格式：{ payload: "<JSON 字符串>", signature: "<base64>" }
 */
import { createPublicKey, verify, type KeyObject } from 'crypto'

export interface SignedFile {
  name: string
  size: number
  sha256: string
}

export interface SignedRelease {
  version: string
  files: SignedFile[]
}

/** 解析内置的公钥（base64 编码的 SPKI DER），格式不对时返回 null */
export function parsePublicKey(base64: string): KeyObject | null {
  const value = base64.trim()
  if (!value) return null
  try {
    const key = createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ed25519' ? key : null
  } catch {
    return null
  }
}

/** 验证签名并返回签名过的版本号与安装包清单；签名缺失、无效或内容格式不对时抛出异常 */
export function verifySignedRelease(signed: unknown, publicKey: KeyObject): SignedRelease {
  const data = signed as { payload?: unknown; signature?: unknown } | null | undefined
  if (!data || typeof data.payload !== 'string' || typeof data.signature !== 'string') {
    throw new Error('官网的版本信息没有数字签名')
  }
  if (data.payload.length > 64 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.signature)) {
    throw new Error('官网的版本信息签名格式不对')
  }
  const ok = verify(null, Buffer.from(data.payload, 'utf8'), publicKey, Buffer.from(data.signature, 'base64'))
  if (!ok) throw new Error('官网的版本信息签名无效，可能被篡改')

  let payload: { product?: unknown; version?: unknown; files?: unknown }
  try {
    payload = JSON.parse(data.payload)
  } catch {
    throw new Error('官网的版本信息签名内容格式不对')
  }
  if (payload.product !== 'liuli-launcher') throw new Error('官网的版本信息签名不属于琉璃启动器')
  const version = typeof payload.version === 'string' ? payload.version : ''
  if (!/^\d+(\.\d+)*$/.test(version)) throw new Error('官网的版本信息签名内容格式不对')
  const files = (Array.isArray(payload.files) ? payload.files : []).filter(
    (f): f is SignedFile =>
      !!f &&
      typeof f.name === 'string' &&
      /^[\w.+-]+$/.test(f.name) &&
      typeof f.size === 'number' &&
      Number.isFinite(f.size) &&
      f.size > 0 &&
      typeof f.sha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(f.sha256)
  )
  return { version, files }
}
