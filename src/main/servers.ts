import { app } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getSettings } from './config'
import { parseNbt } from './nbt'
import { parseAddress } from './serverPing'
import type { SavedServer } from '../shared/types'

const SERVERS_FILE = join(app.getPath('userData'), 'servers.json')
const MAX_SERVERS = 200

let cache: SavedServer[] | null = null

function sanitize(raw: unknown): SavedServer | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.address !== 'string') return null
  return {
    id: s.id,
    name: typeof s.name === 'string' ? s.name.slice(0, 64) : '',
    address: s.address.slice(0, 255),
    versionId: typeof s.versionId === 'string' ? s.versionId : ''
  }
}

export async function listServers(): Promise<SavedServer[]> {
  if (cache) return cache
  try {
    const data = JSON.parse(await readFile(SERVERS_FILE, 'utf-8'))
    cache = (Array.isArray(data) ? data : []).map(sanitize).filter((s): s is SavedServer => !!s)
  } catch {
    cache = []
  }
  return cache
}

let writeQueue: Promise<unknown> = Promise.resolve()

/** 保存排队进行：两次同时保存不会抢同一个临时文件 */
async function save(list: SavedServer[]): Promise<SavedServer[]> {
  cache = list
  const data = JSON.stringify(list, null, 2)
  const run = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(SERVERS_FILE), { recursive: true })
      await writeFile(`${SERVERS_FILE}.tmp`, data, 'utf-8')
      await rename(`${SERVERS_FILE}.tmp`, SERVERS_FILE)
    })
  writeQueue = run
  await run
  return list
}

function validate(server: Pick<SavedServer, 'name' | 'address'>): void {
  parseAddress(server.address)
  if (server.name.length > 64) throw new Error('服务器名称不能超过 64 个字符')
}

/** 添加或修改服务器（id 为空时添加） */
export async function saveServer(server: Omit<SavedServer, 'id'> & { id?: string }): Promise<SavedServer[]> {
  const entry: SavedServer = {
    id: server.id || randomUUID(),
    name: server.name.trim() || server.address.trim(),
    address: server.address.trim(),
    versionId: server.versionId
  }
  validate(entry)
  const list = [...(await listServers())]
  const index = list.findIndex((s) => s.id === entry.id)
  if (index >= 0) list[index] = entry
  else {
    if (list.length >= MAX_SERVERS) throw new Error(`最多只能保存 ${MAX_SERVERS} 个服务器`)
    list.push(entry)
  }
  return save(list)
}

export async function deleteServer(id: string): Promise<SavedServer[]> {
  return save((await listServers()).filter((s) => s.id !== id))
}

/** 调整顺序：把服务器移到新位置 */
export async function moveServer(id: string, offset: number): Promise<SavedServer[]> {
  const list = [...(await listServers())]
  const from = list.findIndex((s) => s.id === id)
  const to = from + offset
  if (from < 0 || to < 0 || to >= list.length) return list
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return save(list)
}

/** 读取一个 servers.dat（游戏的多人游戏列表） */
async function readServersDat(path: string): Promise<{ name: string; address: string }[]> {
  try {
    const root = parseNbt(await readFile(path))
    const servers = Array.isArray(root.servers) ? root.servers : []
    return servers
      .map((s) => s as Record<string, unknown>)
      .filter((s) => typeof s.ip === 'string' && s.ip)
      .map((s) => ({ name: typeof s.name === 'string' ? s.name : '', address: String(s.ip) }))
  } catch {
    return []
  }
}

/**
 * 从游戏的多人游戏列表导入服务器：读取游戏目录和各个版本隔离文件夹里的 servers.dat，
 * 已有的地址不重复添加。返回导入的数量
 */
export async function importGameServers(): Promise<{ added: number; list: SavedServer[] }> {
  const { gameDir } = await getSettings()
  const files = [join(gameDir, 'servers.dat')]
  for (const id of await readdir(join(gameDir, 'versions')).catch(() => [] as string[])) {
    files.push(join(gameDir, 'versions', id, 'servers.dat'))
  }
  const list = [...(await listServers())]
  const known = new Set(list.map((s) => s.address.toLowerCase()))
  let added = 0
  for (const file of files) {
    for (const server of await readServersDat(file)) {
      const key = server.address.toLowerCase()
      if (known.has(key) || list.length >= MAX_SERVERS) continue
      try {
        parseAddress(server.address)
      } catch {
        continue
      }
      known.add(key)
      list.push({
        id: randomUUID(),
        name: server.name.replace(/§./g, '').slice(0, 64) || server.address,
        address: server.address,
        versionId: ''
      })
      added++
    }
  }
  return { added, list: added > 0 ? await save(list) : list }
}
