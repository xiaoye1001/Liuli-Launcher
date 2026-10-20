import * as THREE from 'three'
import { World, makeNoise, rng, skyDome, squareSun, stars, blockClouds, floaters } from './engine.js'
import { defineCommon } from './blocks.js'

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 按高度图填满地形：只填到相邻最低的高度，侧面露出来的部分也有方块 */
function fillTerrain(W, x0, x1, z0, z1, heightAt, surfaceAt) {
  const H = new Map()
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) H.set(`${x},${z}`, heightAt(x, z))
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const h = H.get(`${x},${z}`)
      const low = Math.min(
        h,
        H.get(`${x + 1},${z}`),
        H.get(`${x - 1},${z}`),
        H.get(`${x},${z + 1}`),
        H.get(`${x},${z - 1}`)
      )
      for (let y = Math.min(low - 1, h - 1); y <= h; y++) W.set(x, y, z, surfaceAt(x, y, z, h))
    }
  }
  return H
}

function oakTree(W, x, y, z, r) {
  const height = 4 + Math.floor(r() * 3)
  for (let i = 0; i < height; i++) W.set(x, y + i, z, 'oak_log')
  const top = y + height
  for (let dy = -2; dy <= 1; dy++) {
    const rad = dy <= -1 ? 2.6 : dy === 0 ? 1.8 : 1.1
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        if (dx * dx + dz * dz > rad * rad + r() * 1.2) continue
        if (dx === 0 && dz === 0 && dy < 0) continue
        if (!W.get(x + dx, top + dy, z + dz)) W.set(x + dx, top + dy, z + dz, 'oak_leaves')
      }
  }
}

function lightRig(
  scene,
  sunDir,
  {
    sun = '#ffffff',
    sunI = 3,
    sky = '#bcd7ff',
    ground = '#6b5a3a',
    hemiI = 0.8,
    target = new THREE.Vector3(),
    extent = 170
  }
) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemiI))
  const light = new THREE.DirectionalLight(sun, sunI)
  light.position.copy(target).add(sunDir.clone().normalize().multiplyScalar(300))
  light.target.position.copy(target)
  light.castShadow = true
  light.shadow.mapSize.set(4096, 4096)
  const c = light.shadow.camera
  c.left = -extent
  c.right = extent
  c.top = extent
  c.bottom = -extent
  c.near = 1
  c.far = 900
  light.shadow.bias = -0.0004
  light.shadow.normalBias = 0.5
  scene.add(light, light.target)
  return light
}

function envFrom(renderer, scene, skyOpts) {
  const pm = new THREE.PMREMGenerator(renderer)
  const s = new THREE.Scene()
  skyDome(s, skyOpts)
  scene.environment = pm.fromScene(s, 0.02).texture
  scene.environmentIntensity = 0.35
}

// ---------- 1. 晨光平原 ----------
export async function plains({ scene, camera, renderer }) {
  const W = new World()
  defineCommon(W)
  const n = makeNoise(11)
  const r = rng(5)
  const SEA = 62
  const riverX = (z) => 18 * Math.sin(z / 42) + 22 * n.noise2(z / 90, 3.3) + 6
  const height = (x, z) => {
    let h = 65 + n.fbm(x / 70, z / 70, 4) * 12 + n.fbm(x / 20, z / 20, 3) * 2.2
    // 远处的山：先是长满树的缓坡，再是雪山
    const far = smooth(120, 320, z)
    h += far * far * (n.ridged(x / 95, z / 95, 5) * 85 + 6) + smooth(100, 200, z) * (n.fbm(x / 40, z / 40, 3) * 10 + 6)
    const d = Math.abs(x - riverX(z))
    if (z < 170 && d < 7) h = Math.min(h, 58 + d * 0.75)
    return Math.round(h)
  }
  const H = fillTerrain(W, -170, 170, -40, 340, height, (x, y, z, h) => {
    if (y < h) return h > 86 ? 'stone' : y < h - 2 ? 'stone' : 'dirt'
    if (h >= 112) return 'snowblock'
    if (h >= 103) return 'stone_snow'
    if (h >= 92) return r() < 0.75 ? 'stone' : 'gravel'
    if (h <= SEA + 1 && Math.abs(x - riverX(z)) < 10) return 'sand'
    return 'grass'
  })
  for (let x = -170; x <= 170; x++)
    for (let z = -40; z <= 340; z++) {
      const h = H.get(`${x},${z}`)
      for (let y = h + 1; y <= SEA; y++) W.set(x, y, z, 'water')
    }
  // 树与花
  for (let x = -166; x <= 166; x++)
    for (let z = -20; z <= 300; z++) {
      const h = H.get(`${x},${z}`)
      if (W.get(x, h, z) !== 'grass' || h <= SEA) continue
      const forest = n.fbm(x / 40 + 9, z / 40 - 4, 3)
      if (
        r() < (forest > 0.12 || (z > 150 && h < 90) ? 0.05 : 0.006) &&
        Math.abs(x - riverX(z)) > 8 &&
        !(Math.abs(x) < 10 && z < 18)
      ) {
        oakTree(W, x, h + 1, z, r)
        continue
      }
      const meadow = n.fbm(x / 25 - 7, z / 25 + 2, 2)
      if (r() < (meadow > 0.1 ? 0.12 : 0.02)) {
        const kinds = ['poppy', 'dandelion', 'cornflower', 'daisy', 'allium']
        const pick = kinds[Math.floor((n.noise2(x / 12, z / 12) + 0.5) * kinds.length + r() * 1.2) % kinds.length]
        W.set(x, h + 1, z, pick)
      } else if (r() < 0.18) W.set(x, h + 1, z, 'tallgrass')
    }

  camera.position.set(-6, 78, -30)
  camera.lookAt(18, 70, 80)
  camera.fov = 52
  camera.updateProjectionMatrix()
  // 太阳在左前方偏低：前景是侧光，山和天边有暖色光晕
  const sunDir = new THREE.Vector3(-1, 0.2, 0.55)
  const skyOpts = {
    top: '#3a77c4',
    mid: '#8dbbe6',
    horizon: '#ffd2a1',
    bottom: '#e9b88d',
    sunDir,
    sunColor: '#ffc27a',
    sunGlow: 1.0,
    sunPower: 4
  }
  skyDome(scene, skyOpts)
  envFrom(renderer, scene, skyOpts)
  squareSun(scene, camera, sunDir, { size: 120, color: '#fff3d0', glow: 3 })
  scene.fog = new THREE.Fog('#e8d4c2', 120, 600)
  lightRig(scene, sunDir, {
    sun: '#ffd9ae',
    sunI: 3.8,
    sky: '#c6dcf7',
    ground: '#8a7a58',
    hemiI: 1.5,
    target: new THREE.Vector3(10, 66, 70),
    extent: 190
  })
  blockClouds(scene, 21, {
    y: 175,
    extent: 1000,
    cell: 10,
    threshold: 0.08,
    color: '#fff1e2',
    opacity: 0.9,
    center: new THREE.Vector3(0, 0, 400)
  })
  W.build(scene, 0.07)
  return {
    exposure: 1.25,
    bloom: { strength: 0.3, radius: 0.55, threshold: 0.88 },
    grade: { vignette: 0.26, saturation: 1.08, tint: [1.03, 1.0, 0.97], lift: [0.012, 0.01, 0.01] }
  }
}

import { cherry, aurora_night, nether, the_end } from './scenes2.js'
export const SCENES = { plains, cherry, aurora_night, nether, the_end }
