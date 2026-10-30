// 常用方块的像素纹理（全部程序生成）
import * as THREE from 'three'
import { pixelTexture, speckle, bandSide, logSide, logTop } from './engine.js'

let seed = 1
const T = (draw) => pixelTexture(seed++, draw)

export function defineCommon(W) {
  const grassTop = T(speckle(['#68b33f', '#74c24a', '#5ea538', '#80cb52', '#579c35']))
  const dirt = T(speckle(['#86603f', '#7a5536', '#946c48', '#6f4c30', '#8b6542']))
  const grassSide = T(bandSide(['#5fa83a', '#6bb944', '#549a33'], ['#86603f', '#7a5536', '#946c48', '#6f4c30']))
  W.define('grass', { top: grassTop, side: grassSide, bottom: dirt })
  W.define('dirt', dirt)
  W.define('stone', T(speckle(['#808080', '#8a8a8a', '#747474', '#969696', '#6d6d6d'])))
  W.define('sand', T(speckle(['#dccf98', '#e3d7a4', '#d1c48b', '#e8dcab'])))
  W.define('gravel', T(speckle(['#8d8580', '#7a726e', '#a09893', '#6c6561'])))
  const snowTop = T(speckle(['#f4f8fb', '#eaf0f6', '#ffffff', '#e2eaf2'], 0.03))
  W.define('snow', {
    top: snowTop,
    side: T(bandSide(['#f4f8fb', '#eaf0f6'], ['#86603f', '#7a5536', '#946c48'], 4)),
    bottom: dirt
  })
  W.define('snowblock', snowTop)
  W.define('stone_snow', {
    top: snowTop,
    side: T(bandSide(['#f4f8fb', '#eaf0f6'], ['#808080', '#8a8a8a', '#747474'], 4)),
    bottom: dirt
  })
  W.define('water', T(speckle(['#4f97f0', '#5aa2f5', '#468dea', '#65aaf8'], 0.04)), {
    transparent: true,
    opacity: 0.82,
    roughness: 0.05,
    metalness: 0.2,
    noShadow: true,
    renderOrder: 2,
    envIntensity: 2.5,
    emissive: '#2c64b8',
    emissiveIntensity: 0.35
  })
  W.define('ice', T(speckle(['#a8c8f5', '#b6d3fa', '#9bbdf0', '#c4dcff'], 0.04)), {
    roughness: 0.45,
    metalness: 0.0,
    envIntensity: 0.6
  })
  W.define('oak_log', { side: T(logSide('#4f3b22', '#6b5233')), top: T(logTop('#5a4428', '#b89160', '#a07e50')) })
  W.define('oak_leaves', T(speckle(['#3f8a2a', '#4a9a31', '#367a24', '#55a83a', '#2f6d1f'], 0.1)), { jitter: 0.12 })
  W.define('spruce_log', { side: T(logSide('#3a2a1a', '#4c3721')), top: T(logTop('#3a2a1a', '#7a5a38', '#6a4c2e')) })
  W.define('spruce_leaves', T(speckle(['#2d5a3a', '#335f40', '#26502f', '#3b6b47'], 0.08)), { jitter: 0.1 })
  W.define('spruce_snow', {
    top: snowTop,
    side: T(bandSide(['#f4f8fb', '#eaf0f6'], ['#2d5a3a', '#335f40', '#26502f'], 5)),
    bottom: T(speckle(['#2d5a3a', '#26502f']))
  })
  const flower = (name, colors) =>
    W.define(name, T(speckle(colors, 0.05)), { scale: 0.32, height: 0.45, noShadow: true, jitter: 0.05 })
  flower('poppy', ['#d8322b', '#e5463a', '#c0261f'])
  flower('dandelion', ['#f2d22e', '#ffe14a', '#e3bf1f'])
  flower('cornflower', ['#4a6fe0', '#5b80f0', '#3d5fcf'])
  flower('daisy', ['#f4f4f4', '#ffffff', '#e8e8e8'])
  flower('allium', ['#b765e0', '#c87bf0', '#a352cf'])
  W.define('tallgrass', T(speckle(['#4e9a30', '#5aa83a', '#47902b'], 0.08)), {
    scale: 0.18,
    height: 0.7,
    noShadow: true
  })
}

