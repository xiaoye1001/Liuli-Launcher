import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings, updateSettings } from './config'
import { seal, unseal } from './secure'
import type { ExternalAccount, ExternalLoginResult, SkinModel } from '../shared/types'

/**
 * 外置登录（Yggdrasil 协议，配合 authlib-injector 使用），例如 LittleSkin 皮肤站。
 * 只保存访问令牌（加密），不保存密码。
 */

const ACCOUNTS_FILE = join(app.getPath('userData'), 'external-accounts.json')
const TIMEOUT = 15000
const MAX_SKIN_BYTES = 1024 * 1024

interface StoredExternal extends ExternalAccount {
  accessToken: string
  clientToken: string
  encrypted: boolean
  /** 验证服务器元数据（启动时传给 authlib-injector，避免游戏启动时再请求一次） */
  metadata: string
}

interface Profile {
  id: string
  name: string
}

interface AuthResponse {
  accessToken: string
  clientToken: string
  availableProfiles?: Profile[]
  selectedProfile?: Profile
}

// ---------- 存储 ----------

let stored: StoredExternal[] | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function loadAccounts(): Promise<StoredExternal[]> {
  if (stored) return stored
  try {
    const data = JSON.parse(await readFile(ACCOUNTS_FILE, 'utf-8'))
    stored = Array.isArray(data.accounts) ? data.accounts : []
  } catch {
    stored = []
  }
  return stored!
}

function saveAccounts(): Promise<void> {
  const data = JSON.stringify({ accounts: stored ?? [] }, null, 2)
  // 上一次写入失败不影响这一次（否则一次失败后再也保存不了）
  const task = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(ACCOUNTS_FILE), { recursive: true })
      await writeFile(`${ACCOUNTS_FILE}.tmp`, data, { mode: 0o600 })
      await rename(`${ACCOUNTS_FILE}.tmp`, ACCOUNTS_FILE)
    })
  writeQueue = task.catch(() => undefined)
  return task
}

function publicAccount(a: StoredExternal): ExternalAccount {
  return {
    id: a.id,
    uuid: a.uuid,
    name: a.name,
    skin: a.skin,
    skinModel: a.skinModel,
    serverName: a.serverName,
    serverUrl: a.serverUrl,
    username: a.username
  }
}

export async function listExternalAccounts(): Promise<ExternalAccount[]> {
  return (await loadAccounts()).map(publicAccount)
}

export async function hasExternalAccount(id: string): Promise<boolean> {
  return (await loadAccounts()).some((a) => a.id === id)
}

export async function removeExternalAccount(id: string): Promise<void> {
  stored = (await loadAccounts()).filter((a) => a.id !== id)
  await saveAccounts()
  if ((await getSettings()).activeAccount === id) await updateSettings({ activeAccount: 'offline' })
}

// ---------- 验证服务器 ----------

/** 只允许 https，避免密码明文传输；本机地址除外（用于自建服务器测试） */
function normalizeUrl(input: string): URL {
  let text = input.trim()
  if (!text) throw new Error('请填写验证服务器地址')
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('验证服务器地址格式不正确')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('为了保护密码安全，验证服务器必须使用 https 地址')
  }
  return url
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    // 发送密码等内容的 POST 不跟随跳转，避免被跳转到 http 地址后明文发送
    response = await fetch(url, {
      ...init,
      redirect: init.method === 'POST' ? 'error' : 'follow',
      signal: AbortSignal.timeout(TIMEOUT)
    })
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new Error('连接验证服务器超时，请检查网络')
    throw new Error('无法连接验证服务器，请检查地址和网络')
  }
  // 跳转后的地址同样必须是 https
  if (response.redirected) normalizeUrl(response.url)
  return response
}

/**
 * 解析验证服务器：支持填写皮肤站首页地址（通过 X-Authlib-Injector-API-Location 头找到 API 地址），
 * 返回 API 地址、服务器名称和元数据
 */
