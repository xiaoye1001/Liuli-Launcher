// 方块风景渲染器：程序生成像素纹理、地形、天空与后期，输出高清壁纸（原创作品，不使用任何游戏素材）
import * as THREE from 'three'
import { EffectComposer } from './three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from './three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from './three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from './three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from './three/examples/jsm/postprocessing/OutputPass.js'

// ---------- 随机数与噪声 ----------
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeNoise(seed) {
  const r = rng(seed)
  const perm = new Uint8Array(512)
  const p = [...Array(256).keys()]
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const grad = (h, x, y) => {
    const g = h & 7
    const u = g < 4 ? x : y
    const v = g < 4 ? y : x
    return (g & 1 ? -u : u) + (g & 2 ? -2 * v : 2 * v)
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a, b, t) => a + (b - a) * t
  function noise2(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const a = perm[X] + Y
    const b = perm[X + 1] + Y
    return (
      lerp(
        lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
        lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
        v
      ) * 0.25
    )
  }
  function fbm(x, y, octaves = 5, lac = 2, gain = 0.5) {
    let sum = 0
    let amp = 1
    let freq = 1
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += noise2(x * freq, y * freq) * amp
      norm += amp
      amp *= gain
      freq *= lac
    }
    return sum / norm
  }
  function ridged(x, y, octaves = 5) {
    let sum = 0
    let amp = 0.5
    let freq = 1
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise2(x * freq, y * freq) * 2)
      sum += n * n * amp
      amp *= 0.5
      freq *= 2
    }
    return sum
  }
  return { noise2, fbm, ridged }
}

// ---------- 像素纹理 ----------
const hex = (c) => new THREE.Color(c)

/** 16×16 像素纹理：draw(x, y, r) 返回颜色 */
export function pixelTexture(seed, draw) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const r = rng(seed)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = draw(x, y, r)
      const col = c instanceof THREE.Color ? c : hex(c)
      const i = (y * size + x) * 4
      img.data[i] = Math.round(Math.min(1, col.r) * 255)
      img.data[i + 1] = Math.round(Math.min(1, col.g) * 255)
      img.data[i + 2] = Math.round(Math.min(1, col.b) * 255)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapLinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 在几种颜色之间随机取一个，并加一点明暗抖动 */
export function speckle(colors, jitter = 0.06) {
  const cs = colors.map(hex)
  return (x, y, r) => {
    const c = cs[Math.floor(r() * cs.length)].clone()
    const k = 1 + (r() - 0.5) * 2 * jitter
    return c.multiplyScalar(k)
  }
}

/** 方块侧面：上方几行是 top 的颜色（草、雪），下面是 base */
export function bandSide(topColors, baseColors, rows = 3) {
  const top = speckle(topColors)
  const base = speckle(baseColors)
  return (x, y, r) => {
    const edge = rows + (Math.sin(x * 2.1 + 1.3) > 0.3 ? 1 : 0)
    return y < edge ? top(x, y, r) : base(x, y, r)
  }
}

export function logSide(dark, light) {
  const d = hex(dark)
  const l = hex(light)
  return (x, y, r) => {
    const stripe = (x * 7 + Math.floor(y / 3) * 3) % 5 === 0 || x % 4 === 1
    const c = (stripe ? d : l).clone()
    return c.multiplyScalar(1 + (r() - 0.5) * 0.12)
  }
}

export function logTop(bark, ring1, ring2) {
  const b = hex(bark)
  const c1 = hex(ring1)
  const c2 = hex(ring2)
  return (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return b.clone().multiplyScalar(1 + (r() - 0.5) * 0.1)
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    return (Math.floor(d) % 2 ? c1 : c2).clone().multiplyScalar(1 + (r() - 0.5) * 0.08)
  }
}

