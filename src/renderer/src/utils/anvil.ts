/**
 * 附魔 / 铁砧计算器（Java 版 1.21 及以后的规则）。
 *
 * 数据来自游戏数据包（data/minecraft/enchantment/*.json 的 anvil_cost、max_level、exclusive_set、supported_items），
 * 计算规则来自游戏的铁砧代码：
 * - 一次合并的花费 = 目标的累积惩罚 + 牺牲品的累积惩罚 + 牺牲品上每个附魔的「倍率 × 合并后的等级」
 * - 牺牲品是附魔书时，倍率是 anvil_cost 的一半（至少 1）
 * - 累积惩罚：合并后 = max(两边的惩罚) × 2 + 1（0、1、3、7、15…）
 * - 一次花费达到 40 级时显示「过于昂贵！」，不能合并
 */

/** 同一组里的附魔互相冲突 */
export const EXCLUSIVE_SETS: Record<string, string[]> = {
  damage: ['sharpness', 'smite', 'bane_of_arthropods', 'impaling', 'density', 'breach'],
  armor: ['protection', 'blast_protection', 'fire_protection', 'projectile_protection'],
  boots: ['frost_walker', 'depth_strider'],
  bow: ['infinity', 'mending'],
  crossbow: ['multishot', 'piercing'],
  mining: ['fortune', 'silk_touch'],
  riptide: ['loyalty', 'channeling']
}

export interface EnchantInfo {
  id: string
  name: string
  /** 铁砧倍率（物品上的）；附魔书减半 */
  anvilCost: number
  maxLevel: number
  /** 自己的冲突组（exclusive_set） */
  exclusive?: keyof typeof EXCLUSIVE_SETS
  /** 能加在哪些物品上（supported_items 展开后的物品类别） */
  items: ItemKey[]
}

export type ItemKey =
  | 'sword'
  | 'spear'
  | 'axe'
  | 'pickaxe'
  | 'shovel'
  | 'hoe'
  | 'mace'
  | 'bow'
  | 'crossbow'
  | 'trident'
  | 'fishing_rod'
  | 'helmet'
  | 'chestplate'
  | 'leggings'
  | 'boots'
  | 'elytra'
  | 'shield'
  | 'shears'

export const ITEMS: { key: ItemKey; name: string; note?: string }[] = [
  { key: 'sword', name: '剑' },
  { key: 'axe', name: '斧' },
  { key: 'pickaxe', name: '镐' },
  { key: 'shovel', name: '锹' },
  { key: 'hoe', name: '锄' },
  { key: 'mace', name: '重锤', note: '1.21 起' },
  { key: 'spear', name: '矛', note: '1.21.11 起' },
  { key: 'bow', name: '弓' },
  { key: 'crossbow', name: '弩' },
  { key: 'trident', name: '三叉戟' },
  { key: 'fishing_rod', name: '钓鱼竿' },
  { key: 'helmet', name: '头盔' },
  { key: 'chestplate', name: '胸甲' },
  { key: 'leggings', name: '护腿' },
  { key: 'boots', name: '靴子' },
  { key: 'elytra', name: '鞘翅' },
  { key: 'shield', name: '盾牌' },
  { key: 'shears', name: '剪刀' }
]

// supported_items 标签展开成物品类别
const MELEE: ItemKey[] = ['sword', 'spear']
const SHARP: ItemKey[] = [...MELEE, 'axe']
const WEAPON: ItemKey[] = [...SHARP, 'mace']
const MINING_LOOT: ItemKey[] = ['axe', 'pickaxe', 'shovel', 'hoe']
const MINING: ItemKey[] = [...MINING_LOOT, 'shears']
const ARMOR: ItemKey[] = ['helmet', 'chestplate', 'leggings', 'boots']
const DURABILITY: ItemKey[] = [
  ...ARMOR,
  'elytra',
  'shield',
  'sword',
  'axe',
  'pickaxe',
  'shovel',
  'hoe',
  'bow',
  'crossbow',
  'trident',
  'shears',
  'fishing_rod',
  'mace',
  'spear'
]