export async function resolveServer(input: string): Promise<{ apiRoot: string; serverName: string; metadata: string }> {
  let url = normalizeUrl(input)
  let response = await request(url.href)
  const location = response.headers.get('x-authlib-injector-api-location')
  if (location) {
    const next = normalizeUrl(new URL(location, url).href)
    if (next.href !== url.href) {
      url = next
      response = await request(url.href)
    }
  }
  if (!response.ok) throw new Error(`验证服务器返回错误（${response.status}），请确认地址是否正确`)
  let meta: { meta?: { serverName?: unknown }; skinDomains?: unknown; signaturePublickey?: unknown }
  const text = await response.text()
  try {
    meta = JSON.parse(text)
  } catch {
    throw new Error('这个地址不是 authlib-injector 验证服务器')
  }
  if (!meta || typeof meta !== 'object' || (!meta.meta && !meta.signaturePublickey)) {
    throw new Error('这个地址不是 authlib-injector 验证服务器')
  }
  const apiRoot = url.href.replace(/\/+$/, '')
  const serverName =
    typeof meta.meta?.serverName === 'string' && meta.meta.serverName ? meta.meta.serverName.slice(0, 40) : url.hostname
  return { apiRoot, serverName, metadata: text }
}

/** 调用验证服务器接口，把常见错误转成中文 */
async function post<T>(apiRoot: string, path: string, body: unknown): Promise<T | null> {
  const response = await request(`${apiRoot}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (response.status === 204) return null
  const text = await response.text()
  let data: { error?: string; errorMessage?: string } & Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // 非 JSON 响应
  }
  if (!response.ok) {
    if (data.error === 'ForbiddenOperationException') {
      if (/invalid credentials|password/i.test(data.errorMessage ?? '')) throw new Error('邮箱（用户名）或密码错误')
      if (/token/i.test(data.errorMessage ?? '')) throw new Error('登录已过期')
      throw new Error(data.errorMessage || '验证服务器拒绝了请求')
    }
    if (response.status === 429) throw new Error('登录太频繁，请稍后再试')
    throw new Error(data.errorMessage || `验证服务器返回错误（${response.status}）`)
  }
  return data as T
}

/** 下载角色皮肤（转为 data URL） */
async function fetchSkin(apiRoot: string, uuid: string): Promise<{ skin: string; skinModel: SkinModel }> {
  const fallback = { skin: '', skinModel: 'default' as SkinModel }
  try {
    const response = await request(`${apiRoot}/sessionserver/session/minecraft/profile/${uuid}`)
    if (!response.ok) return fallback
    const profile = (await response.json()) as { properties?: { name: string; value: string }[] }
    const textures = profile.properties?.find((p) => p.name === 'textures')
    if (!textures) return fallback
    const decoded = JSON.parse(Buffer.from(textures.value, 'base64').toString('utf-8')) as {
      textures?: { SKIN?: { url?: string; metadata?: { model?: string } } }
    }
    const skin = decoded.textures?.SKIN
    const skinModel: SkinModel = skin?.metadata?.model === 'slim' ? 'slim' : 'default'
    if (!skin?.url || !/^https?:\/\//.test(skin.url)) return { skin: '', skinModel }
    const image = await request(skin.url)
    const data = Buffer.from(await image.arrayBuffer())
    if (!image.ok || data.length > MAX_SKIN_BYTES || data.subarray(1, 4).toString() !== 'PNG')
      return { skin: '', skinModel }
    return { skin: `data:image/png;base64,${data.toString('base64')}`, skinModel }
  } catch {
    return fallback
  }
}

async function saveAccount(
  server: { apiRoot: string; serverName: string; metadata: string },
  username: string,
  auth: AuthResponse,
  profile: Profile
): Promise<ExternalAccount> {
  const { skin, skinModel } = await fetchSkin(server.apiRoot, profile.id)
  const token = seal(auth.accessToken)
  const account: StoredExternal = {
    id: `ygg:${profile.id}@${server.apiRoot}`,
    uuid: profile.id,
    name: profile.name,
    skin,
    skinModel,
    serverName: server.serverName,
    serverUrl: server.apiRoot,
    username,
    accessToken: token.value,
    clientToken: auth.clientToken,
    encrypted: token.encrypted,
    metadata: server.metadata
  }
  stored = [...(await loadAccounts()).filter((a) => a.id !== account.id), account]
  await saveAccounts()
  // 新登录的账号设为当前账号
  await updateSettings({ activeAccount: account.id })
  return publicAccount(account)
}

/** 账号下有多个角色时，暂存登录结果等用户选择（5 分钟内有效） */
const pending = new Map<
  string,
  { server: Awaited<ReturnType<typeof resolveServer>>; username: string; auth: AuthResponse; expires: number }
>()

/** 用邮箱（用户名）和密码登录外置账号 */
export async function loginExternal(
  serverInput: string,
  username: string,
  password: string
): Promise<ExternalLoginResult> {
  if (!username.trim() || !password) throw new Error('请填写邮箱（用户名）和密码')
  const server = await resolveServer(serverInput)
  const auth = await post<AuthResponse>(server.apiRoot, '/authserver/authenticate', {
    agent: { name: 'Minecraft', version: 1 },
    username: username.trim(),
    password,
    clientToken: randomUUID().replace(/-/g, ''),
    requestUser: false
  })
  if (!auth?.accessToken) throw new Error('验证服务器没有返回登录信息')
  if (auth.selectedProfile) return { account: await saveAccount(server, username.trim(), auth, auth.selectedProfile) }
  const profiles = auth.availableProfiles ?? []
  if (profiles.length === 0) throw new Error('这个账号还没有角色，请先到皮肤站创建一个角色')
  if (profiles.length === 1) return { account: await bindProfile(server, username.trim(), auth, profiles[0]) }
  const pendingId = randomUUID()
  pending.set(pendingId, { server, username: username.trim(), auth, expires: Date.now() + 5 * 60 * 1000 })
  return { pendingId, profiles: profiles.map((p) => ({ id: p.id, name: p.name })) }
}

/** 把令牌绑定到选择的角色 */
async function bindProfile(
  server: Awaited<ReturnType<typeof resolveServer>>,
  username: string,
  auth: AuthResponse,
  profile: Profile
): Promise<ExternalAccount> {
  const refreshed = await post<AuthResponse>(server.apiRoot, '/authserver/refresh', {
    accessToken: auth.accessToken,
    clientToken: auth.clientToken,
    selectedProfile: { id: profile.id, name: profile.name }
  })
  if (!refreshed?.accessToken) throw new Error('选择角色失败')
  return saveAccount(server, username, refreshed, refreshed.selectedProfile ?? profile)
}

/** 从多个角色中选择一个 */
export async function selectExternalProfile(pendingId: string, profileId: string): Promise<ExternalAccount> {
  const entry = pending.get(pendingId)
  if (!entry || entry.expires < Date.now()) throw new Error('登录已过期，请重新登录')
  const profile = entry.auth.availableProfiles?.find((p) => p.id === profileId)
  if (!profile) throw new Error('角色不存在')
  pending.delete(pendingId)
  return bindProfile(entry.server, entry.username, entry.auth, profile)
}

/** 启动游戏前检查令牌，过期时刷新；返回启动参数 */
export async function getExternalLaunchAuth(id: string): Promise<{
  name: string
  uuid: string
  accessToken: string
  serverName: string
  server: string
  prefetched: string
}> {
  const accounts = await loadAccounts()
  const account = accounts.find((a) => a.id === id)
  if (!account) throw new Error('外置账号不存在，请到账号页重新选择')
  let accessToken = unseal(account.accessToken, account.encrypted)
  let valid = false
  try {
    await post(account.serverUrl, '/authserver/validate', { accessToken, clientToken: account.clientToken })
    valid = true
  } catch {
    // 令牌无效时尝试刷新
  }
  if (!valid) {
    try {
      const refreshed = await post<AuthResponse>(account.serverUrl, '/authserver/refresh', {
        accessToken,
        clientToken: account.clientToken
      })
      if (!refreshed?.accessToken) throw new Error()
      accessToken = refreshed.accessToken
      const token = seal(accessToken)
      Object.assign(account, {
        accessToken: token.value,
        encrypted: token.encrypted,
        clientToken: refreshed.clientToken
      })
      await saveAccounts()
    } catch {
      throw new Error(`${account.name}（${account.serverName}）的登录已过期，请到账号页删除后重新登录`)
    }
  }
  // 更新服务器元数据（失败时使用保存的）
  let metadata = account.metadata
  try {
    metadata = (await resolveServer(account.serverUrl)).metadata
  } catch {
    // 使用保存的元数据
  }
  return {
    name: account.name,
    uuid: account.uuid,
    accessToken,
    serverName: account.serverName,
    server: account.serverUrl,
    prefetched: Buffer.from(metadata).toString('base64')
  }
}
