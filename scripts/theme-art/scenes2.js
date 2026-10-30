import * as THREE from 'three'
import { World, makeNoise, rng, skyDome, squareSun, stars, blockClouds, floaters } from './engine.js'
import { defineCommon, defineCherry, defineNether, defineEnd } from './blocks.js'

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
function fillTerrain(W, x0, x1, z0, z1, heightAt, surfaceAt) {
  const H = new Map()
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) H.set(`${x},${z}`, heightAt(x, z))
  for (let x = x0; x <= x1; x++)
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
  return H
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
    extent = 170,
    shadows = true
  }
) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemiI))
  const light = new THREE.DirectionalLight(sun, sunI)
  light.position.copy(target).add(sunDir.clone().normalize().multiplyScalar(300))
  light.target.position.copy(target)
  light.castShadow = shadows
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
function envFrom(renderer, scene, skyOpts, intensity = 0.35) {
  const pm = new THREE.PMREMGenerator(renderer)
  const s = new THREE.Scene()
  skyDome(s, skyOpts)
  scene.environment = pm.fromScene(s, 0.02).texture
  scene.environmentIntensity = intensity
}

// ---------- 2. 樱花之境 ----------
function cherryTree(W, x, y, z, r) {
  const h = 5 + Math.floor(r() * 3)
  const lean = r() < 0.5 ? 1 : -1
  let cx = x
  for (let i = 0; i < h; i++) {
    if (i === h - 2 && r() < 0.6) cx += lean
    W.set(cx, y + i, z, 'cherry_log')
  }
  const top = y + h
  const rx = 3.2 + r() * 1.3
  for (let dy = -2; dy <= 2; dy++) {
    const k = dy === 2 ? 0.45 : dy === 1 ? 0.8 : dy === 0 ? 1 : dy === -1 ? 0.9 : 0.6
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++) {
        const d = (dx * dx + dz * dz) / (rx * rx * k * k)
        if (d > 1 + r() * 0.25) continue
        if (dy === -2 && d < 0.55) continue
        W.set(cx + dx, top + dy, z + dz, 'cherry_leaves')
      }
  }
  // 边缘垂下的花枝
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2
    const dx = Math.round(Math.cos(a) * rx * 0.95)
    const dz = Math.round(Math.sin(a) * rx * 0.95)
    const len = 1 + Math.floor(r() * 2)
    for (let j = 1; j <= len; j++) W.set(cx + dx, top - 2 - j, z + dz, 'cherry_leaves')
  }
}