// ---------- 方块世界 ----------
export class World {
  constructor() {
    this.blocks = new Map()
    this.types = {}
  }
  key(x, y, z) {
    return `${x},${y},${z}`
  }
  set(x, y, z, type) {
    if (type == null) this.blocks.delete(this.key(x, y, z))
    else this.blocks.set(this.key(x, y, z), type)
  }
  get(x, y, z) {
    return this.blocks.get(this.key(x, y, z))
  }
  /**
   * 定义方块：tex = { top, side, bottom } 或单个纹理；
   * opts: emissive、transparent、opacity、roughness、metalness、scale（小方块，例如花）、noShadow
   */
  define(name, tex, opts = {}) {
    this.types[name] = { tex, opts }
  }
  isSolidFor(neighborType, selfType) {
    if (!neighborType) return false
    const n = this.types[neighborType]
    if (!n) return false
    if (n.opts.scale) return false
    if (n.opts.transparent) return neighborType === selfType
    return true
  }
  /** 只生成看得见的方块（至少有一面露在外面） */
  build(scene, colorJitter = 0.06, seed = 7) {
    const r = rng(seed)
    const byType = {}
    for (const [k, type] of this.blocks) {
      const [x, y, z] = k.split(',').map(Number)
      const def = this.types[type]
      if (!def) continue
      if (!def.opts.scale) {
        const hidden =
          this.isSolidFor(this.get(x + 1, y, z), type) &&
          this.isSolidFor(this.get(x - 1, y, z), type) &&
          this.isSolidFor(this.get(x, y + 1, z), type) &&
          this.isSolidFor(this.get(x, y - 1, z), type) &&
          this.isSolidFor(this.get(x, y, z + 1), type) &&
          this.isSolidFor(this.get(x, y, z - 1), type)
        if (hidden) continue
      }
      ;(byType[type] ||= []).push([x, y, z])
    }
    const meshes = []
    for (const [type, list] of Object.entries(byType)) {
      const { tex, opts } = this.types[type]
      const make = (t) =>
        new THREE.MeshStandardMaterial({
          map: t,
          roughness: opts.roughness ?? 0.92,
          metalness: opts.metalness ?? 0,
          transparent: !!opts.transparent,
          opacity: opts.opacity ?? 1,
          depthWrite: !opts.transparent,
          emissive: opts.emissive ? hex(opts.emissive) : hex('#000000'),
          emissiveIntensity: opts.emissiveIntensity ?? 1,
          emissiveMap: opts.emissive ? t : null,
          envMapIntensity: opts.envIntensity ?? 1
        })
      let material
      if (tex.isTexture) material = make(tex)
      else {
        const side = make(tex.side)
        const top = make(tex.top ?? tex.side)
        const bottom = make(tex.bottom ?? tex.side)
        material = [side, side, top, bottom, side, side]
      }
      const s = opts.scale ?? 1
      const geo = new THREE.BoxGeometry(s, opts.height ?? s, s)
      const mesh = new THREE.InstancedMesh(geo, material, list.length)
      const m = new THREE.Matrix4()
      const c = new THREE.Color()
      list.forEach(([x, y, z], i) => {
        const yOff = opts.scale ? -(1 - (opts.height ?? s)) / 2 : 0
        m.makeTranslation(x + (opts.offsetX ?? 0), y + yOff, z + (opts.offsetZ ?? 0))
        mesh.setMatrixAt(i, m)
        const k = 1 + (r() - 0.5) * 2 * (opts.jitter ?? colorJitter)
        c.setRGB(k, k, k)
        mesh.setColorAt(i, c)
      })
      mesh.castShadow = !opts.noShadow && !opts.transparent
      mesh.receiveShadow = true
      if (opts.renderOrder) mesh.renderOrder = opts.renderOrder
      scene.add(mesh)
      meshes.push(mesh)
    }
    return meshes
  }
}

