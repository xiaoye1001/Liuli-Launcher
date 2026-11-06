/**
 * 合成查询：直接读版本自己的游戏 jar 里的配方文件（data/minecraft/recipe(s)，1.12 是 assets/minecraft/recipes），
 * 所以和这个版本完全一致，不用联网。支持 1.12～1.21 以后的各种写法；特殊配方（染色盔甲、烟花之类）没有固定材料，不列出
 */
import { stat } from 'fs/promises'
import { join } from 'path'
import { Version } from '@xmcl/core'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { getSettings } from './config'
import { modsContextOf } from './mods'
import { chineseNames } from './schematics'
import type { GameRecipe, RecipeBook, RecipeIngredient, RecipeKind } from '../shared/types'

type ZipFile = Awaited<ReturnType<typeof open>>
type ZipEntry = Awaited<ReturnType<typeof readAllEntries>>[number]

/** 单个配方或标签文件的大小上限 */
const MAX_ENTRY = 256 * 1024

const KINDS: Record<string, RecipeKind> = {
  crafting_shaped: 'crafting',
  crafting_shapeless: 'crafting',
  crafting_transmute: 'crafting',
  smelting: 'smelting',
  blasting: 'blasting',
  smoking: 'smoking',
  campfire_cooking: 'campfire',
  stonecutting: 'stonecutting',
  smithing: 'smithing',
  smithing_transform: 'smithing'
}

/** 原版物品去掉 minecraft: 前缀 */
function itemId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  const s = id.trim().toLowerCase()
  if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(s)) return null
  return s.startsWith('minecraft:') ? s.slice(10) : s
}

/** 版本用的游戏 jar：先看自己的，再按继承关系找原版 */
async function jarOf(versionId: string): Promise<string> {
  const { gameDir } = await getSettings()
  const ids = [versionId]
  try {
    const version = await Version.parse(gameDir, versionId)
    ids.push(...[...version.inheritances].reverse())
  } catch {
    // 版本文件读不出来时只找自己的 jar
  }
  for (const id of ids) {
    if (!/^[^/\\]+$/.test(id) || id === '.' || id === '..') continue
    const path = join(gameDir, 'versions', id, `${id}.jar`)
    const info = await stat(path).catch(() => null)
    if (info?.isFile() && info.size > 0) return path
  }
  throw new Error('找不到这个版本的游戏文件，请先启动一次或者补全文件')
}

async function readJson(zip: ZipFile, entry: ZipEntry): Promise<unknown> {
  if (entry.uncompressedSize > MAX_ENTRY) return null
  try {
    return JSON.parse((await readEntry(zip, entry)).toString('utf-8'))
  } catch {
    return null
  }
}

/** 物品标签：标签名 → 包含的物品（标签里可以套标签） */
function resolveTag(name: string, raw: Map<string, unknown[]>, cache: Map<string, string[]>, depth = 0): string[] {
  const cached = cache.get(name)
  if (cached) return cached
  if (depth > 8) return []
  const out = new Set<string>()
  for (const value of raw.get(name) ?? []) {
    const v = typeof value === 'object' && value ? (value as { id?: unknown }).id : value
    if (typeof v !== 'string') continue
    if (v.startsWith('#')) {
      const inner = itemId(v.slice(1))
      if (inner) for (const i of resolveTag(inner, raw, cache, depth + 1)) out.add(i)
    } else {
      const id = itemId(v)
      if (id) out.add(id)
    }
  }
  const list = [...out]
  cache.set(name, list)
  return list
}

type TagLookup = (name: string) => string[]

/** 一个材料格的写法：{item}、{tag}、"minecraft:stick"、"#minecraft:planks" 或者它们的数组 */
function parseIngredient(value: unknown, tags: TagLookup): RecipeIngredient | null {
  const options = Array.isArray(value) ? value : [value]
  const items = new Set<string>()
  let tag: string | undefined
  for (const option of options) {
    if (typeof option === 'string') {
      if (option.startsWith('#')) {
        const name = itemId(option.slice(1))
        if (!name) continue
        tag ??= name
        for (const i of tags(name)) items.add(i)
      } else {
        const id = itemId(option)
        if (id) items.add(id)
      }
    } else if (option && typeof option === 'object') {
      const o = option as { item?: unknown; tag?: unknown }
      if (o.tag !== undefined) {
        const name = itemId(o.tag)
        if (!name) continue
        tag ??= name
        for (const i of tags(name)) items.add(i)
      } else {
        const id = itemId(o.item)
        if (id) items.add(id)
      }
    }
  }
  if (items.size === 0) return null
  return tag ? { items: [...items], tag } : { items: [...items] }
}

/** 产物：{item|id, count}，旧版烧炼和切石是字符串 */
function parseResult(value: unknown, count?: unknown): GameRecipe['result'] | null {
  let id: string | null = null
  let n = Number(count ?? 1)
  if (typeof value === 'string') id = itemId(value)
  else if (value && typeof value === 'object') {
    const o = value as { item?: unknown; id?: unknown; count?: unknown }
    id = itemId(o.id ?? o.item)
    if (o.count !== undefined) n = Number(o.count)
  }
  if (!id) return null
  return { item: id, count: Number.isInteger(n) && n > 0 && n <= 64 ? n : 1 }
}