export async function cherry({ scene, camera, renderer }) {
  const W = new World()
  defineCommon(W)
  defineCherry(W)
  const n = makeNoise(42)
  const r = rng(9)
  const SEA = 63
  const height = (x, z) => {
    let h = 68 + n.fbm(x / 55, z / 55, 4) * 16 + n.fbm(x / 16, z / 16, 3) * 2
    h += smooth(90, 260, z) * (n.ridged(x / 70, z / 70, 4) * 45)
    const pond = Math.hypot(x - 14, z - 62)
    if (pond < 16) h = Math.min(h, 60 + pond * 0.35)
    return Math.round(h)
  }
  const H = fillTerrain(W, -150, 150, -30, 300, height, (x, y, z, h) => {
    if (y < h) return y < h - 2 ? 'stone' : 'dirt'
    if (h >= 108) return 'snowblock'
    if (h >= 98) return 'stone_snow'
    if (h <= SEA + 1 && Math.hypot(x - 14, z - 62) < 19) return 'sand'
    return 'grass'
  })
  for (let x = -150; x <= 150; x++)
    for (let z = -30; z <= 300; z++) {
      const h = H.get(`${x},${z}`)
      for (let y = h + 1; y <= SEA; y++) W.set(x, y, z, 'water')
    }
  for (let x = -146; x <= 146; x++)
    for (let z = -10; z <= 240; z++) {
      const h = H.get(`${x},${z}`)
      if (W.get(x, h, z) !== 'grass' || h <= SEA || h > 96) continue
      if (Math.hypot(x - 14, z - 62) < 20) continue
      const grove = n.fbm(x / 35 + 3, z / 35 - 8, 3)
      if (r() < (grove > 0.08 ? 0.014 : 0.002) && !(Math.abs(x + 4) < 16 && z < 36)) {
        cherryTree(W, x, h + 1, z, r)
        continue
      }
      if (r() < (grove > 0.05 ? 0.35 : 0.08)) W.set(x, h + 1, z, 'pink_petals')
      else if (r() < 0.15) W.set(x, h + 1, z, r() < 0.3 ? 'allium' : 'tallgrass')
    }
  camera.position.set(-14, 94, -26)
  camera.lookAt(14, 72, 80)
  camera.fov = 50
  camera.updateProjectionMatrix()
  const sunDir = new THREE.Vector3(0.75, 0.55, -0.35)
  const skyOpts = {
    top: '#6f9fe0',
    mid: '#a9c8ee',
    horizon: '#ffd6e6',
    bottom: '#f3c3d6',
    sunDir,
    sunColor: '#fff0f6',
    sunGlow: 0.4,
    sunPower: 6
  }
  skyDome(scene, skyOpts)
  envFrom(renderer, scene, skyOpts)
  scene.fog = new THREE.Fog('#f6d9e6', 110, 520)
  lightRig(scene, sunDir, {
    sun: '#fff0f2',
    sunI: 3.1,
    sky: '#d6e4fb',
    ground: '#8a6a6a',
    hemiI: 1.3,
    target: new THREE.Vector3(10, 70, 70),
    extent: 180
  })
  blockClouds(scene, 7, {
    y: 175,
    extent: 1000,
    cell: 10,
    threshold: 0.12,
    color: '#fff4fa',
    opacity: 0.88,
    center: new THREE.Vector3(0, 0, 400)
  })
  floaters(scene, 3, { count: 900, box: [-60, 66, -5, 90, 110, 140], color: '#ffc6dc', size: 0.32, emissive: 0.25 })
  W.build(scene, 0.07)
  return {
    exposure: 1.15,
    bloom: { strength: 0.28, radius: 0.6, threshold: 0.88 },
    grade: { vignette: 0.25, saturation: 1.08, tint: [1.03, 0.99, 1.02] }
  }
}

// ---------- 3. 雪原极光 ----------
function spruce(W, x, y, z, r) {
  const h = 7 + Math.floor(r() * 5)
  for (let i = 0; i < h; i++) W.set(x, y + i, z, 'spruce_log')
  for (let i = 2; i <= h + 1; i++) {
    const t = (i - 2) / (h - 1)
    const rad = Math.max(0.6, (1 - t) * 3.3) * (i % 2 ? 1 : 0.86)
    for (let dx = -4; dx <= 4; dx++)
      for (let dz = -4; dz <= 4; dz++) {
        if (dx * dx + dz * dz > rad * rad) continue
        if (dx === 0 && dz === 0 && i < h) continue
        const above = dx * dx + dz * dz > (rad - 1) * (rad - 1) || i >= h
        W.set(x + dx, y + i, z + dz, above && r() < 0.75 ? 'spruce_snow' : 'spruce_leaves')
      }
  }
  W.set(x, y + h + 2, z, 'spruce_snow')
}

