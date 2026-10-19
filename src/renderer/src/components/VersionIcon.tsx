import GrassBlockIcon from './GrassBlockIcon'

/** 一个小色块：[x, y, 宽, 高, 颜色] */
type Pixel = [number, number, number, number, string]

interface BlockPreset {
  label: string
  /** 顶面、左侧面、右侧面的颜色 */
  top: string
  left: string
  right: string
  /** 两个侧面顶部的一条边（例如雪），[左, 右] 的颜色 */
  topBand?: [string, string]
  /** 两个侧面中间的一条横带（例如 TNT） */
  midBand?: [string, string]
  /** 表面的纹理色块 */
  pixels?: Pixel[]
}

/**
 * 内置的版本图标：用简单的等距方块绘制（原创绘制，不使用游戏贴图）。
 * 名字保存在版本的 liuli-display.json 里，不要随意改名
 */
export const ICON_PRESETS: Record<string, BlockPreset> = {
  dirt: {
    label: '泥土',
    top: '#8a5a36',
    left: '#7a4e2e',
    right: '#5f3c22',
    pixels: [
      [12, 7, 2, 1, '#6e4628'],
      [18, 10, 2, 1, '#a06d45'],
      [5, 15, 2, 2, '#a06d45'],
      [10, 21, 2, 2, '#5f3c22'],
      [21, 19, 2, 2, '#47301b'],
      [25, 15, 1, 2, '#7a4e2e']
    ]
  },
  stone: {
    label: '石头',
    top: '#9a9a9a',
    left: '#838383',
    right: '#6a6a6a',
    pixels: [
      [10, 8, 3, 1, '#878787'],
      [19, 9, 2, 1, '#adadad'],
      [5, 14, 3, 2, '#727272'],
      [9, 21, 2, 2, '#959595'],
      [20, 18, 3, 2, '#5a5a5a'],
      [25, 22, 2, 1, '#777777']
    ]
  },
  sand: {
    label: '沙子',
    top: '#e6d9a4',
    left: '#d4c58e',
    right: '#baa974',
    pixels: [
      [12, 8, 1, 1, '#cbbb84'],
      [19, 6, 1, 1, '#f2e8bf'],
      [6, 16, 1, 1, '#e6d9a4'],
      [11, 22, 1, 1, '#c2b27c'],
      [22, 20, 1, 1, '#a69663'],
      [26, 15, 1, 1, '#cdbd86']
    ]
  },
  snow: {
    label: '雪地',
    top: '#f4f8fb',
    left: '#8a5a36',
    right: '#6e4628',
    topBand: ['#e6eef4', '#cfdbe4'],
    pixels: [
      [6, 20, 2, 2, '#a06d45'],
      [21, 22, 2, 2, '#55361f']
    ]
  },
  log: {
    label: '原木',
    top: '#c49a5c',
    left: '#6b4f2c',
    right: '#523b20',
    pixels: [
      [14, 8, 4, 1, '#9c7440'],
      [12, 9, 1, 1, '#9c7440'],
      [19, 9, 1, 1, '#9c7440'],
      [14, 10, 4, 1, '#9c7440'],
      [5, 12, 1, 10, '#57401f'],
      [9, 14, 1, 10, '#57401f'],
      [13, 16, 1, 10, '#57401f'],
      [19, 16, 1, 10, '#3f2d16'],
      [24, 13, 1, 10, '#3f2d16']
    ]
  },
  crafting: {
    label: '工作台',
    top: '#a8763f',
    left: '#8b5e34',
    right: '#6f4a28',
    topBand: ['#5c3b1d', '#4a2f17'],
    pixels: [
      [10, 8, 12, 1, '#6b4523'],
      [15, 5, 1, 9, '#6b4523'],
      [6, 17, 4, 4, '#5c3b1d'],
      [21, 17, 5, 4, '#4a2f17']
    ]
  },
  furnace: {
    label: '熔炉',
    top: '#8f8f8f',
    left: '#7a7a7a',
    right: '#626262',
    pixels: [
      [6, 17, 7, 6, '#2a2a2a'],
      [7, 19, 5, 3, '#e07b28'],
      [20, 17, 6, 1, '#555555'],
      [20, 22, 6, 1, '#555555']
    ]
  },
  tnt: {
    label: 'TNT',
    top: '#d9d9d9',
    left: '#c8352b',
    right: '#a42a22',
    midBand: ['#efefef', '#d6d6d6'],
    pixels: [[13, 8, 6, 2, '#8a1f19']]
  },
  pumpkin: {
    label: '南瓜',
    top: '#d8892a',
    left: '#e08a1f',
    right: '#c2741a',
    pixels: [
      [15, 7, 2, 2, '#5d7a2a'],
      [6, 12, 1, 12, '#c4741a'],
      [11, 14, 1, 12, '#c4741a'],
      [20, 15, 1, 12, '#a3611a'],
      [25, 12, 1, 12, '#a3611a']
    ]
  },
  diamond: {
    label: '钻石块',
    top: '#7ae6e2',
    left: '#4fc6c2',
    right: '#37a6a2',
    pixels: [
      [12, 7, 2, 1, '#c8fffd'],
      [5, 13, 2, 1, '#9ff3f0'],
      [22, 21, 2, 1, '#2b8682']
    ]
  },
  gold: {
    label: '金块',
    top: '#f8dc55',
    left: '#e3bd2c',
    right: '#c29f1c',
    pixels: [
      [12, 7, 2, 1, '#fff3b0'],
      [5, 13, 2, 1, '#fbe27a'],
      [22, 21, 2, 1, '#a07f12']
    ]
  },
  emerald: {
    label: '绿宝石块',
    top: '#5ade86',
    left: '#36b862',
    right: '#26954d',
    pixels: [
      [12, 7, 2, 1, '#b5f5c9'],
      [5, 13, 2, 1, '#7fe6a1'],
      [22, 21, 2, 1, '#1d7a3e']
    ]
  },
  redstone: {
    label: '红石块',
    top: '#dc4236',
    left: '#b52b22',
    right: '#8f1f18',
    pixels: [
      [12, 7, 2, 1, '#ff8a7f'],
      [5, 13, 2, 1, '#e0574c'],
      [22, 21, 2, 1, '#6e1611']
    ]
  },
  lapis: {
    label: '青金石块',
    top: '#3a6ad0',
    left: '#264fa6',
    right: '#1d3e85',
    pixels: [
      [12, 7, 2, 1, '#8fb0f5'],
      [5, 13, 2, 1, '#4d7bdc'],
      [22, 21, 2, 1, '#152e66']
    ]
  },
  netherrack: {
    label: '下界岩',
    top: '#8b2d2d',
    left: '#742424',
    right: '#5c1c1c',
    pixels: [
      [11, 8, 2, 1, '#a33a3a'],
      [19, 10, 2, 1, '#6b2020'],
      [6, 15, 2, 2, '#8b2d2d'],
      [11, 21, 2, 1, '#5a1a1a'],
      [21, 18, 2, 2, '#461414']
    ]
  },
  endstone: {
    label: '末地石',
    top: '#ebe8b4',
    left: '#d6d29a',
    right: '#bdb982',
    pixels: [
      [11, 8, 2, 1, '#d6d29a'],
      [6, 16, 2, 1, '#c4c08a'],
      [21, 20, 2, 1, '#a6a26c']
    ]
  },
  obsidian: {
    label: '黑曜石',
    top: '#30214a',
    left: '#211631',
    right: '#181024',
    pixels: [
      [12, 7, 2, 1, '#5b3f8a'],
      [6, 15, 2, 1, '#3c2a5c'],
      [21, 20, 2, 1, '#41306a']
    ]
  },
  ice: {
    label: '冰',
    top: '#b4dcf8',
    left: '#8cc0ea',
    right: '#73a9d6',
    pixels: [
      [11, 7, 4, 1, '#e3f3ff'],
      [5, 13, 1, 4, '#c7e6fb'],
      [22, 17, 1, 4, '#5e93c2']
    ]
  }
}

