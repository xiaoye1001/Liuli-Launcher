/**
 * 村民交易参考：交易写在游戏代码里，不在数据文件里，所以这里是整理好的原版 Java 版（1.14 以后）常见交易。
 * 实际价格会随需求、折扣（治愈僵尸村民、英雄效果）变化；一个村民每个等级只会随机出现其中几项
 */
export type TradeLevel = 1 | 2 | 3 | 4 | 5

export const TRADE_LEVELS: Record<TradeLevel, string> = { 1: '新手', 2: '学徒', 3: '老手', 4: '专家', 5: '大师' }

export interface TradeItem {
  /** 物品 ID（可以点开查合成） */
  id: string
  name: string
  count: number
}

export interface VillagerTrade {
  level: TradeLevel
  /** 村民收：给村民这些东西 */
  give: TradeItem[]
  /** 得到 */
  get: TradeItem
  /** 补充说明，例如附魔书价格随附魔变化 */
  note?: string
}

export interface Profession {
  key: string
  name: string
  /** 工作站方块 */
  workstation: TradeItem
  trades: VillagerTrade[]
}

const E = (count: number): TradeItem => ({ id: 'emerald', name: '绿宝石', count })
const I = (id: string, name: string, count = 1): TradeItem => ({ id, name, count })
/** 村民收东西给绿宝石 */
const buy = (level: TradeLevel, id: string, name: string, count: number): VillagerTrade => ({
  level,
  give: [I(id, name, count)],
  get: E(1)
})
/** 用绿宝石买东西；价格写 0 表示随附魔变化，不固定 */
const sell = (level: TradeLevel, price: number, item: TradeItem, note?: string): VillagerTrade =>
  note ? { level, give: [E(price)], get: item, note } : { level, give: [E(price)], get: item }

