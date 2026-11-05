/**
 * Minecraft 命令生成器（Java 版）。命令格式按版本分三段（对照 Spyglass vanilla-mcdoc 的定义和 1.21 的命令树）：
 * - legacy：1.13 ~ 1.20.4，物品用 NBT（Enchantments、display.Name、Unbreakable），文字是 JSON 字符串
 * - components：1.20.5 ~ 1.21.4，物品用数据组件（enchantments={levels:{...}}、custom_name='JSON'、unbreakable={}）
 * - snbt：1.21.5 及以上，附魔直接写 {附魔:等级}，文字组件用 SNBT（custom_name={text:"..."}、CustomName:"..."）
 */
export type CommandEra = 'legacy' | 'components' | 'snbt'

export const ERA_LABELS: Record<CommandEra, string> = {
  legacy: '1.13 ~ 1.20.4',
  components: '1.20.5 ~ 1.21.4',
  snbt: '1.21.5 及以上'
}

/** 按游戏版本号选格式；认不出的（例如快照）按最新的算 */
export function eraOf(minecraftVersion: string): CommandEra {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(minecraftVersion.trim())
  if (!m) return 'snbt'
  const minor = Number(m[1])
  const patch = Number(m[2] ?? 0)
  if (minor < 20 || (minor === 20 && patch < 5)) return 'legacy'
  if (minor < 21 || (minor === 21 && patch < 5)) return 'components'
  return 'snbt'
}

/** 命名空间 ID：没写命名空间时补上 minecraft: */
export function normalizeId(id: string): string | null {
  const text = id.trim().toLowerCase()
  if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(text)) return null
  return text.includes(':') ? text : `minecraft:${text}`
}

/** 目标：@p @a @s @r @e，或者玩家名 */
export function normalizeTarget(target: string): string | null {
  const text = target.trim()
  if (/^@[pasre]$/.test(text)) return text
  return /^[A-Za-z0-9_]{1,16}$/.test(text) ? text : null
}

/** JSON 字符串（双引号） */
const json = (text: string): string => JSON.stringify(text)

/** SNBT 双引号字符串：转义反斜杠和双引号 */
function snbtString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** 放进 SNBT 单引号字符串里的内容（例如 JSON 文字组件）：转义反斜杠和单引号 */
function singleQuoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 物品名字的文字组件：去掉默认的斜体 */
function nameComponent(name: string, era: CommandEra): string {
  if (era === 'snbt') return `{text:${snbtString(name)},italic:false}`
  return singleQuoted(`{"text":${json(name)},"italic":false}`)
}

export interface EnchantmentChoice {
  id: string
  level: number
}

export interface GiveOptions {
  target: string
  item: string
  count: number
  name: string
  enchantments: EnchantmentChoice[]
  unbreakable: boolean
}

/** 1.20.5 起「横扫之刃」的 ID 从 sweeping 改成了 sweeping_edge */
function enchantmentId(id: string, era: CommandEra): string {
  const full = normalizeId(id) ?? id
  if (era === 'legacy' && full === 'minecraft:sweeping_edge') return 'minecraft:sweeping'
  if (era !== 'legacy' && full === 'minecraft:sweeping') return 'minecraft:sweeping_edge'
  return full
}

const clampLevel = (n: number): number => Math.min(255, Math.max(1, Math.floor(Number(n) || 1)))

export function giveCommand(o: GiveOptions, era: CommandEra): string {
  const target = normalizeTarget(o.target)
  const item = normalizeId(o.item)
  if (!target) throw new Error('目标要填 @p、@a、@s 或玩家名')
  if (!item) throw new Error('物品 ID 不对，例如 minecraft:diamond_sword')
  const count = Math.min(6400, Math.max(1, Math.floor(Number(o.count) || 1)))
  const enchants = o.enchantments
    .filter((e) => normalizeId(e.id))
    .map((e) => ({ id: enchantmentId(e.id, era), level: clampLevel(e.level) }))
  const name = o.name.trim()
  let data = ''
  if (era === 'legacy') {
    const parts: string[] = []
    if (enchants.length > 0) {
      parts.push(`Enchantments:[${enchants.map((e) => `{id:${json(e.id)},lvl:${e.level}s}`).join(',')}]`)
    }
    if (name) parts.push(`display:{Name:${nameComponent(name, era)}}`)
    if (o.unbreakable) parts.push('Unbreakable:1b')
    if (parts.length > 0) data = `{${parts.join(',')}}`
  } else {
    const parts: string[] = []
    if (enchants.length > 0) {
      const levels = `{${enchants.map((e) => `${json(e.id)}:${e.level}`).join(',')}}`
      parts.push(era === 'components' ? `enchantments={levels:${levels}}` : `enchantments=${levels}`)
    }
    if (name) parts.push(`custom_name=${nameComponent(name, era)}`)
    if (o.unbreakable) parts.push('unbreakable={}')
    if (parts.length > 0) data = `[${parts.join(',')}]`
  }
  return `/give ${target} ${item}${data}${count !== 1 ? ` ${count}` : ''}`
}

