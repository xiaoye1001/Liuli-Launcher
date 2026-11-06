/**
 * 地图画用的颜色：游戏里每种方块在地图上显示成固定的「地图颜色」（基础色）。
 * 平铺的地图画（所有方块一样高）每个像素显示基础色 × 220 / 255。
 * 每种颜色选一种容易拿到、不会掉落、可以平放的方块
 */
export interface MapColorBlock {
  /** 地图颜色编号 */
  id: number
  /** 基础色 */
  rgb: [number, number, number]
  /** 用的方块 */
  block: string
  /** 中文名 */
  name: string
  /** 最早可用的版本：1.12（混凝土、带釉陶瓦）、1.16（下界方块）、1.17（深板岩、粗铁块） */
  since: 12 | 16 | 17
}

export const MAP_COLOR_BLOCKS: MapColorBlock[] = [
  { id: 1, rgb: [127, 178, 56], block: 'grass_block', name: '草方块', since: 12 },
  { id: 2, rgb: [247, 233, 163], block: 'birch_planks', name: '白桦木板', since: 12 },
  { id: 3, rgb: [199, 199, 199], block: 'mushroom_stem', name: '蘑菇柄', since: 12 },
  { id: 4, rgb: [255, 0, 0], block: 'redstone_block', name: '红石块', since: 12 },
  { id: 5, rgb: [160, 160, 255], block: 'packed_ice', name: '浮冰', since: 12 },
  { id: 6, rgb: [167, 167, 167], block: 'iron_block', name: '铁块', since: 12 },
  { id: 7, rgb: [0, 124, 0], block: 'oak_leaves', name: '橡树树叶', since: 12 },
  { id: 8, rgb: [255, 255, 255], block: 'white_concrete', name: '白色混凝土', since: 12 },
  { id: 9, rgb: [164, 168, 184], block: 'clay', name: '黏土块', since: 12 },
  { id: 10, rgb: [151, 109, 77], block: 'dirt', name: '泥土', since: 12 },
  { id: 11, rgb: [112, 112, 112], block: 'cobblestone', name: '圆石', since: 12 },
  { id: 13, rgb: [143, 119, 72], block: 'oak_planks', name: '橡木木板', since: 12 },
  { id: 14, rgb: [255, 252, 245], block: 'quartz_block', name: '石英块', since: 12 },
  { id: 15, rgb: [216, 127, 51], block: 'orange_concrete', name: '橙色混凝土', since: 12 },
  { id: 16, rgb: [178, 76, 216], block: 'magenta_concrete', name: '品红色混凝土', since: 12 },
  { id: 17, rgb: [102, 153, 216], block: 'light_blue_concrete', name: '淡蓝色混凝土', since: 12 },
  { id: 18, rgb: [229, 229, 51], block: 'yellow_concrete', name: '黄色混凝土', since: 12 },
  { id: 19, rgb: [127, 204, 25], block: 'lime_concrete', name: '黄绿色混凝土', since: 12 },
  { id: 20, rgb: [242, 127, 165], block: 'pink_concrete', name: '粉红色混凝土', since: 12 },
  { id: 21, rgb: [76, 76, 76], block: 'gray_concrete', name: '灰色混凝土', since: 12 },
  { id: 22, rgb: [153, 153, 153], block: 'light_gray_concrete', name: '淡灰色混凝土', since: 12 },
  { id: 23, rgb: [76, 127, 153], block: 'cyan_concrete', name: '青色混凝土', since: 12 },
  { id: 24, rgb: [127, 63, 178], block: 'purple_concrete', name: '紫色混凝土', since: 12 },
  { id: 25, rgb: [51, 76, 178], block: 'blue_concrete', name: '蓝色混凝土', since: 12 },
  { id: 26, rgb: [102, 76, 51], block: 'brown_concrete', name: '棕色混凝土', since: 12 },
  { id: 27, rgb: [102, 127, 51], block: 'green_concrete', name: '绿色混凝土', since: 12 },
  { id: 28, rgb: [153, 51, 51], block: 'red_concrete', name: '红色混凝土', since: 12 },
  { id: 29, rgb: [25, 25, 25], block: 'black_concrete', name: '黑色混凝土', since: 12 },
  { id: 30, rgb: [250, 238, 77], block: 'gold_block', name: '金块', since: 12 },
  { id: 31, rgb: [92, 219, 213], block: 'prismarine_bricks', name: '海晶石砖', since: 12 },
  { id: 32, rgb: [74, 128, 255], block: 'lapis_block', name: '青金石块', since: 12 },
  { id: 33, rgb: [0, 217, 58], block: 'emerald_block', name: '绿宝石块', since: 12 },
  { id: 34, rgb: [129, 86, 49], block: 'spruce_planks', name: '云杉木板', since: 12 },
  { id: 35, rgb: [112, 2, 0], block: 'netherrack', name: '下界岩', since: 12 },
  { id: 36, rgb: [209, 177, 161], block: 'white_terracotta', name: '白色陶瓦', since: 12 },
  { id: 37, rgb: [159, 82, 36], block: 'orange_terracotta', name: '橙色陶瓦', since: 12 },
  { id: 38, rgb: [149, 87, 108], block: 'magenta_terracotta', name: '品红色陶瓦', since: 12 },
  { id: 39, rgb: [112, 108, 138], block: 'light_blue_terracotta', name: '淡蓝色陶瓦', since: 12 },
  { id: 40, rgb: [186, 133, 36], block: 'yellow_terracotta', name: '黄色陶瓦', since: 12 },
  { id: 41, rgb: [103, 117, 53], block: 'lime_terracotta', name: '黄绿色陶瓦', since: 12 },
  { id: 42, rgb: [160, 77, 78], block: 'pink_terracotta', name: '粉红色陶瓦', since: 12 },
  { id: 43, rgb: [57, 41, 35], block: 'gray_terracotta', name: '灰色陶瓦', since: 12 },
  { id: 44, rgb: [135, 107, 98], block: 'light_gray_terracotta', name: '淡灰色陶瓦', since: 12 },
  { id: 45, rgb: [87, 92, 92], block: 'cyan_terracotta', name: '青色陶瓦', since: 12 },
  { id: 46, rgb: [122, 73, 88], block: 'purple_terracotta', name: '紫色陶瓦', since: 12 },
  { id: 47, rgb: [76, 62, 92], block: 'blue_terracotta', name: '蓝色陶瓦', since: 12 },
  { id: 48, rgb: [76, 50, 35], block: 'brown_terracotta', name: '棕色陶瓦', since: 12 },
  { id: 49, rgb: [76, 82, 42], block: 'green_terracotta', name: '绿色陶瓦', since: 12 },
  { id: 50, rgb: [142, 60, 46], block: 'red_terracotta', name: '红色陶瓦', since: 12 },
  { id: 51, rgb: [37, 22, 16], block: 'black_terracotta', name: '黑色陶瓦', since: 12 },
  { id: 52, rgb: [189, 48, 49], block: 'crimson_nylium', name: '绯红菌岩', since: 16 },
  { id: 53, rgb: [148, 63, 97], block: 'crimson_planks', name: '绯红木板', since: 16 },
  { id: 54, rgb: [92, 25, 29], block: 'crimson_hyphae', name: '绯红菌核', since: 16 },
  { id: 55, rgb: [22, 126, 134], block: 'warped_nylium', name: '诡异菌岩', since: 16 },
  { id: 56, rgb: [58, 142, 140], block: 'warped_planks', name: '诡异木板', since: 16 },
  { id: 57, rgb: [86, 44, 62], block: 'warped_hyphae', name: '诡异菌核', since: 16 },
  { id: 58, rgb: [20, 180, 133], block: 'warped_wart_block', name: '诡异疣块', since: 16 },
  { id: 59, rgb: [100, 100, 100], block: 'cobbled_deepslate', name: '深板岩圆石', since: 17 },
  { id: 60, rgb: [216, 175, 147], block: 'raw_iron_block', name: '粗铁块', since: 17 }
]

/** 平铺的地图画里显示的颜色（基础色 × 220 / 255） */
export function flatColor(rgb: [number, number, number]): [number, number, number] {
  return [Math.floor((rgb[0] * 220) / 255), Math.floor((rgb[1] * 220) / 255), Math.floor((rgb[2] * 220) / 255)]
}

export const MAP_ART_BLOCK_IDS = new Set(MAP_COLOR_BLOCKS.map((b) => b.block))