export { THREE }

export function defineCherry(W) {
  W.define('cherry_log', { side: T(logSide('#3a2226', '#4f2e33')), top: T(logTop('#3a2226', '#d98fa0', '#c77a8c')) })
  W.define('cherry_leaves', T(speckle(['#f2a7c3', '#f7b8d0', '#e895b4', '#fbc7da', '#ea9fbd'], 0.06)), { jitter: 0.1 })
  W.define('pink_petals', T(speckle(['#f7b8d0', '#fbc7da', '#ef9fbe', '#7cc24f'], 0.05)), {
    scale: 0.98,
    height: 0.1,
    noShadow: true,
    jitter: 0.05
  })
}

export function defineNether(W) {
  const rack = ['#8a3434', '#9a3c3c', '#7a2c2c', '#a84646', '#843232']
  W.define('netherrack', T(speckle(rack, 0.08)))
  W.define('nylium', {
    top: T(speckle(['#9c1c22', '#b0252b', '#8a161c', '#c22e33'])),
    side: T(bandSide(['#9c1c22', '#b0252b'], rack, 3)),
    bottom: T(speckle(rack))
  })
  W.define('crimson_stem', { side: T(logSide('#5a1d2c', '#7d2a3c')), top: T(logTop('#5a1d2c', '#b0405a', '#94344b')) })
  W.define('wart', T(speckle(['#8f1018', '#a3161f', '#7a0c13', '#b51c25'], 0.08)))
  W.define('shroomlight', T(speckle(['#ffb347', '#ffc266', '#ff9f2e', '#ffd28a'], 0.06)), {
    emissive: '#ff9a3c',
    emissiveIntensity: 1.6
  })
  W.define('glowstone', T(speckle(['#ffd27a', '#ffe39e', '#e8b55a', '#fff0c0'], 0.08)), {
    emissive: '#ffcf6a',
    emissiveIntensity: 1.8
  })
  // 熔岩：橙色底，夹着明亮的黄色流纹和暗色的冷却斑块
  const lavaBase = speckle(['#ff7a10', '#ff8c1c', '#f06a08', '#ff9a30'], 0.08)
  W.define(
    'lava',
    T((x, y, r) => {
      const flow = Math.sin(x * 0.9 + y * 0.45) + Math.sin(y * 1.3 - x * 0.3)
      if (flow > 1.35) return '#ffd25a'
      if (flow > 0.9) return '#ffb03a'
      if (flow < -1.5) return '#b8400a'
      return lavaBase(x, y, r)
    }),
    { emissive: '#ff8a20', emissiveIntensity: 0.95, noShadow: true, roughness: 0.6 }
  )
  W.define('blackstone', T(speckle(['#2b2427', '#352d31', '#221c1f', '#3d3438'], 0.06)))
  W.define('basalt', { side: T(logSide('#3c3c42', '#4d4d55')), top: T(speckle(['#4d4d55', '#44444b', '#56565e'])) })
}

export function defineEnd(W) {
  W.define('end_stone', T(speckle(['#e0dfa6', '#d6d59a', '#e8e7b4', '#cdcc8f', '#dedd9f'], 0.05)))
  W.define('obsidian', T(speckle(['#140f22', '#1d1530', '#2a1f45', '#0f0b1a', '#3a2a60'], 0.08)), { roughness: 0.35 })
  W.define('crystal', T(speckle(['#ff9ef0', '#ffc2f6', '#f07ae3', '#ffffff'], 0.05)), {
    emissive: '#ff8ef0',
    emissiveIntensity: 2.2,
    scale: 1.6
  })
  W.define('chorus', T(speckle(['#6e4a86', '#7f5898', '#5e3d74', '#8c66a6'], 0.08)))
  W.define('chorus_flower', T(speckle(['#c9a6e0', '#d9b8ef', '#b892d0'], 0.05)), {
    emissive: '#a77ad0',
    emissiveIntensity: 0.35
  })
  W.define('purpur', T(speckle(['#a77ba7', '#b48ab4', '#9a6e9a', '#c09ac0'], 0.05)))
}