function aurora(scene, seed) {
  const r = rng(seed)
  const group = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.PlaneGeometry(2600, 520, 300, 1)
    const pos = geo.attributes.position
    const ph = r() * 10
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      pos.setZ(i, Math.sin(x / 260 + ph) * 160 + Math.sin(x / 90 + ph * 2) * 40)
    }
    geo.computeVertexNormals()
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { seed: { value: r() * 100 }, strength: { value: 1.25 - k * 0.18 } },
      vertexShader: `varying vec2 vUv; varying float vX; void main(){ vUv = uv; vX = position.x; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float seed; uniform float strength; varying vec2 vUv; varying float vX;
        float h(float n){ return fract(sin(n)*43758.5453); }
        float n1(float x){ float i=floor(x); float f=fract(x); return mix(h(i), h(i+1.0), f*f*(3.0-2.0*f)); }
        void main(){
          float v = vUv.y;
          float rays = 0.35 + 0.65 * pow(n1(vX*0.06 + seed) * n1(vX*0.017 - seed*2.0), 0.7);
          float base = smoothstep(0.0, 0.05, v) * pow(1.0 - v, 2.2) * (0.75 + 0.25 * sin(v * 18.0 + vX * 0.01));
          vec3 green = vec3(0.25, 1.0, 0.62);
          vec3 teal = vec3(0.2, 0.75, 1.0);
          vec3 violet = vec3(0.62, 0.38, 1.0);
          vec3 col = mix(green, teal, smoothstep(0.15, 0.5, v));
          col = mix(col, violet, smoothstep(0.45, 0.95, v));
          float a = base * rays * strength * (0.6 + 0.4 * n1(vX*0.006 + seed*3.0));
          gl_FragColor = vec4(col * a, a);
        }`
    })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(-150 + k * 110, 430 + k * 55, 720 + k * 140)
    m.rotation.y = -0.15 + k * 0.08
    group.add(m)
  }
  scene.add(group)
}

export async function aurora_night({ scene, camera, renderer }) {
  const W = new World()
  defineCommon(W)
  const n = makeNoise(77)
  const r = rng(12)
  const LAKE = 63
  const height = (x, z) => {
    let h = 66 + n.fbm(x / 50, z / 50, 4) * 8
    h += smooth(60, 220, z) * (n.ridged(x / 75, z / 75, 5) * 95)
    h +=
      smooth(-60, -150, x) * n.ridged(x / 60, z / 60, 4) * 50 +
      smooth(70, 160, x) * n.ridged(x / 60, z / 60 + 9, 4) * 50
    const lake = Math.hypot((x - 6) / 1.6, z - 58)
    if (lake < 22) h = Math.min(h, 59 + lake * 0.2)
    return Math.round(h)
  }
  const H = fillTerrain(W, -170, 170, -30, 320, height, (x, y, z, h) => {
    if (y < h) return y < h - 1 ? 'stone' : 'dirt'
    if (h > 120 && n.noise2(x / 6, z / 6) > 0.18) return 'stone'
    return h > 78 ? 'stone_snow' : 'snow'
  })
  for (let x = -170; x <= 170; x++)
    for (let z = -30; z <= 320; z++) {
      const h = H.get(`${x},${z}`)
      for (let y = h + 1; y <= LAKE; y++) W.set(x, y, z, y === LAKE ? 'ice' : 'water')
    }
  for (let x = -166; x <= 166; x++)
    for (let z = -10; z <= 260; z++) {
      const h = H.get(`${x},${z}`)
      if (h <= LAKE || h > 112) continue
      if (Math.hypot((x - 6) / 1.6, z - 58) < 24) continue
      const forest = n.fbm(x / 30 - 5, z / 30 + 5, 3)
      if (r() < (forest > 0.1 ? 0.03 : 0.004) && !(Math.abs(x) < 14 && z < 30)) spruce(W, x, h + 1, z, r)
    }
  camera.position.set(4, 84, -30)
  camera.lookAt(6, 104, 90)
  camera.fov = 56
  camera.updateProjectionMatrix()
  const moonDir = new THREE.Vector3(-0.75, 0.55, -0.35)
  const skyOpts = {
    top: '#040a1c',
    mid: '#0b1a38',
    horizon: '#1f3c66',
    bottom: '#14223a',
    sunDir: moonDir,
    sunColor: '#9fc0ff',
    sunGlow: 0.25,
    sunPower: 12
  }
  skyDome(scene, skyOpts)
  envFrom(renderer, scene, skyOpts, 0.6)
  stars(scene, 5500, 3, { minY: 0.02, size: 2.2 })
  stars(scene, 900, 4, { minY: 0.1, size: 3.4, color: '#dfe8ff' })
  aurora(scene, 5)
  squareSun(scene, camera, new THREE.Vector3(0.62, 0.3, 1), { size: 60, color: '#e8eefc', glow: 2.0, moon: true })
  scene.fog = new THREE.Fog('#16294a', 160, 700)
  lightRig(scene, moonDir, {
    sun: '#cfdcff',
    sunI: 2.8,
    sky: '#6a93d0',
    ground: '#0d1526',
    hemiI: 1.15,
    target: new THREE.Vector3(6, 80, 90),
    extent: 200
  })
  // 极光照在雪地上的淡绿色
  const auroraLight = new THREE.DirectionalLight('#6dffc0', 0.45)
  auroraLight.position.set(0, 300, 900)
  scene.add(auroraLight)
  W.build(scene, 0.05)
  return {
    exposure: 1.3,
    bloom: { strength: 0.65, radius: 0.75, threshold: 0.6 },
    grade: { vignette: 0.35, saturation: 1.15, tint: [0.97, 1.0, 1.05] }
  }
}