/** 把一个配方文件换成统一的格式；特殊配方和读不懂的返回 null */
export function parseRecipe(id: string, json: unknown, tags: TagLookup): GameRecipe | null {
  if (!json || typeof json !== 'object') return null
  const r = json as Record<string, unknown>
  const type = typeof r.type === 'string' ? r.type.replace(/^minecraft:/, '') : ''
  const kind = KINDS[type]
  if (!kind) return null
  if (type === 'crafting_shaped') {
    const pattern = Array.isArray(r.pattern) ? r.pattern.filter((p): p is string => typeof p === 'string') : []
    const key = r.key && typeof r.key === 'object' ? (r.key as Record<string, unknown>) : {}
    if (pattern.length < 1 || pattern.length > 3) return null
    const width = Math.max(...pattern.map((p) => p.length))
    if (width < 1 || width > 3) return null
    const ingredients: RecipeIngredient[] = []
    const index = new Map<string, number>()
    const cells: number[] = []
    for (const row of pattern) {
      for (let x = 0; x < width; x++) {
        const ch = row[x] ?? ' '
        if (ch === ' ') {
          cells.push(-1)
          continue
        }
        if (!index.has(ch)) {
          const ing = parseIngredient(key[ch], tags)
          if (!ing) return null
          index.set(ch, ingredients.length)
          ingredients.push(ing)
        }
        cells.push(index.get(ch) as number)
      }
    }
    const result = parseResult(r.result)
    return result ? { id, kind, ingredients, shape: { width, height: pattern.length, cells }, result } : null
  }
  let parts: unknown[]
  if (type === 'crafting_shapeless') parts = Array.isArray(r.ingredients) ? r.ingredients : []
  else if (type === 'crafting_transmute') parts = [r.input, r.material]
  else if (type === 'smithing' || type === 'smithing_transform') {
    parts = type === 'smithing' ? [r.base, r.addition] : [r.template, r.base, r.addition]
  } else parts = [r.ingredient]
  if (parts.length < 1 || parts.length > 9) return null
  const ingredients: RecipeIngredient[] = []
  for (const part of parts) {
    // 1.20 以后的锻造模板有时可以不填
    if (part === undefined && type === 'smithing_transform') continue
    const ing = parseIngredient(part, tags)
    if (!ing) return null
    ingredients.push(ing)
  }
  const result = parseResult(r.result, r.count)
  if (!result) return null
  const recipe: GameRecipe = { id, kind, ingredients, result }
  if (kind === 'smelting' || kind === 'blasting' || kind === 'smoking' || kind === 'campfire') {
    const xp = Number(r.experience)
    const time = Number(r.cookingtime)
    if (Number.isFinite(xp) && xp >= 0) recipe.experience = xp
    recipe.time = Number.isFinite(time) && time > 0 ? time : kind === 'smelting' ? 200 : kind === 'campfire' ? 600 : 100
  }
  return recipe
}

let cache: { key: string; book: Omit<RecipeBook, 'versionId'> } | null = null

export async function getRecipeBook(versionId: string): Promise<RecipeBook> {
  const ctx = await modsContextOf(versionId)
  const jar = await jarOf(versionId)
  const info = await stat(jar)
  const zh = await chineseNames()
  const key = `${jar}|${info.size}|${info.mtimeMs}|${zh.size}`
  if (cache?.key === key) return { versionId, ...cache.book }

  const zip = await open(jar)
  try {
    const entries = await readAllEntries(zip)
    const tagRaw = new Map<string, unknown[]>()
    const recipeEntries: { id: string; entry: ZipEntry }[] = []
    let english: ZipEntry | undefined
    for (const entry of entries) {
      const name = entry.fileName
      const tag = /^data\/minecraft\/tags\/items?\/([a-z0-9_/]+)\.json$/.exec(name)
      if (tag) {
        const json = (await readJson(zip, entry)) as { values?: unknown } | null
        if (Array.isArray(json?.values)) tagRaw.set(tag[1], json.values)
        continue
      }
      const recipe = /^(?:data\/minecraft\/recipes?|assets\/minecraft\/recipes)\/([a-z0-9_/]+)\.json$/.exec(name)
      if (recipe) recipeEntries.push({ id: recipe[1], entry })
      else if (name === 'assets/minecraft/lang/en_us.json') english = entry
    }
    if (recipeEntries.length === 0) throw new Error('这个版本的游戏文件里没有配方（1.12 以前的版本不支持）')
    const tagCache = new Map<string, string[]>()
    const tags: TagLookup = (name) => resolveTag(name, tagRaw, tagCache)
    const recipes: GameRecipe[] = []
    for (const { id, entry } of recipeEntries) {
      const recipe = parseRecipe(id, await readJson(zip, entry), tags)
      if (recipe) recipes.push(recipe)
    }
    // 只带上配方里出现过的物品名字
    const used = new Set<string>()
    for (const r of recipes) {
      used.add(r.result.item)
      for (const ing of r.ingredients) for (const i of ing.items) used.add(i)
    }
    const names: Record<string, string> = {}
    const chinese = zh.size > 0
    for (const id of used) {
      const n = zh.get(id)
      if (n) names[id] = n
    }
    // 中文语言文件里没有的（或者没下载过）用游戏 jar 里的英文名
    if (english && Object.keys(names).length < used.size) {
      const lang = (await readJson(zip, english)) as Record<string, unknown> | null
      for (const id of used) {
        if (names[id]) continue
        const n = lang?.[`item.minecraft.${id}`] ?? lang?.[`block.minecraft.${id}`]
        if (typeof n === 'string') names[id] = n
      }
    }
    const book = { minecraftVersion: ctx.minecraftVersion, recipes, names, chinese }
    cache = { key, book }
    return { versionId, ...book }
  } finally {
    zip.close()
  }
}