export interface EffectOptions {
  target: string
  effect: string
  /** 秒数；null 表示无限 */
  seconds: number | null
  /** 等级（1 级就是 amplifier 0） */
  level: number
  hideParticles: boolean
}

export function effectCommand(o: EffectOptions, era: CommandEra): string {
  const target = normalizeTarget(o.target)
  const effect = normalizeId(o.effect)
  if (!target) throw new Error('目标要填 @p、@a、@s 或玩家名')
  if (!effect) throw new Error('效果 ID 不对')
  const amplifier = Math.min(255, Math.max(1, Math.floor(Number(o.level) || 1))) - 1
  // 1.19.4 起才有 infinite；老格式（可能是更早的版本）用一个很长的时间代替
  const duration =
    o.seconds === null
      ? era === 'legacy'
        ? '1000000'
        : 'infinite'
      : String(Math.min(1_000_000, Math.max(1, Math.floor(Number(o.seconds) || 1))))
  return `/effect give ${target} ${effect} ${duration} ${amplifier}${o.hideParticles ? ' true' : ''}`
}

export interface SummonOptions {
  entity: string
  name: string
  showName: boolean
  noAI: boolean
  invulnerable: boolean
  silent: boolean
  persistent: boolean
}

export function summonCommand(o: SummonOptions, era: CommandEra): string {
  const entity = normalizeId(o.entity)
  if (!entity) throw new Error('生物 ID 不对，例如 minecraft:zombie')
  const parts: string[] = []
  const name = o.name.trim()
  if (name) {
    parts.push(`CustomName:${era === 'snbt' ? snbtString(name) : singleQuoted(json(name))}`)
    if (o.showName) parts.push('CustomNameVisible:1b')
  }
  if (o.noAI) parts.push('NoAI:1b')
  if (o.invulnerable) parts.push('Invulnerable:1b')
  if (o.silent) parts.push('Silent:1b')
  if (o.persistent) parts.push('PersistenceRequired:1b')
  return `/summon ${entity} ~ ~ ~${parts.length > 0 ? ` {${parts.join(',')}}` : ''}`
}

export interface TellrawOptions {
  target: string
  text: string
  color: string
  bold: boolean
  italic: boolean
  underlined: boolean
}

export const TEXT_COLORS = [
  'black',
  'dark_blue',
  'dark_green',
  'dark_aqua',
  'dark_red',
  'dark_purple',
  'gold',
  'gray',
  'dark_gray',
  'blue',
  'green',
  'aqua',
  'red',
  'light_purple',
  'yellow',
  'white'
] as const

export function tellrawCommand(o: TellrawOptions, era: CommandEra): string {
  const target = normalizeTarget(o.target)
  if (!target) throw new Error('目标要填 @p、@a、@s 或玩家名')
  if (!o.text) throw new Error('请输入文字')
  const color = (TEXT_COLORS as readonly string[]).includes(o.color) ? o.color : 'white'
  const flags = (['bold', 'italic', 'underlined'] as const).filter((k) => o[k])
  if (era === 'snbt') {
    const fields = [`text:${snbtString(o.text)}`, `color:"${color}"`, ...flags.map((k) => `${k}:true`)]
    return `/tellraw ${target} {${fields.join(',')}}`
  }
  const fields = [`"text":${json(o.text)}`, `"color":"${color}"`, ...flags.map((k) => `"${k}":true`)]
  return `/tellraw ${target} {${fields.join(',')}}`
}