export const PROFESSIONS: Profession[] = [
  {
    key: 'farmer',
    name: '农民',
    workstation: I('composter', '堆肥桶'),
    trades: [
      buy(1, 'wheat', '小麦', 20),
      buy(1, 'potato', '马铃薯', 26),
      buy(1, 'carrot', '胡萝卜', 22),
      buy(1, 'beetroot', '甜菜根', 15),
      sell(1, 1, I('bread', '面包', 6)),
      buy(2, 'pumpkin', '南瓜', 6),
      sell(2, 1, I('pumpkin_pie', '南瓜派', 4)),
      sell(2, 1, I('apple', '苹果', 4)),
      buy(3, 'melon', '西瓜', 4),
      sell(3, 3, I('cookie', '曲奇', 18)),
      sell(4, 1, I('cake', '蛋糕')),
      sell(5, 3, I('golden_carrot', '金胡萝卜', 3)),
      sell(5, 4, I('glistering_melon_slice', '闪烁的西瓜片', 3))
    ]
  },
  {
    key: 'librarian',
    name: '图书管理员',
    workstation: I('lectern', '讲台'),
    trades: [
      buy(1, 'paper', '纸', 24),
      sell(1, 9, I('bookshelf', '书架')),
      {
        level: 1,
        give: [E(5), I('book', '书')],
        get: I('enchanted_book', '附魔书'),
        note: '5～64 个绿宝石，看附魔种类和等级；新手到专家都可能出现，经验修补、精准采集都能从这里拿'
      },
      buy(2, 'book', '书', 4),
      sell(2, 1, I('lantern', '灯笼')),
      buy(3, 'ink_sac', '墨囊', 5),
      sell(3, 1, I('glass', '玻璃', 4)),
      buy(4, 'writable_book', '书与笔', 2),
      sell(5, 20, I('name_tag', '命名牌'))
    ]
  },
  {
    key: 'cleric',
    name: '牧师',
    workstation: I('brewing_stand', '酿造台'),
    trades: [
      buy(1, 'rotten_flesh', '腐肉', 32),
      sell(1, 1, I('redstone', '红石粉', 2)),
      buy(2, 'gold_ingot', '金锭', 3),
      sell(2, 1, I('lapis_lazuli', '青金石')),
      buy(3, 'rabbit_foot', '兔子脚', 2),
      sell(3, 4, I('glowstone', '荧石')),
      buy(4, 'turtle_scute', '海龟鳞甲', 4),
      buy(4, 'glass_bottle', '玻璃瓶', 9),
      sell(4, 5, I('ender_pearl', '末影珍珠')),
      buy(5, 'nether_wart', '下界疣', 22),
      sell(5, 3, I('experience_bottle', '附魔之瓶'))
    ]
  },
  {
    key: 'fletcher',
    name: '制箭师',
    workstation: I('fletching_table', '制箭台'),
    trades: [
      buy(1, 'stick', '木棍', 32),
      sell(1, 1, I('arrow', '箭', 16)),
      buy(2, 'flint', '燧石', 26),
      sell(2, 2, I('bow', '弓')),
      buy(3, 'string', '线', 14),
      sell(3, 3, I('crossbow', '弩')),
      buy(4, 'feather', '羽毛', 24),
      buy(5, 'tripwire_hook', '绊线钩', 8)
    ]
  },
  {
    key: 'fisherman',
    name: '渔夫',
    workstation: I('barrel', '木桶'),
    trades: [
      buy(1, 'string', '线', 20),
      buy(1, 'coal', '煤炭', 10),
      buy(2, 'cod', '生鳕鱼', 15),
      buy(3, 'salmon', '生鲑鱼', 13),
      buy(4, 'tropical_fish', '热带鱼', 6),
      buy(5, 'pufferfish', '河豚', 4)
    ]
  },
  {
    key: 'shepherd',
    name: '牧羊人',
    workstation: I('loom', '织布机'),
    trades: [
      buy(1, 'white_wool', '白色羊毛', 18),
      sell(1, 2, I('shears', '剪刀')),
      sell(2, 1, I('white_wool', '羊毛')),
      sell(3, 1, I('white_carpet', '地毯', 4)),
      sell(4, 3, I('white_bed', '床')),
      sell(5, 2, I('painting', '画', 3))
    ]
  },
  {
    key: 'cartographer',
    name: '制图师',
    workstation: I('cartography_table', '制图台'),
    trades: [
      buy(1, 'paper', '纸', 24),
      sell(1, 7, I('map', '空地图')),
      buy(2, 'glass_pane', '玻璃板', 11),
      { level: 2, give: [E(13), I('compass', '指南针')], get: I('filled_map', '海洋探险家地图'), note: '指向海底神殿' },
      buy(3, 'compass', '指南针', 1),
      {
        level: 3,
        give: [E(14), I('compass', '指南针')],
        get: I('filled_map', '林地探险家地图'),
        note: '指向林地府邸'
      },
      sell(4, 7, I('item_frame', '物品展示框'))
    ]
  },
  {
    key: 'armorer',
    name: '盔甲匠',
    workstation: I('blast_furnace', '高炉'),
    trades: [
      buy(1, 'coal', '煤炭', 15),
      buy(2, 'iron_ingot', '铁锭', 4),
      sell(2, 36, I('bell', '钟')),
      buy(3, 'lava_bucket', '熔岩桶', 1),
      buy(4, 'diamond', '钻石', 1),
      sell(5, 0, I('diamond_chestplate', '附魔钻石盔甲'), '价格随附魔变化')
    ]
  },
  {
    key: 'weaponsmith',
    name: '武器匠',
    workstation: I('grindstone', '砂轮'),
    trades: [
      buy(1, 'coal', '煤炭', 15),
      sell(1, 3, I('iron_axe', '铁斧')),
      buy(2, 'iron_ingot', '铁锭', 4),
      sell(2, 36, I('bell', '钟')),
      buy(3, 'flint', '燧石', 24),
      buy(4, 'diamond', '钻石', 1),
      sell(5, 0, I('diamond_sword', '附魔钻石剑、斧'), '价格随附魔变化')
    ]
  },
  {
    key: 'toolsmith',
    name: '工具匠',
    workstation: I('smithing_table', '锻造台'),
    trades: [
      buy(1, 'coal', '煤炭', 15),
      sell(1, 1, I('stone_pickaxe', '石镐')),
      buy(2, 'iron_ingot', '铁锭', 4),
      sell(2, 36, I('bell', '钟')),
      buy(3, 'flint', '燧石', 30),
      buy(4, 'diamond', '钻石', 1),
      sell(5, 0, I('diamond_pickaxe', '附魔钻石工具'), '价格随附魔变化')
    ]
  },
  {
    key: 'butcher',
    name: '屠夫',
    workstation: I('smoker', '烟熏炉'),
    trades: [
      buy(1, 'chicken', '生鸡肉', 14),
      buy(1, 'porkchop', '生猪排', 7),
      buy(1, 'rabbit', '生兔肉', 4),
      buy(2, 'coal', '煤炭', 15),
      buy(3, 'mutton', '生羊肉', 7),
      buy(3, 'beef', '生牛肉', 10),
      buy(4, 'dried_kelp_block', '干海带块', 10),
      buy(5, 'sweet_berries', '甜浆果', 10)
    ]
  },
  {
    key: 'leatherworker',
    name: '皮匠',
    workstation: I('cauldron', '炼药锅'),
    trades: [
      buy(1, 'leather', '皮革', 6),
      buy(2, 'flint', '燧石', 26),
      buy(3, 'rabbit_hide', '兔子皮', 9),
      buy(4, 'turtle_scute', '海龟鳞甲', 4),
      sell(5, 6, I('saddle', '鞍'))
    ]
  },
  {
    key: 'mason',
    name: '石匠',
    workstation: I('stonecutter', '切石机'),
    trades: [
      buy(1, 'clay_ball', '黏土球', 10),
      sell(1, 1, I('brick', '红砖', 10)),
      buy(2, 'stone', '石头', 20),
      buy(3, 'granite', '花岗岩', 16),
      buy(3, 'andesite', '安山岩', 16),
      buy(3, 'diorite', '闪长岩', 16),
      buy(4, 'quartz', '下界石英', 12),
      sell(5, 1, I('quartz_block', '石英块'))
    ]
  }
]

/** 和这个物品有关的交易：村民收它，或者卖它 */
export function tradesFor(id: string): { profession: Profession; trade: VillagerTrade; sells: boolean }[] {
  const out: { profession: Profession; trade: VillagerTrade; sells: boolean }[] = []
  for (const profession of PROFESSIONS) {
    for (const trade of profession.trades) {
      if (trade.get.id === id && id !== 'emerald') out.push({ profession, trade, sells: true })
      else if (trade.give.some((g) => g.id === id && id !== 'emerald')) out.push({ profession, trade, sells: false })
    }
  }
  return out
}

/** 哪种村民用这个方块当工作站 */
export function professionOfWorkstation(id: string): Profession | undefined {
  return PROFESSIONS.find((p) => p.workstation.id === id)
}
