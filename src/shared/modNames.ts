/**
 * 常用模组的中文名：搜索结果、已安装模组列表显示中文名，也可以用中文名搜索模组。
 * 这是启动器自己整理的名单（使用玩家社区通行的中文译名），只收录常见模组。
 * 每个模组按项目地址里的标识（slug）和模组 ID 精确对应，不会把中文名套到别的模组上。
 */

export interface ModName {
  /** 中文名 */
  zh: string
  /** Modrinth 上的项目标识（项目地址里的那一段），没有时为空 */
  modrinth: string
  /** CurseForge 上的项目标识，没有时为空 */
  curseforge: string
  /** 模组文件里的模组 ID（用于已安装模组列表） */
  modIds: string[]
  /** 其他常用叫法（只用于搜索） */
  aliases: string[]
}

function m(zh: string, modrinth: string, curseforge: string, modIds: string[] = [], aliases: string[] = []): ModName {
  return { zh, modrinth, curseforge, modIds, aliases }
}

export const MOD_NAMES: ModName[] = [
  // ---------- 性能优化 ----------
  m('钠', 'sodium', 'sodium', ['sodium'], ['性能优化', '帧数优化']),
  m('锂', 'lithium', 'lithium', ['lithium']),
  m('磷', 'phosphor', 'phosphor', ['phosphor']),
  m('氢', 'hydrogen', 'hydrogen', ['hydrogen']),
  m('铟', 'indium', 'indium', ['indium']),
  m('氪', 'krypton', 'krypton', ['krypton']),
  m('星光', 'starlight', 'starlight', ['starlight']),
  m('铁氧体磁芯', 'ferrite-core', 'ferritecore', ['ferritecore'], ['内存优化']),
  m('现代化修复', 'modernfix', 'modernfix', ['modernfix']),
  m('实体剔除', 'entityculling', 'entityculling', ['entityculling']),
  m('更多剔除', 'moreculling', 'moreculling', ['moreculling']),
  m('树叶剔除', 'cull-leaves', 'cull-leaves', ['cullleaves']),
  m('内存泄漏修复', 'memoryleakfix', 'memoryleakfix', ['memoryleakfix']),
  m('动态帧率', 'dynamic-fps', 'dynamic-fps', ['dynamic_fps'], ['后台降帧']),
  m('钠额外选项', 'sodium-extra', 'sodium-extra', ['sodium-extra']),
  m("钠的 Reese's 选项", 'reeses-sodium-options', 'reeses-sodium-options', ['reeses-sodium-options'], ['钠选项']),
  m('并发区块管理引擎', 'c2me-fabric', '', ['c2me']),
  m('遥远的地平线', 'distanthorizons', 'distant-horizons', ['distanthorizons'], ['远景', 'LOD']),
  m('区块预生成', 'chunky', 'chunky-pregenerator', ['chunky']),
  m('经验球合并', 'clumps', 'clumps', ['clumps']),

  // ---------- 光影与画面 ----------
  m('鸢尾花光影', 'iris', 'irisshaders', ['iris'], ['光影', 'Iris']),
  m('眼镜光影', 'oculus', 'oculus', ['oculus'], ['光影']),
  m('动态光源', 'lambdynamiclights', 'lambdynamiclights', ['lambdynamiclights'], ['手持火把发光']),
  m('连接纹理', 'continuity', 'continuity', ['continuity'], ['玻璃连接']),
  m('实体纹理特性', 'entitytexturefeatures', 'entity-texture-features-fabric', ['entity_texture_features']),
  m('实体模型特性', 'entity-model-features', 'entity-model-features', ['entity_model_features']),
  m('3D 皮肤层', '3dskinlayers', 'skin-layers-3d', ['skinlayers3d'], ['3D皮肤']),
  m('更多动画', 'not-enough-animations', 'not-enough-animations', ['notenoughanimations']),
  m('第一人称模型', 'first-person-model', 'first-person-model', ['firstperson']),
  m('更好的第三人称', 'better-third-person', 'better-third-person', ['betterthirdperson']),
  m('越肩视角', 'shoulder-surfing-reloaded', 'shoulder-surfing-reloaded', ['shouldersurfing']),
  m('声音物理', 'sound-physics-remastered', 'sound-physics-remastered', ['sound_physics_remastered'], ['音效']),
  m('环境音效', 'ambientsounds', 'ambientsounds', ['ambientsounds']),
  m('缩放', 'zoomify', 'zoomify', ['zoomify'], ['望远镜', '放大']),

  // ---------- 物品管理与信息显示 ----------
  m('JEI 物品管理器', 'jei', 'jei', ['jei'], ['物品管理器', '合成表', 'JEI']),
  m('REI 物品管理器', 'rei', 'roughly-enough-items', ['roughlyenoughitems'], ['物品管理器', '合成表', 'REI']),
  m('EMI 物品管理器', 'emi', 'emi', ['emi'], ['物品管理器', '合成表', 'EMI']),
  m('玉', 'jade', 'jade', ['jade'], ['方块信息', '高亮显示', 'Jade']),
  m('苹果皮', 'appleskin', 'appleskin', ['appleskin'], ['饱和度显示']),
  m('生物血条', 'neat', 'neat', ['neat'], ['血条']),
  m('附魔描述', 'enchantment-descriptions', 'enchantment-descriptions', ['enchdesc']),
  m('潜影盒预览', 'shulkerboxtooltip', 'shulkerboxtooltip', ['shulkerboxtooltip']),
  m('亮度覆盖', 'light-overlay', 'light-overlay', ['lightoverlay'], ['刷怪亮度']),
  m('更好的 F3', 'betterf3', 'betterf3', ['betterf3']),
  m('模组菜单', 'modmenu', 'modmenu', ['modmenu']),
  m('鼠标微调', 'mouse-tweaks', 'mouse-tweaks', ['mousetweaks']),
  m('物品栏整理', 'inventory-profiles-next', 'inventory-profiles-next', ['inventoryprofilesnext'], ['背包整理']),
  m('禁用聊天举报', 'no-chat-reports', 'no-chat-reports', ['nochatreports']),

  // ---------- 地图 ----------
  m('Xaero 的小地图', 'xaeros-minimap', 'xaeros-minimap', ['xaerominimap'], ['小地图']),
  m('Xaero 的世界地图', 'xaeros-world-map', 'xaeros-world-map', ['xaeroworldmap'], ['世界地图', '大地图']),
  m('旅行地图', 'journeymap', 'journeymap', ['journeymap'], ['小地图', '大地图']),

  // ---------- 建筑与工具 ----------
  m('投影', 'litematica', 'litematica', ['litematica'], ['原理图', '投影模组']),
  m('地毯', 'carpet', 'carpet', ['carpet'], ['地毯模组']),
  m('创世神', 'worldedit', 'worldedit', ['worldedit']),
  m('回放', 'replaymod', '', ['replaymod'], ['录像']),
  m('建筑小帮手', '', 'building-gadgets', ['buildinggadgets']),
  m('连锁挖矿（FTB）', 'ftb-ultimine', 'ftb-ultimine-forge', ['ftbultimine'], ['连锁挖矿', '连锁采集']),
  m('连锁砍树', 'fallingtree', 'falling-tree', ['fallingtree'], ['砍树']),
  m('搬运', 'carry-on', 'carry-on', ['carryon'], ['搬箱子']),
  m('火把大师', 'torchmaster', 'torchmaster', ['torchmaster']),
  m('自然指南针', 'natures-compass', 'natures-compass', ['naturescompass'], ['找群系']),
  m('探险家指南针', 'explorers-compass', 'explorers-compass', ['explorerscompass'], ['找结构']),
  m('魔改器', '', 'crafttweaker', ['crafttweaker']),

  // ---------- 存储与背包 ----------
  m('精妙背包', 'sophisticated-backpacks', 'sophisticated-backpacks', ['sophisticatedbackpacks'], ['背包']),
  m('精妙存储', 'sophisticated-storage', 'sophisticated-storage', ['sophisticatedstorage']),
  m('精致存储', 'refined-storage', 'refined-storage', ['refinedstorage']),
  m('应用能源 2', 'ae2', 'applied-energistics-2', ['ae2'], ['应用能源', 'AE2', 'AE']),
  m('旅行者背包', 'travelersbackpack', 'travelers-backpack', ['travelersbackpack'], ['背包']),
  m('储物抽屉', 'storagedrawers', 'storage-drawers', ['storagedrawers'], ['抽屉']),
  m('铁箱子', 'iron-chests', 'iron-chests', ['ironchest'], ['更多箱子']),
  m('汤姆的简易存储', 'toms-storage', 'toms-simple-storage-mod', ['toms_storage']),
  m('铁熔炉', 'iron-furnaces', 'iron-furnaces', ['ironfurnaces'], ['更多熔炉']),
  m('管道', 'pipez', 'pipez', ['pipez']),

  // ---------- 科技 ----------
  m('机械动力', 'create', 'create', ['create'], ['Create']),
  m('机械动力（Fabric）', 'create-fabric', '', ['create']),
  m('通用机械', 'mekanism', 'mekanism', ['mekanism']),
  m('热力膨胀', '', 'thermal-expansion', ['thermal_expansion'], ['热力']),
  m('热力基本', '', 'thermal-foundation', ['thermal'], ['热力']),
  m('沉浸工程', 'immersiveengineering', 'immersive-engineering', ['immersiveengineering']),
  m('工业先锋', '', 'industrial-foregoing', ['industrialforegoing']),
  m('工业时代 2', '', 'industrial-craft', ['ic2'], ['工业2', 'IC2']),
  m('末影接口', '', 'ender-io', ['enderio']),
  m('龙之研究', '', 'draconic-evolution', ['draconicevolution']),
  m('集成动力', 'integrated-dynamics', 'integrated-dynamics', ['integrateddynamics']),
  m('安全工艺', 'security-craft', 'security-craft', ['securitycraft']),
  m('前往群星', 'ad-astra', 'ad-astra', ['ad_astra'], ['太空']),
  m('瓦尔基里天空', 'valkyrien-skies', 'valkyrien-skies', ['valkyrienskies'], ['飞船']),

  // ---------- 魔法 ----------
  m('植物魔法', 'botania', 'botania', ['botania']),
  m('新生魔艺', 'ars-nouveau', 'ars-nouveau', ['ars_nouveau']),
  m('血魔法', '', 'blood-magic', ['bloodmagic']),
  m('神秘时代', '', 'thaumcraft', ['thaumcraft']),
  m('星辉魔法', '', 'astral-sorcery', ['astralsorcery']),
  m('铁魔法', 'irons-spells-n-spellbooks', 'irons-spells-n-spellbooks', ['irons_spellbooks'], ['法术书']),
  m('神秘农业', 'mystical-agriculture', 'mystical-agriculture', ['mysticalagriculture']),
  m('植物盆', 'botany-pots', 'botany-pots', ['botanypots']),

  // ---------- 冒险与生物 ----------
  m('暮色森林', 'the-twilight-forest', 'the-twilight-forest', ['twilightforest']),
  m('天境', 'aether', 'aether', ['aether'], ['天堂']),
  m('匠魂', 'tinkers-construct', 'tinkers-construct', ['tconstruct'], ['匠魂3']),
  m('冰火传说', '', 'ice-and-fire-dragons', ['iceandfire'], ['龙']),
  m('Alex 的生物', 'alexs-mobs', 'alexs-mobs', ['alexsmobs']),
  m('Alex 的洞穴', 'alexs-caves', 'alexs-caves', ['alexscaves']),
  m('莫氏生物', 'mowzies-mobs', 'mowzies-mobs', ['mowziesmobs']),
  m('灾变', '', 'l_enders-cataclysm', ['cataclysm']),
  m('地牢崛起', 'when-dungeons-arise', 'when-dungeons-arise', ['dungeons_arise']),
  m('更好的地牢', 'yungs-better-dungeons', 'yungs-better-dungeons', ['betterdungeons']),
  m('更好的废弃矿井', 'yungs-better-mineshafts', 'yungs-better-mineshafts', ['bettermineshafts']),
  m('更好的要塞', 'yungs-better-strongholds', 'yungs-better-strongholds', ['betterstrongholds']),
  m('更好的末地', 'betterend', 'betterend', ['betterend']),
  m('更好的下界', 'betternether', 'betternether', ['betternether']),
  m('超多生物群系', 'biomes-o-plenty', 'biomes-o-plenty', ['biomesoplenty'], ['生物群系']),
  m('更好的战斗', 'better-combat', 'better-combat', ['bettercombat']),
  m('史诗战斗', '', 'epic-fight-mod', ['epicfight']),
  m('起源', 'origins', 'origins', ['origins'], ['种族']),
  m('宝可梦（Cobblemon）', 'cobblemon', 'cobblemon', ['cobblemon'], ['宝可梦', '精灵宝可梦']),
  m('模拟殖民地', '', 'minecolonies', ['minecolonies'], ['殖民地']),
  m('传送石碑', 'waystones', 'waystones', ['waystones'], ['传送']),
  m('墓碑', 'gravestone-mod', 'gravestone-mod', ['gravestone'], ['死亡不掉落']),
  m('尸体', 'corpse', 'corpse', ['corpse'], ['死亡不掉落']),
  m('FTB 任务', 'ftb-quests', 'ftb-quests-forge', ['ftbquests'], ['任务书']),
  m('FTB 区块', 'ftb-chunks', 'ftb-chunks-forge', ['ftbchunks'], ['领地']),

  // ---------- 生活与装饰 ----------
  m('农夫乐事', 'farmers-delight', 'farmers-delight', ['farmersdelight'], ['料理', '美食']),
  m('杂项增补', 'supplementaries', 'supplementaries', ['supplementaries']),
  m('夸克', 'quark', 'quark', ['quark']),
  m('凿子', '', 'chisel', ['chisel'], ['雕刻']),
  m('静谧四季', 'serene-seasons', 'serene-seasons', ['sereneseasons'], ['四季']),
  m('意志坚定', 'tough-as-nails', 'tough-as-nails', ['toughasnails'], ['体温', '口渴']),
  m('水产养殖 2', 'aquaculture', 'aquaculture', ['aquaculture'], ['钓鱼']),
  m('简单语音聊天', 'simple-voice-chat', 'simple-voice-chat', ['voicechat'], ['语音']),

  // ---------- 前置与兼容 ----------
  m('布料配置', 'cloth-config', 'cloth-config', ['cloth-config', 'cloth_config'], ['Cloth Config']),
  m('壁虎库', 'geckolib', 'geckolib', ['geckolib', 'geckolib3']),
  m('饰品 API', 'curios', 'curios', ['curios'], ['饰品栏']),
  m('饰品', 'trinkets', 'trinkets', ['trinkets'], ['饰品栏']),
  m('帕秋莉手册', 'patchouli', 'patchouli', ['patchouli']),
  m('信雅互联', 'connector', 'sinytra-connector', ['connector'], ['Forge 加载 Fabric 模组'])
]

