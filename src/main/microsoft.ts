import { app, BrowserWindow, clipboard, dialog, nativeImage, shell } from 'electron'
import { MicrosoftAuthenticator, MojangClient, type MicrosoftMinecraftProfile } from '@xmcl/user'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings, updateSettings } from './config'
import { seal, unseal } from './secure'
import { getExternalLaunchAuth, hasExternalAccount, listExternalAccounts } from './yggdrasil'
import type { AccountsInfo, MicrosoftAccount, MsCape, MsLoginStatus, MsSkinProfile, SkinModel } from '../shared/types'

const ACCOUNTS_FILE = join(app.getPath('userData'), 'accounts.json')
/** 个人微软账号使用 consumers 租户 */
const OAUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'
/** Minecraft 令牌剩余不到 5 分钟时就刷新 */
const REFRESH_MARGIN = 5 * 60 * 1000

/** 保存在磁盘上的账号（令牌经过 safeStorage 加密） */
interface StoredAccount extends MicrosoftAccount {
  refreshToken: string
  mcToken: string
  mcTokenExpiresAt: number
  /** 令牌是否已加密（系统不支持加密时以明文保存） */
  encrypted: boolean
}

const authenticator = new MicrosoftAuthenticator({})
const mojang = new MojangClient()

// ---------- 账号存储 ----------

let stored: StoredAccount[] | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function loadAccounts(): Promise<StoredAccount[]> {
  if (stored) return stored
  try {
    const data = JSON.parse(await readFile(ACCOUNTS_FILE, 'utf-8'))
    stored = Array.isArray(data.accounts) ? data.accounts : []
  } catch {
    stored = []
  }
  return stored!
}

/** 原子写入：先写临时文件再改名，避免写到一半时崩溃损坏文件 */
function saveAccounts(): Promise<void> {
  const data = JSON.stringify({ accounts: stored ?? [] }, null, 2)
  // 上一次写入失败不影响这一次（否则一次失败后再也保存不了）
  const task = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(ACCOUNTS_FILE), { recursive: true })
      const tmp = `${ACCOUNTS_FILE}.tmp`
      await writeFile(tmp, data, { mode: 0o600 })
      await rename(tmp, ACCOUNTS_FILE)
    })
  writeQueue = task.catch(() => undefined)
  return task
}

function publicAccount(a: StoredAccount): MicrosoftAccount {
  return { uuid: a.uuid, name: a.name, skin: a.skin, skinModel: a.skinModel }
}

export async function getAccounts(): Promise<AccountsInfo> {
  const [accounts, external, settings] = await Promise.all([loadAccounts(), listExternalAccounts(), getSettings()])
  const exists =
    accounts.some((a) => a.uuid === settings.activeAccount) || external.some((a) => a.id === settings.activeAccount)
  return {
    active: exists ? settings.activeAccount : 'offline',
    accounts: accounts.map(publicAccount),
    external,
    loginAvailable: isMicrosoftLoginAvailable()
  }
}

export async function setActiveAccount(id: string): Promise<AccountsInfo> {
  const accounts = await loadAccounts()
  if (id !== 'offline' && !accounts.some((a) => a.uuid === id) && !(await hasExternalAccount(id))) {
    throw new Error('账号不存在')
  }
  await updateSettings({ activeAccount: id })
  return getAccounts()
}

export async function removeAccount(uuid: string): Promise<AccountsInfo> {
  const accounts = await loadAccounts()
  stored = accounts.filter((a) => a.uuid !== uuid)
  await saveAccounts()
  const settings = await getSettings()
  if (settings.activeAccount === uuid) await updateSettings({ activeAccount: 'offline' })
  return getAccounts()
}

// ---------- 微软 OAuth（设备代码流程） ----------

interface OAuthTokens {
  access_token: string
  refresh_token: string
}

