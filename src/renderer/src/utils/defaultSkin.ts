/**
 * 用代码绘制一张原创的默认皮肤（64×64 标准布局），避免直接打包 Mojang 的官方皮肤素材。
 * 只绘制基础层，外层（帽子/外套层）保持透明。
 */

const COLORS = {
  skin: '#e0ac7e',
  skinShade: '#c98f63',
  hair: '#3b2a1e',
  eyeWhite: '#f5f5f5',
  eye: '#2b4a8b',
  mouth: '#9c5a3c',
  shirt: '#14b8a6',
  shirtShade: '#0f8f82',
  pants: '#334a9b',
  pantsShade: '#28397a',
  shoes: '#3a3a3a'
}

type Ctx = CanvasRenderingContext2D

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** 绘制一条手臂（ox, oy 为该部位贴图区域左上角） */
function drawArm(ctx: Ctx, ox: number, oy: number): void {
  rect(ctx, COLORS.shirt, ox + 4, oy, 4, 4) // 顶面：袖子
  rect(ctx, COLORS.skin, ox + 8, oy, 4, 4) // 底面：手
  rect(ctx, COLORS.shirt, ox, oy + 4, 16, 4) // 四个侧面上部：短袖
  rect(ctx, COLORS.shirtShade, ox, oy + 7, 16, 1)
  rect(ctx, COLORS.skin, ox, oy + 8, 16, 8) // 四个侧面下部：手臂
  rect(ctx, COLORS.skinShade, ox, oy + 15, 16, 1)
}

/** 绘制一条腿 */
function drawLeg(ctx: Ctx, ox: number, oy: number): void {
  rect(ctx, COLORS.pants, ox + 4, oy, 4, 4) // 顶面
  rect(ctx, COLORS.shoes, ox + 8, oy, 4, 4) // 底面：鞋底
  rect(ctx, COLORS.pants, ox, oy + 4, 16, 9) // 四个侧面：裤子
  rect(ctx, COLORS.pantsShade, ox, oy + 12, 16, 1)
  rect(ctx, COLORS.shoes, ox, oy + 13, 16, 3) // 鞋
}

export function createDefaultSkin(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d') as Ctx

  // 头部（区域 0,0 - 32,16）
  rect(ctx, COLORS.skin, 0, 0, 32, 16)
  rect(ctx, COLORS.hair, 8, 0, 8, 8) // 头顶
  rect(ctx, COLORS.hair, 0, 8, 8, 3) // 右侧头发
  rect(ctx, COLORS.hair, 16, 8, 8, 3) // 左侧头发
  rect(ctx, COLORS.hair, 24, 8, 8, 6) // 后脑勺
  rect(ctx, COLORS.hair, 8, 8, 8, 2) // 刘海
  rect(ctx, COLORS.hair, 8, 10, 1, 1)
  rect(ctx, COLORS.hair, 15, 10, 1, 1)
  // 五官（正面区域 8,8 - 16,16）
  rect(ctx, COLORS.eyeWhite, 9, 12, 2, 1)
  rect(ctx, COLORS.eyeWhite, 13, 12, 2, 1)
  rect(ctx, COLORS.eye, 10, 12, 1, 1)
  rect(ctx, COLORS.eye, 13, 12, 1, 1)
  rect(ctx, COLORS.skinShade, 11, 13, 2, 1) // 鼻子
  rect(ctx, COLORS.mouth, 10, 14, 4, 1) // 嘴巴

  // 身体（区域 16,16 - 40,32）
  rect(ctx, COLORS.shirt, 16, 16, 24, 16)
  rect(ctx, COLORS.skin, 23, 20, 2, 1) // 领口
  rect(ctx, COLORS.shirtShade, 16, 30, 24, 2) // 衣摆阴影

  // 四肢
  drawLeg(ctx, 0, 16) // 右腿
  drawLeg(ctx, 16, 48) // 左腿
  drawArm(ctx, 40, 16) // 右臂
  drawArm(ctx, 32, 48) // 左臂

  return canvas
}