const bySlug = new Map<string, ModName>()
const byCurseForge = new Map<string, ModName>()
const byModId = new Map<string, ModName>()
for (const entry of MOD_NAMES) {
  if (entry.modrinth) bySlug.set(entry.modrinth, entry)
  if (entry.curseforge) byCurseForge.set(entry.curseforge, entry)
  // 同一个模组 ID 对应多个条目（例如机械动力的 Forge / Fabric 版）时用第一个
  for (const id of entry.modIds) if (!byModId.has(id)) byModId.set(id, entry)
}

/** 按 Modrinth / CurseForge 的项目标识查中文名 */
export function zhNameBySlug(source: 'modrinth' | 'curseforge', slug: string | undefined): string | undefined {
  if (!slug) return undefined
  return (source === 'modrinth' ? bySlug : byCurseForge).get(slug.toLowerCase())?.zh
}

/** 按模组 ID 查中文名（已安装模组列表） */
export function zhNameByModId(modId: string | undefined): string | undefined {
  if (!modId) return undefined
  return byModId.get(modId.toLowerCase())?.zh
}

/** 关键字里有没有中文 */
export function hasChinese(text: string): boolean {
  return /[㐀-鿿]/.test(text)
}

/** 比较用：去掉空格和常见标点，英文转小写 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s·・:：'’（）()\-_]/g, '')
}

/** 搜索时可以忽略的通用词（例如「钠模组」就是找「钠」） */
const GENERIC_SUFFIXES = ['模组', 'mod', 'mods', '模组下载']

/**
 * 用中文关键字找模组：中文名或其他叫法包含关键字（或关键字是中文名加上「模组」等通用词，例如「钠模组」）。
 * 完全相同的排在最前，其次是开头相同的，最多返回 limit 个
 */
export function matchChineseName(query: string, limit = 12): ModName[] {
  const q = normalize(query)
  if (!q) return []
  const scored: { entry: ModName; score: number }[] = []
  for (const entry of MOD_NAMES) {
    let score = 0
    for (const name of [entry.zh, ...entry.aliases]) {
      const n = normalize(name)
      if (!n) continue
      const s =
        n === q ? 4 : n.startsWith(q) ? 3 : n.includes(q) ? 2 : GENERIC_SUFFIXES.includes(q.replace(n, '')) ? 1 : 0
      // 中文名本身匹配比其他叫法优先
      if (s > 0) score = Math.max(score, s * 2 + (name === entry.zh ? 1 : 0))
    }
    if (score > 0) scored.push({ entry, score })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry)
}