export const ICON_PRESET_KEYS = Object.keys(ICON_PRESETS)

function PresetBlock({ preset, className }: { preset: BlockPreset; className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={className} shapeRendering="crispEdges">
      <polygon points="16,2 30,9 16,16 2,9" fill={preset.top} />
      <polygon points="2,9 16,16 16,30 2,23" fill={preset.left} />
      <polygon points="30,9 16,16 16,30 30,23" fill={preset.right} />
      {preset.topBand && (
        <>
          <polygon points="2,9 16,16 16,19 2,12" fill={preset.topBand[0]} />
          <polygon points="30,9 16,16 16,19 30,12" fill={preset.topBand[1]} />
        </>
      )}
      {preset.midBand && (
        <>
          <polygon points="2,15 16,22 16,25 2,18" fill={preset.midBand[0]} />
          <polygon points="30,15 16,22 16,25 30,18" fill={preset.midBand[1]} />
        </>
      )}
      {preset.pixels?.map(([x, y, w, h, color], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={color} />)}
    </svg>
  )
}

/** 版本图标：自定义图片、内置图标，或默认的草方块 */
function VersionIcon({
  icon,
  iconUrl,
  className = 'h-9 w-9'
}: {
  icon?: string
  iconUrl?: string
  className?: string
}): JSX.Element {
  if (icon === 'custom' && iconUrl) {
    return <img src={iconUrl} alt="" draggable={false} className={`${className} shrink-0 rounded-md object-cover`} />
  }
  const preset = icon ? ICON_PRESETS[icon] : undefined
  if (preset) return <PresetBlock preset={preset} className={`${className} shrink-0`} />
  return <GrassBlockIcon className={`${className} shrink-0`} />
}

export default VersionIcon
