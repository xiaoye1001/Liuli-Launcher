import type { OptiFineVersionInfo } from '../shared/types'

const BMCLAPI = 'https://bmclapi2.bangbang93.com'

/** BMCLAPI 返回的 OptiFine 版本信息 */
interface BmclapiOptiFine {
  mcversion: string
  type: string
  patch: string
  filename?: string
  forge?: string
}

/** 把 patch（例如 I6、I7_pre1）拆成可比较的数字：字母、编号、预览版编号（正式版视为最大） */
function patchKey(patch: string): number[] {
  const match = /^([A-Za-z])(\d+)(?:_?pre(\d+))?/i.exec(patch)
  if (!match) return [0, 0, 0]
  return [match[1].toUpperCase().charCodeAt(0), Number(match[2]), match[3] ? Number(match[3]) : Number.MAX_SAFE_INTEGER]
}

function compareDesc(a: OptiFineVersionInfo, b: OptiFineVersionInfo): number {
  if (a.type !== b.type) return b.type.localeCompare(a.type)
  const ka = patchKey(a.patch)
  const kb = patchKey(b.patch)
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return kb[i] - ka[i]
  }
  return 0
}

/**
 * 获取某个 Minecraft 版本可用的 OptiFine 版本（新版本在前）。
 * OptiFine 官方没有提供版本接口，所以无论选择哪个下载源都使用 BMCLAPI。
 */
export async function getOptiFineVersions(mc: string): Promise<OptiFineVersionInfo[]> {
  const url = `${BMCLAPI}/optifine/${encodeURIComponent(mc)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`)
  const list = (await response.json()) as BmclapiOptiFine[]
  if (!Array.isArray(list)) throw new Error('BMCLAPI 返回的 OptiFine 列表格式不正确')
  return list
    .filter((item) => item.mcversion === mc && item.type && item.patch)
    .map((item) => ({
      type: item.type,
      patch: item.patch,
      preview: /pre/i.test(item.patch) || /^preview/i.test(item.filename ?? ''),
      forge: item.forge || undefined
    }))
    .sort(compareDesc)
}

/** OptiFine 安装器的下载地址 */
export function optiFineInstallerUrl(mc: string, type: string, patch: string): string {
  return `${BMCLAPI}/optifine/${encodeURIComponent(mc)}/${encodeURIComponent(type)}/${encodeURIComponent(patch)}`
}

/** 显示用的版本名，例如 HD_U + I6 → HD U I6 */
export function optiFineDisplayName(type: string, patch: string): string {
  return `${type} ${patch}`.replace(/_/g, ' ')
}