// ---------- 4. 下界熔岩海 ----------
function fungus(W, x, y, z, r) {
  const h = 6 + Math.floor(r() * 6)
  for (let i = 0; i < h; i++) W.set(x, y + i, z, 'crimson_stem')
  const top = y + h
  const rad = 2.5 + r() * 1.5
  for (let dy = -2; dy <= 1; dy++)
    for (let dx = -4; dx <= 4; dx++)
      for (let dz = -4; dz <= 4; dz++) {
        const d = Math.hypot(dx, dz)
        if (d > rad - (dy === 1 ? 1.2 : 0)) continue
        if (dy < 0 && d < rad - 1.2) continue
        W.set(x + dx, top + dy, z + dz, r() < 0.08 ? 'shroomlight' : 'wart')
      }
}

export async function nether({ scene, camera, renderer }) {
  const W = new World()
  defineNether(W)
  const n = makeNoise(5)
  const r = rng(3)
  const LAVA = 31
  const floor = (x, z) => {
    // 中间是熔岩海，两侧和远处是高高的悬崖
    const side = Math.abs(x - 8 - 18 * Math.sin(z / 60))
    let h = 26 + smooth(26, 75, side) * 48 + n.fbm(x / 30, z / 30, 4) * 10 + n.fbm(x / 10, z / 10, 2) * 2
    h += smooth(170, 240, z) * 50
    const isle = n.fbm(x / 22 + 7, z / 22 - 3, 3)
    if (side < 26 && isle > 0.22) h = Math.max(h, 33 + (isle - 0.22) * 40)
    return Math.round(h)
  }
  const H = fillTerrain(W, -150, 150, -20, 260, floor, (x, y, z, h) => {
    if (y < h) return n.noise2(x / 9, y / 9 + z / 9) > 0.25 ? 'blackstone' : 'netherrack'
    if (h > 44 && n.fbm(x / 25, z / 25, 2) > 0.05) return 'nylium'
    if (h > 60 && n.noise2(x / 7, z / 7) > 0.2) return 'basalt'
    return 'netherrack'
  })
  for (let x = -150; x <= 150; x++)
    for (let z = -20; z <= 260; z++) {
      const h = H.get(`${x},${z}`)
      for (let y = h + 1; y <= LAVA; y++) W.set(x, y, z, 'lava')
    }
  // 天花板与垂下的萤石
  const ceil = (x, z) =>
    Math.round(118 - n.fbm(x / 30 + 20, z / 30, 4) * 26 - Math.max(0, n.ridged(x / 20, z / 20 + 5, 3) - 0.55) * 60)
  for (let x = -150; x <= 150; x++)
    for (let z = 20; z <= 260; z++) {
      const c = ceil(x, z)
      for (let y = c; y <= c + 2; y++) W.set(x, y, z, 'netherrack')
      if (r() < 0.012)
        for (let i = 1; i <= 2 + Math.floor(r() * 4); i++) W.set(x + Math.round(r() - 0.5), c - i, z, 'glowstone')
    }
  for (let x = -146; x <= 146; x++)
    for (let z = 0; z <= 200; z++) {
      const h = H.get(`${x},${z}`)
      if (W.get(x, h, z) === 'nylium' && h > LAVA + 2 && r() < 0.03 && !(Math.abs(x) < 8 && z < 14))
        fungus(W, x, h + 1, z, r)
    }
  camera.position.set(-6, 62, -26)
  camera.lookAt(10, 40, 90)
  camera.fov = 58
  camera.updateProjectionMatrix()
  const keyDir = new THREE.Vector3(0.3, 0.9, 0.2)
  const skyOpts = {
    top: '#1a0505',
    mid: '#3a0b08',
    horizon: '#6e1a0e',
    bottom: '#3a0b08',
    sunDir: new THREE.Vector3(0, -1, 0),
    sunColor: '#000000',
    sunGlow: 0
  }
  skyDome(scene, skyOpts)
  scene.fog = new THREE.Fog('#5e2414', 90, 400)
  lightRig(scene, keyDir, {
    sun: '#ffb08a',
    sunI: 1.3,
    sky: '#ff8a5a',
    ground: '#ffa04a',
    hemiI: 1.6,
    target: new THREE.Vector3(10, 40, 80),
    extent: 170
  })
  // 熔岩照亮四周
  for (let i = 0; i < 9; i++) {
    const l = new THREE.PointLight('#ff7a20', 260, 120, 1.6)
    l.position.set(-60 + r() * 140, LAVA + 18, 40 + r() * 130)
    scene.add(l)
  }
  floaters(scene, 4, {
    count: 260,
    box: [-60, 34, 10, 90, 90, 170],
    color: '#ff9a40',
    size: 0.2,
    emissive: 2.5,
    shape: 'cube'
  })
  floaters(scene, 6, {
    count: 300,
    box: [-60, 34, 10, 90, 90, 170],
    color: '#b8aaa6',
    size: 0.16,
    emissive: 0.1,
    shape: 'cube',
    opacity: 0.7
  })
  W.build(scene, 0.06)
  return {
    exposure: 0.95,
    bloom: { strength: 0.55, radius: 0.6, threshold: 0.8 },
    grade: { vignette: 0.4, saturation: 1.1, tint: [1.04, 0.97, 0.94] }
  }
}