/** 可以在铁砧上合并的附魔（不含诅咒） */
export const ENCHANTS: EnchantInfo[] = [
  { id: 'protection', name: '保护', anvilCost: 1, maxLevel: 4, exclusive: 'armor', items: ARMOR },
  { id: 'fire_protection', name: '火焰保护', anvilCost: 2, maxLevel: 4, exclusive: 'armor', items: ARMOR },
  { id: 'blast_protection', name: '爆炸保护', anvilCost: 4, maxLevel: 4, exclusive: 'armor', items: ARMOR },
  { id: 'projectile_protection', name: '弹射物保护', anvilCost: 2, maxLevel: 4, exclusive: 'armor', items: ARMOR },
  { id: 'thorns', name: '荆棘', anvilCost: 8, maxLevel: 3, items: ARMOR },
  { id: 'respiration', name: '水下呼吸', anvilCost: 4, maxLevel: 3, items: ['helmet'] },
  { id: 'aqua_affinity', name: '水下速掘', anvilCost: 4, maxLevel: 1, items: ['helmet'] },
  { id: 'swift_sneak', name: '迅捷潜行', anvilCost: 8, maxLevel: 3, items: ['leggings'] },
  { id: 'feather_falling', name: '摔落缓冲', anvilCost: 2, maxLevel: 4, items: ['boots'] },
  { id: 'depth_strider', name: '深海探索者', anvilCost: 4, maxLevel: 3, exclusive: 'boots', items: ['boots'] },
  { id: 'frost_walker', name: '冰霜行者', anvilCost: 4, maxLevel: 2, exclusive: 'boots', items: ['boots'] },
  { id: 'soul_speed', name: '灵魂疾行', anvilCost: 8, maxLevel: 3, items: ['boots'] },
  { id: 'sharpness', name: '锋利', anvilCost: 1, maxLevel: 5, exclusive: 'damage', items: SHARP },
  { id: 'smite', name: '亡灵杀手', anvilCost: 2, maxLevel: 5, exclusive: 'damage', items: WEAPON },
  { id: 'bane_of_arthropods', name: '节肢杀手', anvilCost: 2, maxLevel: 5, exclusive: 'damage', items: WEAPON },
  { id: 'knockback', name: '击退', anvilCost: 2, maxLevel: 2, items: MELEE },
  { id: 'fire_aspect', name: '火焰附加', anvilCost: 4, maxLevel: 2, items: [...MELEE, 'mace'] },
  { id: 'looting', name: '抢夺', anvilCost: 4, maxLevel: 3, items: MELEE },
  { id: 'sweeping_edge', name: '横扫之刃', anvilCost: 4, maxLevel: 3, items: ['sword'] },
  { id: 'lunge', name: '突进', anvilCost: 2, maxLevel: 3, items: ['spear'] },
  { id: 'density', name: '致密', anvilCost: 2, maxLevel: 5, exclusive: 'damage', items: ['mace'] },
  { id: 'breach', name: '破甲', anvilCost: 4, maxLevel: 4, exclusive: 'damage', items: ['mace'] },
  { id: 'wind_burst', name: '风爆', anvilCost: 4, maxLevel: 3, items: ['mace'] },
  { id: 'efficiency', name: '效率', anvilCost: 1, maxLevel: 5, items: MINING },
  { id: 'fortune', name: '时运', anvilCost: 4, maxLevel: 3, exclusive: 'mining', items: MINING_LOOT },
  { id: 'silk_touch', name: '精准采集', anvilCost: 8, maxLevel: 1, exclusive: 'mining', items: MINING_LOOT },
  { id: 'power', name: '力量', anvilCost: 1, maxLevel: 5, items: ['bow'] },
  { id: 'punch', name: '冲击', anvilCost: 4, maxLevel: 2, items: ['bow'] },
  { id: 'flame', name: '火矢', anvilCost: 4, maxLevel: 1, items: ['bow'] },
  { id: 'infinity', name: '无限', anvilCost: 8, maxLevel: 1, exclusive: 'bow', items: ['bow'] },
  { id: 'multishot', name: '多重射击', anvilCost: 4, maxLevel: 1, exclusive: 'crossbow', items: ['crossbow'] },
  { id: 'piercing', name: '穿透', anvilCost: 1, maxLevel: 4, exclusive: 'crossbow', items: ['crossbow'] },
  { id: 'quick_charge', name: '快速装填', anvilCost: 2, maxLevel: 3, items: ['crossbow'] },
  { id: 'impaling', name: '穿刺', anvilCost: 4, maxLevel: 5, exclusive: 'damage', items: ['trident'] },
  { id: 'loyalty', name: '忠诚', anvilCost: 2, maxLevel: 3, items: ['trident'] },
  { id: 'riptide', name: '激流', anvilCost: 4, maxLevel: 3, exclusive: 'riptide', items: ['trident'] },
  { id: 'channeling', name: '引雷', anvilCost: 8, maxLevel: 1, items: ['trident'] },
  { id: 'luck_of_the_sea', name: '海之眷顾', anvilCost: 4, maxLevel: 3, items: ['fishing_rod'] },
  { id: 'lure', name: '饵钓', anvilCost: 4, maxLevel: 3, items: ['fishing_rod'] },
  { id: 'unbreaking', name: '耐久', anvilCost: 2, maxLevel: 3, items: DURABILITY },
  { id: 'mending', name: '经验修补', anvilCost: 4, maxLevel: 1, items: DURABILITY }
]

