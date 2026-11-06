import { app, nativeImage } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { updateSettings } from './config'
import { getAccounts, uploadMsSkinData } from './microsoft'
import type { AppSettings, MsSkinProfile, SkinModel, WardrobeSkin } from '../shared/types'

/**
 * 皮肤衣柜：保存多套皮肤，一键换上。皮肤图片保存在 userData/skin-wardrobe/<id>.png，
 * 名字和体型记在 skin-wardrobe/index.json。离线账号直接换成这套皮肤；正版账号上传到官方
 */
const DIR = join(app.getPath('userData'), 'skin-wardrobe')
const INDEX = join(DIR, 'index.json')
const MAX_SKINS = 60
const MAX_BYTES = 256 * 1024
const DATA_PREFIX = 'data:image/png;base64,'
const ID = /^[0-9a-f-]{36}$/

interface Entry {
  id: string
  name: string
  model: SkinModel
  addedAt: number
}

let entries: Entry[] | null = null
let queue: Promise<unknown> = Promise.resolve()

/** 衣柜的修改一个接一个做，避免同时改 index.json */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

function cleanName(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
  return text.slice(0, 40) || '未命名皮肤'
}

function cleanModel(value: unknown): SkinModel {
  return value === 'slim' ? 'slim' : 'default'
}

async function load(): Promise<Entry[]> {
  if (entries) return entries
  try {
    const raw = JSON.parse(await readFile(INDEX, 'utf-8')) as unknown
    entries = (Array.isArray(raw) ? raw : [])
      .filter((e): e is Entry => !!e && typeof e === 'object' && ID.test(String((e as Entry).id)))
      .map((e) => ({ id: e.id, name: cleanName(e.name), model: cleanModel(e.model), addedAt: Number(e.addedAt) || 0 }))
      .slice(0, MAX_SKINS)
  } catch {
    entries = []
  }
  return entries
}

async function save(): Promise<void> {
  await mkdir(DIR, { recursive: true })
  await writeFile(`${INDEX}.tmp`, JSON.stringify(entries ?? [], null, 2), 'utf-8')
  await rename(`${INDEX}.tmp`, INDEX)
}

/** 检查皮肤图片：PNG、不超过 256 KB、64×64 或 64×32 */
function decodeSkin(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(DATA_PREFIX)) throw new Error('皮肤必须是 PNG 图片')
  const data = Buffer.from(dataUrl.slice(DATA_PREFIX.length), 'base64')
  if (data.length === 0) throw new Error('皮肤图片是空的')
  if (data.length > MAX_BYTES) throw new Error('皮肤文件过大（超过 256 KB）')
  // PNG 文件头
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('皮肤必须是 PNG 图片')
  const size = nativeImage.createFromBuffer(data).getSize()
  if (size.width !== 64 || (size.height !== 64 && size.height !== 32)) {
    throw new Error(`皮肤尺寸应为 64×64 或 64×32，当前为 ${size.width}×${size.height}`)
  }
  return data
}

async function imageOf(id: string): Promise<Buffer> {
  return readFile(join(DIR, `${id}.png`))
}

export async function listWardrobe(): Promise<WardrobeSkin[]> {
  const list = await load()
  const result: WardrobeSkin[] = []
  for (const entry of list) {
    try {
      result.push({ ...entry, image: DATA_PREFIX + (await imageOf(entry.id)).toString('base64') })
    } catch {
      // 图片丢了：不显示
    }
  }
  return result
}

/** 放进衣柜；同一张图片已经在衣柜里时不重复保存 */
export function addToWardrobe(dataUrl: unknown, name: unknown, model: unknown): Promise<WardrobeSkin[]> {
  return serialized(async () => {
    const data = decodeSkin(dataUrl)
    const list = await load()
    for (const entry of list) {
      const existing = await imageOf(entry.id).catch(() => null)
      if (existing && existing.equals(data)) throw new Error(`衣柜里已经有这套皮肤了（「${entry.name}」）`)
    }
    if (list.length >= MAX_SKINS) throw new Error(`衣柜最多放 ${MAX_SKINS} 套皮肤，先删掉一些吧`)
    const id = randomUUID()
    await mkdir(DIR, { recursive: true })
    await writeFile(join(DIR, `${id}.png`), data)
    list.unshift({ id, name: cleanName(name), model: cleanModel(model), addedAt: Date.now() })
    await save()
    return listWardrobe()
  })
}

export function updateWardrobeSkin(id: unknown, patch: { name?: unknown; model?: unknown }): Promise<WardrobeSkin[]> {
  return serialized(async () => {
    const entry = (await load()).find((e) => e.id === id)
    if (!entry) throw new Error('衣柜里没有这套皮肤')
    if (patch.name !== undefined) entry.name = cleanName(patch.name)
    if (patch.model !== undefined) entry.model = cleanModel(patch.model)
    await save()
    return listWardrobe()
  })
}

export function removeFromWardrobe(id: unknown): Promise<WardrobeSkin[]> {
  return serialized(async () => {
    const list = await load()
    const index = list.findIndex((e) => e.id === id)
    if (index < 0) return listWardrobe()
    const [entry] = list.splice(index, 1)
    await save()
    await rm(join(DIR, `${entry.id}.png`), { force: true })
    return listWardrobe()
  })
}

/**
 * 换上衣柜里的皮肤：当前是离线账号时直接换；当前是正版账号时上传到官方（体型一起设置）。
 * 外置账号的皮肤由皮肤站管理，不能在这里换
 */
export async function wearWardrobeSkin(
  id: unknown
): Promise<{ kind: 'offline'; settings: AppSettings } | { kind: 'microsoft'; profile: MsSkinProfile }> {
  const entry = (await load()).find((e) => e.id === id)
  if (!entry) throw new Error('衣柜里没有这套皮肤')
  const data = await imageOf(entry.id)
  const accounts = await getAccounts()
  if (accounts.external.some((a) => a.id === accounts.active)) {
    throw new Error('外置账号的皮肤由皮肤站管理，请到皮肤站网站上更换')
  }
  const microsoft = accounts.accounts.find((a) => a.uuid === accounts.active)
  if (microsoft) {
    const profile = await uploadMsSkinData(microsoft.uuid, entry.model === 'slim' ? 'slim' : 'classic', data)
    return { kind: 'microsoft', profile }
  }
  const next = await updateSettings({ skinDataUrl: DATA_PREFIX + data.toString('base64'), skinModel: entry.model })
  return { kind: 'offline', settings: next }
}