// ---------- 5. 末地星海 ----------
function island(W, n, r, cx, cy, cz, rx, rz, depth, seed) {
  for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++)
    for (let z = Math.floor(cz - rz - 2); z <= cz + rz + 2; z++) {
      const d = Math.hypot((x - cx) / rx, (z - cz) / rz) + n.noise2(x / 9 + seed, z / 9) * 0.25
      if (d > 1) continue
      const top = cy + Math.round(n.fbm(x / 14 + seed, z / 14, 3) * 3 * (1 - d))
      const bottom = cy - Math.round(depth * Math.pow(1 - d, 0.7) + n.noise2(x / 5, z / 5 + seed) * 3)
      for (let y = bottom; y <= top; y++) W.set(x, y, z, 'end_stone')
    }
}

function chorus(W, x, y, z, r, depth = 0) {
  const len = 2 + Math.floor(r() * 3)
  for (let i = 0; i < len; i++) W.set(x, y + i, z, 'chorus')
  const top = y + len
  if (depth >= 3) {
    W.set(x, top, z, 'chorus_flower')
    return
  }
  const branches = 1 + Math.floor(r() * 2)
  for (let b = 0; b < branches; b++) {
    const dir = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ][Math.floor(r() * 4)]
    W.set(x + dir[0], top - 1, z + dir[1], 'chorus')
    chorus(W, x + dir[0], top, z + dir[1], r, depth + 1)
  }
  if (r() < 0.5) W.set(x, top, z, 'chorus_flower')
}