const BY_ID = new Map(ENCHANTS.map((e) => [e.id, e]))

export function enchantInfo(id: string): EnchantInfo | undefined {
  return BY_ID.get(id)
}

/** 两个附魔能不能同时存在（游戏里两边的冲突组都要检查） */
export function compatible(a: string, b: string): boolean {
  if (a === b) return false
  const ea = BY_ID.get(a)
  const eb = BY_ID.get(b)
  if (ea?.exclusive && EXCLUSIVE_SETS[ea.exclusive].includes(b)) return false
  if (eb?.exclusive && EXCLUSIVE_SETS[eb.exclusive].includes(a)) return false
  return true
}

export function enchantsFor(item: ItemKey): EnchantInfo[] {
  return ENCHANTS.filter((e) => e.items.includes(item))
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export function levelText(level: number): string {
  return ROMAN[level] ?? String(level)
}

export interface BookChoice {
  id: string
  level: number
}

/** 合并树：叶子是物品（-1）或第几本书 */
type Tree = number | { target: Tree; sacrifice: Tree }

export interface AnvilStep {
  /** 左边（目标）：物品或附魔书，以及它身上的附魔 */
  target: { item: boolean; books: BookChoice[] }
  /** 右边（牺牲品）：总是附魔书 */
  sacrifice: { books: BookChoice[] }
  /** 这一步花费的经验等级 */
  cost: number
  /** 合并后这件东西的累积惩罚 */
  penalty: number
}

export interface AnvilPlan {
  steps: AnvilStep[]
  total: number
  /** 最贵的一步 */
  maxStep: number
  /** 最终物品的累积惩罚（以后再上铁砧时多花的等级） */
  penalty: number
}

/** 铁砧一次最多花 39 级 */
export const TOO_EXPENSIVE = 40

/** 附魔书作为牺牲品时，一个附魔的花费 */
function bookCost(book: BookChoice): number {
  const info = BY_ID.get(book.id)
  const multiplier = Math.max(1, Math.floor((info?.anvilCost ?? 1) / 2))
  return multiplier * book.level
}

function penaltyOf(uses: number): number {
  let p = 0
  for (let i = 0; i < uses; i++) p = p * 2 + 1
  return p
}

interface State {
  total: number
  maxStep: number
  tree: Tree
}

/**
 * 计算把这些附魔书合到物品上最省经验的顺序：枚举所有合并方式（书和书可以先合并），
 * 每一步都不能「过于昂贵」。itemUses 是物品已经上过铁砧的次数。没有可行的顺序时返回 null。
 */
export function bestAnvilPlan(books: BookChoice[], itemUses = 0): AnvilPlan | null {
  if (books.length === 0) return { steps: [], total: 0, maxStep: 0, penalty: penaltyOf(itemUses) }
  if (books.length > 12) throw new Error('附魔书太多了，最多 12 本')
  const n = books.length
  const itemBit = 1 << n
  const full = (1 << (n + 1)) - 1
  // 每个组合的「作为牺牲品时」的附魔花费
  const sacrificeCost = new Array<number>(1 << n).fill(0)
  for (let mask = 1; mask < 1 << n; mask++) {
    const low = mask & -mask
    sacrificeCost[mask] = sacrificeCost[mask ^ low] + bookCost(books[Math.log2(low)])
  }
  /** mask → (累积惩罚 → 最好的做法) */
  const best = new Map<number, Map<number, State>>()
  for (let i = 0; i < n; i++) best.set(1 << i, new Map([[0, { total: 0, maxStep: 0, tree: i }]]))
  best.set(itemBit, new Map([[penaltyOf(itemUses), { total: 0, maxStep: 0, tree: -1 }]]))

  // 按包含的元素个数从小到大
  const masks = Array.from({ length: full }, (_, i) => i + 1).sort((a, b) => popcount(a) - popcount(b))
  for (const mask of masks) {
    if (popcount(mask) < 2) continue
    const result = new Map<number, State>()
    for (let target = (mask - 1) & mask; target > 0; target = (target - 1) & mask) {
      const sacrifice = mask ^ target
      // 物品只能当目标；牺牲品只能是附魔书
      if (sacrifice & itemBit) continue
      const left = best.get(target)
      const right = best.get(sacrifice)
      if (!left || !right) continue
      for (const [penA, a] of left) {
        for (const [penB, b] of right) {
          const step = penA + penB + sacrificeCost[sacrifice]
          if (step >= TOO_EXPENSIVE) continue
          const penalty = Math.max(penA, penB) * 2 + 1
          const total = a.total + b.total + step
          const maxStep = Math.max(a.maxStep, b.maxStep, step)
          const old = result.get(penalty)
          if (!old || total < old.total || (total === old.total && maxStep < old.maxStep)) {
            result.set(penalty, { total, maxStep, tree: { target: a.tree, sacrifice: b.tree } })
          }
        }
      }
    }
    if (result.size > 0) best.set(mask, result)
  }

  const finals = best.get(full)
  if (!finals) return null
  let chosen: [number, State] | null = null
  for (const entry of finals) {
    if (!chosen || entry[1].total < chosen[1].total || (entry[1].total === chosen[1].total && entry[0] < chosen[0]))
      chosen = entry
  }
  if (!chosen) return null
  const [finalPenalty, state] = chosen
  const steps: AnvilStep[] = []
  walk(state.tree, books, itemUses, steps)
  return { steps, total: state.total, maxStep: state.maxStep, penalty: finalPenalty }
}

function popcount(n: number): number {
  let c = 0
  while (n) {
    n &= n - 1
    c++
  }
  return c
}

/** 按合并顺序展开每一步；返回这棵子树合并后的内容和累积惩罚 */
function walk(
  tree: Tree,
  books: BookChoice[],
  itemUses: number,
  steps: AnvilStep[]
): { item: boolean; books: BookChoice[]; penalty: number } {
  if (typeof tree === 'number') {
    return tree < 0
      ? { item: true, books: [], penalty: penaltyOf(itemUses) }
      : { item: false, books: [books[tree]], penalty: 0 }
  }
  const left = walk(tree.target, books, itemUses, steps)
  const right = walk(tree.sacrifice, books, itemUses, steps)
  const cost = left.penalty + right.penalty + right.books.reduce((sum, b) => sum + bookCost(b), 0)
  const penalty = Math.max(left.penalty, right.penalty) * 2 + 1
  steps.push({
    target: { item: left.item, books: left.books },
    sacrifice: { books: right.books },
    cost,
    penalty
  })
  return { item: left.item, books: [...left.books, ...right.books], penalty }
}