/** 请求微软 OAuth 接口，错误时返回 { error } 而不是抛出，方便轮询时判断 */
async function oauthPost(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const response = await fetch(`${OAUTH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  })
  return response.json()
}

function describeOAuthError(result: { error?: string; error_description?: string }): string {
  switch (result.error) {
    case 'unauthorized_client':
    case 'invalid_client':
      return 'Client ID 无效，或 Azure 应用没有开启「允许公共客户端流」'
    case 'invalid_grant':
      return '微软账号登录已失效，请重新登录'
    case 'expired_token':
      return '代码已过期，请重新登录'
    case 'authorization_declined':
      return '你在网页中拒绝了授权'
    default:
      return result.error_description?.split('\r\n')[0] || result.error || '未知错误'
  }
}

/**
 * Azure 应用的 Client ID（需经 Mojang 审核）。构建时从环境变量 MAIN_VITE_MS_CLIENT_ID 读取：
 * 本地开发写在项目根目录的 .env 文件中（不会提交到 Git），GitHub Actions 发布时来自仓库 Secret。
 * 不写在源码里，避免别人直接复用你的 Client ID。
 */
const CLIENT_ID = (import.meta.env.MAIN_VITE_MS_CLIENT_ID ?? '').trim()

/** 当前构建是否配置了微软登录 */
export function isMicrosoftLoginAvailable(): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(CLIENT_ID)
}

function assertLoginAvailable(): void {
  if (!isMicrosoftLoginAvailable()) throw new Error('当前版本没有开启微软登录，请使用离线账号')
}

// ---------- Xbox → Minecraft ----------

/** XSTS 的常见错误码 */
const XSTS_ERRORS: Record<number, string> = {
  2148916233: '这个微软账号还没有 Xbox 档案，请先登录 minecraft.net 或 xbox.com 创建',
  2148916235: '你所在的地区不支持 Xbox Live',
  2148916236: '该账号需要完成成人验证（韩国地区）',
  2148916237: '该账号需要完成成人验证（韩国地区）',
  2148916238: '未成年账号需要由家长加入家庭组后才能登录'
}

/** 用微软令牌换取 Minecraft 令牌并读取档案 */
async function loginMinecraft(
  msAccessToken: string,
  signal?: AbortSignal
): Promise<{ token: string; expiresAt: number; profile: MicrosoftMinecraftProfile }> {
  const xbl = await authenticator.authenticateXboxLive(msAccessToken, signal)
  let xsts
  try {
    xsts = await authenticator.authorizeXboxLive(xbl.Token, 'rp://api.minecraftservices.com/', signal)
  } catch (e) {
    const code = (e as { XErr?: number }).XErr
    throw new Error(code && XSTS_ERRORS[code] ? XSTS_ERRORS[code] : `Xbox 授权失败：${(e as Error).message}`)
  }
  let mc
  try {
    mc = await authenticator.loginMinecraftWithXBox(xsts.DisplayClaims.xui[0].uhs, xsts.Token, signal)
  } catch (e) {
    if (/status code: 403/.test((e as Error).message)) {
      throw new Error(
        '这个 Client ID 还没有通过 Mojang 审核，无法登录 Minecraft（审核申请：https://aka.ms/mce-reviewappid）'
      )
    }
    throw e
  }
  let profile
  try {
    profile = await mojang.getProfile(mc.access_token, signal)
  } catch (e) {
    if ((e as { error?: string }).error === 'NOT_FOUND') {
      throw new Error('这个账号没有购买 Minecraft Java 版，或还没有创建游戏档案')
    }
    throw e
  }
  return { token: mc.access_token, expiresAt: Date.now() + mc.expires_in * 1000, profile }
}

/** 下载正版皮肤，转为 data URL（直接用网址会因跨域无法在 3D 预览中使用） */
async function fetchSkin(profile: MicrosoftMinecraftProfile): Promise<{ skin: string; skinModel: SkinModel }> {
  const active = profile.skins?.find((s) => s.state === 'ACTIVE')
  const skinModel: SkinModel = active?.variant?.toUpperCase() === 'SLIM' ? 'slim' : 'default'
  if (!active?.url) return { skin: '', skinModel }
  try {
    const response = await fetch(active.url.replace(/^http:/, 'https:'), { signal: AbortSignal.timeout(15000) })
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      return { skin: '', skinModel }
    }
    const data = Buffer.from(await response.arrayBuffer())
    // 只接受不太大的 PNG
    if (data.length > MAX_IMAGE_BYTES || data.subarray(1, 4).toString() !== 'PNG') return { skin: '', skinModel }
    return { skin: `data:image/png;base64,${data.toString('base64')}`, skinModel }
  } catch {
    return { skin: '', skinModel }
  }
}

/** 保存（或更新）账号 */
async function saveLogin(
  tokens: OAuthTokens,
  mc: { token: string; expiresAt: number; profile: MicrosoftMinecraftProfile },
  /** 刷新令牌时：账号在刷新过程中被删除的话不再加回来 */
  existingOnly = false
): Promise<MicrosoftAccount> {
  const { skin, skinModel } = await fetchSkin(mc.profile)
  const refresh = seal(tokens.refresh_token)
  const mcToken = seal(mc.token)
  const account: StoredAccount = {
    uuid: mc.profile.id,
    name: mc.profile.name,
    skin,
    skinModel,
    refreshToken: refresh.value,
    mcToken: mcToken.value,
    mcTokenExpiresAt: mc.expiresAt,
    encrypted: refresh.encrypted
  }
  const accounts = await loadAccounts()
  if (existingOnly && !accounts.some((a) => a.uuid === account.uuid)) throw new Error('这个账号已被移除')
  stored = [...accounts.filter((a) => a.uuid !== account.uuid), account]
  await saveAccounts()
  return publicAccount(account)
}

// ---------- 登录流程 ----------

let loginStatus: MsLoginStatus = { state: 'idle' }
let loginAbort: AbortController | null = null

function setLoginStatus(next: MsLoginStatus): void {
  loginStatus = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('ms:login', loginStatus)
}

export function getLoginStatus(): MsLoginStatus {
  return loginStatus
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('cancelled'))
    })
  })

/**
 * 开始微软登录：获取设备代码后立即返回（界面显示代码），然后在后台轮询，
 * 用户在浏览器中完成登录后继续换取 Xbox 与 Minecraft 令牌。进度通过 ms:login 推送。
 */
let loginStarting: Promise<MsLoginStatus> | null = null

export async function startMicrosoftLogin(): Promise<MsLoginStatus> {
  if (loginStatus.state === 'waiting' || loginStatus.state === 'authorizing') return loginStatus
  // 正在获取设备代码时（连续点击）不再重复开始
  if (loginStarting) return loginStarting
  assertLoginAvailable()

  let device: Awaited<ReturnType<typeof oauthPost>>
  const starting = oauthPost('devicecode', { client_id: CLIENT_ID, scope: SCOPE })
  loginStarting = starting.then(
    () => loginStatus,
    () => loginStatus
  )
  try {
    device = await starting
  } finally {
    loginStarting = null
  }
  if (!device.device_code) throw new Error(describeOAuthError(device))

  const abort = new AbortController()
  loginAbort = abort
  const expiresAt = Date.now() + device.expires_in * 1000
  setLoginStatus({ state: 'waiting', userCode: device.user_code, verificationUri: device.verification_uri, expiresAt })

  void (async () => {
    try {
      let interval = (device.interval ?? 5) * 1000
      let tokens: OAuthTokens | null = null
      while (!tokens) {
        if (Date.now() > expiresAt) throw new Error('代码已过期，请重新登录')
        await sleep(interval, abort.signal)
        const result = await oauthPost(
          'token',
          {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: CLIENT_ID,
            device_code: device.device_code
          },
          abort.signal
        )
        if (result.access_token) tokens = result
        else if (result.error === 'slow_down') interval += 5000
        else if (result.error !== 'authorization_pending') throw new Error(describeOAuthError(result))
      }
      setLoginStatus({ ...loginStatus, state: 'authorizing' })
      const mc = await loginMinecraft(tokens.access_token, abort.signal)
      const account = await saveLogin(tokens, mc)
      await updateSettings({ activeAccount: account.uuid })
      setLoginStatus({ state: 'success', account })
    } catch (e) {
      if (abort.signal.aborted) setLoginStatus({ state: 'cancelled' })
      else setLoginStatus({ state: 'failed', error: e instanceof Error ? e.message : String(e) })
    } finally {
      if (loginAbort === abort) loginAbort = null
    }
  })()
  return loginStatus
}

/** 复制代码并在浏览器中打开微软的登录页 */
export async function openLoginPage(): Promise<void> {
  const { state, userCode, verificationUri } = loginStatus
  if (state !== 'waiting' || !userCode || !verificationUri?.startsWith('https://')) return
  clipboard.writeText(userCode)
  await shell.openExternal(verificationUri)
}

export function cancelMicrosoftLogin(): void {
  loginAbort?.abort()
}

// ---------- 启动游戏时使用 ----------

/** 同一账号同时只刷新一次 */
const refreshing = new Map<string, Promise<StoredAccount>>()

/** 返回可用的 Minecraft 令牌，过期时用刷新令牌重新登录 */
async function ensureFresh(account: StoredAccount): Promise<StoredAccount> {
  if (account.mcTokenExpiresAt - Date.now() > REFRESH_MARGIN) return account
  const pending = refreshing.get(account.uuid)
  if (pending) return pending
  const task = (async () => {
    assertLoginAvailable()
    const refreshToken = unseal(account.refreshToken, account.encrypted)
    const result = await oauthPost('token', {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      scope: SCOPE
    })
    if (!result.access_token) {
      throw new Error(`${account.name} 的登录已失效（${describeOAuthError(result)}），请到账号页重新登录`)
    }
    const mc = await loginMinecraft(result.access_token)
    // 微软通常会返回新的刷新令牌；没有返回时继续使用旧的
    await saveLogin(
      { access_token: result.access_token, refresh_token: result.refresh_token ?? refreshToken },
      mc,
      true
    )
    return (await loadAccounts()).find((a) => a.uuid === mc.profile.id)!
  })()
  refreshing.set(account.uuid, task)
  try {
    return await task
  } finally {
    refreshing.delete(account.uuid)
  }
}

export interface LaunchAuth {
  name: string
  uuid: string
  accessToken: string
  userType: 'msa' | 'legacy' | 'mojang'
  microsoft: boolean
  /** 外置登录：验证服务器信息（传给 authlib-injector） */
  yggdrasil?: { server: string; serverName: string; prefetched: string }
}

/** 当前账号的启动参数；离线账号返回 null，由调用方生成离线身份 */
export async function getMicrosoftLaunchAuth(): Promise<LaunchAuth | null> {
  const { activeAccount } = await getSettings()
  if (activeAccount === 'offline') return null
  if (activeAccount.startsWith('ygg:')) {
    const external = await getExternalLaunchAuth(activeAccount)
    return {
      name: external.name,
      uuid: external.uuid,
      accessToken: external.accessToken,
      userType: 'mojang',
      microsoft: false,
      yggdrasil: { server: external.server, serverName: external.serverName, prefetched: external.prefetched }
    }
  }
  const account = (await loadAccounts()).find((a) => a.uuid === activeAccount)
  if (!account) return null
  const fresh = await ensureFresh(account)
  return {
    name: fresh.name,
    uuid: fresh.uuid,
    accessToken: unseal(fresh.mcToken, fresh.encrypted),
    userType: 'msa',
    microsoft: true
  }
}

// ---------- 皮肤与披风 ----------

const MC_SERVICES = 'https://api.minecraftservices.com'
const MAX_IMAGE_BYTES = 1024 * 1024

interface ServicesProfile {
  id: string
  name: string
  skins?: { id: string; state: string; url: string; variant?: string }[]
  capes?: { id: string; state: string; url: string; alias?: string }[]
}

/** 当前可用的令牌（过期时自动刷新） */
async function tokenOf(uuid: string): Promise<string> {
  const account = (await loadAccounts()).find((a) => a.uuid === uuid)
  if (!account) throw new Error('账号不存在，请到账号页重新登录')
  const fresh = await ensureFresh(account)
  return unseal(fresh.mcToken, fresh.encrypted)
}

/** 调用 Minecraft 档案接口，常见错误转成中文 */
async function services<T>(uuid: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await tokenOf(uuid)
  let response: Response
  try {
    response = await fetch(`${MC_SERVICES}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20000)
    })
  } catch {
    throw new Error('无法连接 Minecraft 服务器，请检查网络')
  }
  if (response.status === 401) throw new Error('登录已过期，请在账号页删除这个账号后重新登录')
  if (response.status === 429) throw new Error('操作太频繁，请过一会儿再试')
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    if (response.status === 400) throw new Error('皮肤文件无效，请使用 64×64 或 64×32 的 PNG 图片')
    throw new Error(`Minecraft 服务器返回错误（${response.status}）${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : null
}

/** 下载图片转为 data URL（官方贴图地址是 http，改用 https） */
async function imageDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url.replace(/^http:/, 'https:'), { signal: AbortSignal.timeout(15000) })
    const data = Buffer.from(await response.arrayBuffer())
    if (!response.ok || data.length > MAX_IMAGE_BYTES) return ''
    return `data:image/png;base64,${data.toString('base64')}`
  } catch {
    return ''
  }
}

/** 用最新的档案更新保存的皮肤 */
async function storeSkin(uuid: string, profile: ServicesProfile): Promise<{ skin: string; skinModel: SkinModel }> {
  const result = await fetchSkin(profile as MicrosoftMinecraftProfile)
  const account = (await loadAccounts()).find((a) => a.uuid === uuid)
  if (account) {
    account.skin = result.skin
    account.skinModel = result.skinModel
    await saveAccounts()
  }
  return result
}

async function profileDetails(uuid: string, profile: ServicesProfile): Promise<MsSkinProfile> {
  const { skin, skinModel } = await storeSkin(uuid, profile)
  const capes: MsCape[] = await Promise.all(
    (profile.capes ?? []).map(async (c) => ({
      id: c.id,
      alias: c.alias ?? '披风',
      active: c.state === 'ACTIVE',
      image: await imageDataUrl(c.url)
    }))
  )
  return { uuid, name: profile.name, skin, skinModel, capes }
}

/** 读取正版账号的皮肤与披风（同时更新保存的皮肤） */
export async function getMsSkinProfile(uuid: string): Promise<MsSkinProfile> {
  const profile = await services<ServicesProfile>(uuid, '/minecraft/profile')
  if (!profile) throw new Error('无法读取玩家档案')
  return profileDetails(uuid, profile)
}

/** 选择 PNG 文件上传为正版皮肤；取消时返回 null */
export async function uploadMsSkin(
  uuid: string,
  variant: 'classic' | 'slim',
  win: BrowserWindow | null
): Promise<MsSkinProfile | null> {
  const options: Electron.OpenDialogOptions = {
    title: '选择皮肤文件',
    filters: [{ name: '皮肤（PNG）', extensions: ['png'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const file = result.filePaths[0]
  if (result.canceled || !file) return null
  const data = await readFile(file)
  if (data.length > MAX_IMAGE_BYTES) throw new Error('皮肤文件太大')
  const size = nativeImage.createFromBuffer(data).getSize()
  if (size.width !== 64 || (size.height !== 64 && size.height !== 32)) {
    throw new Error(`皮肤图片应为 64×64 或 64×32，这张是 ${size.width}×${size.height}`)
  }
  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new Blob([new Uint8Array(data)], { type: 'image/png' }), 'skin.png')
  const profile = await services<ServicesProfile>(uuid, '/minecraft/profile/skins', { method: 'POST', body: form })
  return profileDetails(uuid, profile ?? (await services<ServicesProfile>(uuid, '/minecraft/profile'))!)
}

/** 恢复默认皮肤（Steve / Alex 等） */
export async function resetMsSkin(uuid: string): Promise<MsSkinProfile> {
  await services(uuid, '/minecraft/profile/skins/active', { method: 'DELETE' })
  return getMsSkinProfile(uuid)
}

/** 显示某个披风；capeId 为 null 时不显示披风 */
export async function setMsCape(uuid: string, capeId: string | null): Promise<MsSkinProfile> {
  if (capeId) {
    await services(uuid, '/minecraft/profile/capes/active', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capeId })
    })
  } else {
    await services(uuid, '/minecraft/profile/capes/active', { method: 'DELETE' })
  }
  return getMsSkinProfile(uuid)
}