export async function the_end({ scene, camera, renderer }) {
  const W = new World()
  defineEnd(W)
  const n = makeNoise(31)
  const r = rng(8)
  island(W, n, r, 0, 60, 70, 62, 48, 38, 1)
  // 黑曜石柱环与水晶
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3
    const px = Math.round(Math.cos(a) * 40)
    const pz = Math.round(70 + Math.sin(a) * 30)
    const rad = 1 + (i % 3)
    const h = 18 + ((i * 7) % 5) * 9
    for (let y = 60; y < 60 + h; y++)
      for (let dx = -rad; dx <= rad; dx++)
        for (let dz = -rad; dz <= rad; dz++)
          if (dx * dx + dz * dz <= rad * rad + 1) W.set(px + dx, y, pz + dz, 'obsidian')
    W.set(px, 60 + h + 1, pz, 'crystal')
    const l = new THREE.PointLight('#ff8ef0', 500, 70, 1.6)
    l.position.set(px, 60 + h + 2, pz)
    scene.add(l)
  }
  // 远处的小岛与紫颂树
  const outer = [
    [-120, 72, 190, 22, 16],
    [110, 80, 230, 26, 18],
    [-30, 92, 330, 30, 20],
    [170, 66, 120, 16, 12],
    [-180, 58, 120, 18, 14]
  ]
  outer.forEach(([x, y, z, rx, rz], i) => {
    island(W, n, r, x, y, z, rx, rz, 22, i + 5)
    for (let k = 0; k < 6; k++) chorus(W, Math.round(x + (r() - 0.5) * rx), y + 3, Math.round(z + (r() - 0.5) * rz), r)
  })
  for (let k = 0; k < 7; k++) chorus(W, Math.round(-45 + r() * 20), 63, Math.round(85 + r() * 25), r)
  camera.position.set(-90, 104, -70)
  camera.lookAt(8, 68, 95)
  camera.fov = 55
  camera.updateProjectionMatrix()
  const keyDir = new THREE.Vector3(-0.4, 0.8, -0.5)
  const skyOpts = {
    top: '#020106',
    mid: '#0a0418',
    horizon: '#26103f',
    bottom: '#0a0418',
    sunDir: new THREE.Vector3(0.3, 0.12, 1),
    sunColor: '#8a4dff',
    sunGlow: 0.12,
    sunPower: 10
  }
  skyDome(scene, skyOpts)
  envFrom(renderer, scene, skyOpts, 0.5)
  stars(scene, 3500, 21, { minY: -0.6, size: 1.8, color: '#f2e6ff', opacity: 0.8 })
  stars(scene, 500, 22, { minY: -0.4, size: 3.0, color: '#d8b8ff' })
  scene.fog = new THREE.Fog('#1b0d33', 160, 760)
  lightRig(scene, keyDir, {
    sun: '#e8dcff',
    sunI: 1.9,
    sky: '#8a6ad8',
    ground: '#1a0f2e',
    hemiI: 0.9,
    target: new THREE.Vector3(0, 60, 80),
    extent: 200
  })
  floaters(scene, 9, {
    count: 350,
    box: [-120, 40, -10, 140, 140, 240],
    color: '#c79bff',
    size: 0.25,
    emissive: 2.2,
    shape: 'cube'
  })
  W.build(scene, 0.06)
  return {
    exposure: 1.15,
    bloom: { strength: 0.7, radius: 0.6, threshold: 0.6 },
    grade: { vignette: 0.42, saturation: 1.05, tint: [1.0, 0.97, 1.04] }
  }
}