// ---------- 天空 ----------
export function skyDome(scene, { top, mid, horizon, bottom, sunDir, sunColor, sunGlow = 0.6, sunPower = 8 }) {
  const geo = new THREE.SphereGeometry(4000, 64, 32)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: hex(top) },
      mid: { value: hex(mid) },
      horizon: { value: hex(horizon) },
      bottom: { value: hex(bottom ?? horizon) },
      sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: hex(sunColor ?? '#ffffff') },
      sunGlow: { value: sunGlow },
      sunPower: { value: sunPower }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow; uniform float sunPower;
      varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 col = h > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.18, h)) : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
        col = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h)) : col;
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(s, sunPower) * sunGlow + pow(s, 400.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`
  })
  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)
  return mesh
}

/** 方形的太阳或月亮（带一圈光晕） */
export function squareSun(
  scene,
  camera,
  dir,
  { size = 90, color = '#fff6d8', glow = 2.2, distance = 3000, moon = false } = {}
) {
  const pos = dir.clone().normalize().multiplyScalar(distance).add(camera.position)
  const tex = pixelTexture(99, (x, y, r) => {
    const c = hex(color)
    if (moon) {
      const crater =
        (x - 5) ** 2 + (y - 6) ** 2 < 5 || (x - 10) ** 2 + (y - 11) ** 2 < 3 || (x - 11) ** 2 + (y - 4) ** 2 < 2
      return crater ? c.clone().multiplyScalar(0.78) : c.clone().multiplyScalar(0.95 + r() * 0.05)
    }
    const edge = x < 2 || y < 2 || x > 13 || y > 13
    return edge ? c.clone().multiplyScalar(0.92) : c
  })
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true, depthWrite: false })
  mat.color.setScalar(glow)
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
  sun.position.copy(pos)
  sun.lookAt(camera.position)
  scene.add(sun)
  return sun
}

export function stars(scene, count, seed, { minY = 0.05, size = 2.2, opacity = 0.95, color = '#ffffff' } = {}) {
  const r = rng(seed)
  const positions = []
  const colors = []
  const base = hex(color)
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1
    const t = r() * Math.PI * 2
    const y = minY + Math.abs(u) * (1 - minY)
    const rr = Math.sqrt(1 - y * y)
    positions.push(Math.cos(t) * rr * 3500, y * 3500, Math.sin(t) * rr * 3500)
    const k = 0.4 + r() * 0.8
    colors.push(base.r * k, base.g * k, base.b * (k + r() * 0.2))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity,
    fog: false,
    depthWrite: false
  })
  const pts = new THREE.Points(geo, mat)
  scene.add(pts)
  return pts
}

/** 方块云：高处一层扁平的云 */
export function blockClouds(
  scene,
  seed,
  {
    y = 140,
    extent = 600,
    cell = 12,
    threshold = 0.18,
    color = '#ffffff',
    opacity = 0.85,
    center = new THREE.Vector3()
  } = {}
) {
  const n = makeNoise(seed)
  const list = []
  for (let x = -extent; x < extent; x += cell) {
    for (let z = -extent; z < extent; z += cell) {
      if (n.fbm((x + center.x) / 160, (z + center.z) / 160, 3) > threshold) list.push([x + center.x, z + center.z])
    }
  }
  const geo = new THREE.BoxGeometry(cell, 4, cell)
  const mat = new THREE.MeshStandardMaterial({
    color: hex(color),
    transparent: true,
    opacity,
    roughness: 1,
    depthWrite: false,
    emissive: hex(color),
    emissiveIntensity: 0.35
  })
  const mesh = new THREE.InstancedMesh(geo, mat, list.length)
  const m = new THREE.Matrix4()
  list.forEach(([x, z], i) => {
    m.makeTranslation(x, y, z)
    mesh.setMatrixAt(i, m)
  })
  scene.add(mesh)
  return mesh
}

/** 飘浮的小粒子（花瓣、灰烬、微光） */
export function floaters(
  scene,
  seed,
  { count, box, color, size = 0.35, emissive = 0, shape = 'square', opacity = 0.95 }
) {
  const r = rng(seed)
  const geo = shape === 'square' ? new THREE.PlaneGeometry(size, size) : new THREE.BoxGeometry(size, size, size)
  const mat = new THREE.MeshStandardMaterial({
    color: hex(color),
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    emissive: hex(color),
    emissiveIntensity: emissive,
    roughness: 0.8
  })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI)
    q.setFromEuler(e)
    const s = 0.6 + r() * 0.8
    m.compose(
      new THREE.Vector3(
        box[0] + r() * (box[3] - box[0]),
        box[1] + r() * (box[4] - box[1]),
        box[2] + r() * (box[5] - box[2])
      ),
      q,
      new THREE.Vector3(s, s, s)
    )
    mesh.setMatrixAt(i, m)
    const k = 0.85 + r() * 0.3
    c.setRGB(k, k, k)
    mesh.setColorAt(i, c)
  }
  scene.add(mesh)
  return mesh
}

// ---------- 渲染 ----------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    saturation: { value: 1.08 },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    tint: { value: new THREE.Vector3(1, 1, 1) }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float saturation; uniform vec3 lift; uniform vec3 tint;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation) * tint + lift;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.0, 0.8)) * 1.25);
      gl_FragColor = c;
    }`
}

export async function render(setup, { width = 2560, height = 1440, pixelRatio = 1.5 } = {}) {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 6000)
  const cfg = await setup({ scene, camera, renderer, THREE })
  renderer.toneMappingExposure = cfg.exposure ?? 1
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(pixelRatio)
  composer.setSize(width, height)
  composer.addPass(new RenderPass(scene, camera))
  if (cfg.bloom)
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(width, height), cfg.bloom.strength, cfg.bloom.radius, cfg.bloom.threshold)
    )
  composer.addPass(new OutputPass())
  const grade = new ShaderPass(GradeShader)
  if (cfg.grade) {
    for (const [k, v] of Object.entries(cfg.grade))
      grade.uniforms[k].value = Array.isArray(v) ? new THREE.Vector3(...v) : v
  }
  composer.addPass(grade)
  composer.render()
  return canvas.toDataURL('image/png')
}
