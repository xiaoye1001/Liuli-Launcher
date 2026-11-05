import { existsSync } from 'fs'
import { readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { getSettings } from './config'
import { getGameStatus, listInstalledVersions } from './launch'
import { versionGameDir } from './isolation'
import { modsContextOf } from './mods'
import type { GameOptionsInfo, KeyConflict, OptionsCopyMode, OptionsCopyResult, VideoPreset } from '../shared/types'

/**
 * 游戏内设置（options.txt：视频、按键、声音、语言等）的小工具：从其他版本复制设置、画质档位。
 * 修改前把原来的设置备份到 options.txt.liuli-backup（只保留最近一份），可以一键恢复
 */
const OPTIONS = 'options.txt'
const BACKUP = 'options.txt.liuli-backup'
/** options.txt 一般只有几 KB，太大的不处理 */
const MAX_SIZE = 1024 * 1024

interface OptionsTarget {
  gamePath: string
  file: string
  minecraftVersion: string
}

async function targetOf(versionId: string): Promise<OptionsTarget> {
  const ctx = await modsContextOf(versionId)
  const gamePath = dirname(ctx.dir)
  return { gamePath, file: join(gamePath, OPTIONS), minecraftVersion: ctx.minecraftVersion }
}

/** 1.13（快照 17w43a）起按键用名字保存（key.keyboard.w），更早用数字键码；新的版本号格式（例如 26.1）按新版本处理 */
export function usesNamedKeys(minecraftVersion: string): boolean {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1]) >= 13
  const snapshot = /^(\d{2})w(\d{2})/.exec(minecraftVersion)
  if (snapshot) return Number(snapshot[1]) * 100 + Number(snapshot[2]) >= 1743
  return true
}

/** 游戏退出时会把设置写回 options.txt，运行中修改会被覆盖 */
async function assertNotRunning(versionId: string, gamePath: string): Promise<void> {
  const game = getGameStatus()
  if (game.state !== 'launching' && game.state !== 'running') return
  let running = ''
  if (game.versionId !== versionId) {
    running = await modsContextOf(game.versionId).then(
      (ctx) => dirname(ctx.dir),
      () => ''
    )
  }
  if (game.versionId === versionId || (running && resolve(running) === resolve(gamePath))) {
    throw new Error('游戏正在运行，退出游戏时会覆盖设置，请先退出游戏')
  }
}

async function readOptions(file: string): Promise<string | null> {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > MAX_SIZE) return null
    return await readFile(file, 'utf-8')
  } catch {
    return null
  }
}

function splitLines(text: string): { lines: string[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text ? text.split(/\r?\n/) : []
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return { lines, eol }
}

const isKeyLine = (line: string): boolean => line.startsWith('key_')

/** 先写临时文件再改名，不会留下写了一半的文件 */
async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.liuli-tmp`
  try {
    await writeFile(tmp, text, 'utf-8')
    await rename(tmp, file)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

/** 修改前备份当前的设置（还没有设置时备份成空文件，恢复时删除设置，游戏会用默认设置） */
export async function backupOptions(gamePath: string): Promise<void> {
  const current = (await readOptions(join(gamePath, OPTIONS))) ?? ''
  await writeAtomic(join(gamePath, BACKUP), current)
}

/** 修改设置：先备份再写入 */
export async function writeOptionsWithBackup(gamePath: string, text: string): Promise<void> {
  await backupOptions(gamePath)
  await writeAtomic(join(gamePath, OPTIONS), text)
}

/** 这个版本的游戏设置：有没有 options.txt、上次修改前的备份，以及可以从哪些版本复制设置 */
export async function getGameOptionsInfo(versionId: string): Promise<GameOptionsInfo> {
  const target = await targetOf(versionId)
  const backup = await stat(join(target.gamePath, BACKUP)).catch(() => null)
  const { gameDir } = await getSettings()
  const sources: GameOptionsInfo['sources'] = []
  const seen = new Set<string>([resolve(target.gamePath)])
  for (const v of await listInstalledVersions()) {
    if (v.id === versionId) continue
    const path = resolve(versionGameDir(gameDir, v.id, v.isolated))
    // 共用同一个游戏目录的版本本来就是同一份设置
    if (seen.has(path)) continue
    if (!existsSync(join(path, OPTIONS))) continue
    seen.add(path)
    sources.push({ id: v.id, minecraftVersion: v.minecraftVersion, isolated: v.isolated })
  }
  const text = await readOptions(target.file)
  const lines = text === null ? null : splitLines(text).lines
  const supported = !!lines && presetSupported(lines, target.minecraftVersion)
  return {
    hasOptions: existsSync(target.file),
    backupAt: backup?.isFile() ? backup.mtimeMs : null,
    minecraftVersion: target.minecraftVersion,
    sources,
    videoPresetSupported: supported,
    videoPreset: supported && lines ? currentPreset(lines, target.minecraftVersion) : null
  }
}

/**
 * 从另一个版本复制游戏设置。
 * all：复制整个 options.txt（游戏会把旧版本的设置自动转换成新格式）；从 1.13 以后的版本复制到更早的版本时
 * 按键格式不同，保留目标版本原来的按键。
 * keys：只复制按键（key_ 开头的行），其他设置不变；1.13 前后的按键格式不同，不能只复制按键
 */
export async function copyGameOptions(
  fromVersionId: string,
  toVersionId: string,
  mode: OptionsCopyMode
): Promise<OptionsCopyResult> {
  if (mode !== 'all' && mode !== 'keys') throw new Error('无效的复制方式')
  if (fromVersionId === toVersionId) throw new Error('请选择另一个版本')
  const source = await targetOf(fromVersionId)
  const target = await targetOf(toVersionId)
  if (resolve(source.gamePath) === resolve(target.gamePath)) {
    throw new Error('这两个版本使用同一个游戏目录，设置本来就是同一份')
  }
  await assertNotRunning(toVersionId, target.gamePath)
  const sourceText = await readOptions(source.file)
  if (sourceText === null) throw new Error(`「${fromVersionId}」还没有游戏设置（还没有启动过）`)
  const from = splitLines(sourceText)
  const current = await readOptions(target.file)
  const to = splitLines(current ?? '')
  const sourceNamed = usesNamedKeys(source.minecraftVersion)
  const targetNamed = usesNamedKeys(target.minecraftVersion)

  let lines: string[]
  let keptKeys = false
  if (mode === 'keys') {
    if (sourceNamed !== targetNamed) {
      throw new Error('1.13 前后的按键保存格式不同，不能只复制按键，请选择「全部设置」')
    }
    const keys = from.lines.filter(isKeyLine)
    if (keys.length === 0) throw new Error(`「${fromVersionId}」的设置里没有按键`)
    lines = [...to.lines.filter((l) => !isKeyLine(l)), ...keys]
    // 目标版本还没有设置时带上数据版本号，游戏按正确的格式读取
    if (!lines.some((l) => l.startsWith('version:'))) {
      const version = from.lines.find((l) => l.startsWith('version:'))
      if (version) lines.unshift(version)
    }
  } else if (sourceNamed && !targetNamed) {
    // 新版本的按键名字旧版本读不懂：保留目标版本原来的按键
    lines = [...from.lines.filter((l) => !isKeyLine(l)), ...to.lines.filter(isKeyLine)]
    keptKeys = true
  } else {
    lines = from.lines
  }
  await writeOptionsWithBackup(target.gamePath, lines.join(from.eol) + from.eol)
  return { keptKeys }
}

/** 恢复上次修改前的设置 */
export async function restoreGameOptions(versionId: string): Promise<void> {
  const target = await targetOf(versionId)
  await assertNotRunning(versionId, target.gamePath)
  const backupFile = join(target.gamePath, BACKUP)
  const backup = await readOptions(backupFile)
  if (backup === null) throw new Error('没有可以恢复的设置备份')
  if (backup === '') {
    // 修改前还没有设置：删除，游戏会用默认设置
    await rm(target.file, { force: true })
    await rm(backupFile, { force: true })
  } else {
    await rename(backupFile, target.file)
  }
}

/** 快照对应的正式版（只用到 1.7 以后），按开始的周数判断 */
const SNAPSHOT_MINORS: [number, number][] = [
  [2409, 21],
  [2312, 20],
  [2211, 19],
  [2137, 18],
  [2045, 17],
  [2006, 16],
  [1934, 15],
  [1843, 14],
  [1743, 13],
  [1706, 12],
  [1632, 11],
  [1620, 10],
  [1531, 9],
  [1402, 8],
  [1336, 7]
]

/** 1.x 的 x；快照按对应的正式版；新的版本号格式（例如 26.1）当作最新；认不出时为 null */
export function minecraftMinor(minecraftVersion: string): number | null {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1])
  const snapshot = /^(\d{2})w(\d{2})/.exec(minecraftVersion)
  if (snapshot) {
    const week = Number(snapshot[1]) * 100 + Number(snapshot[2])
    return SNAPSHOT_MINORS.find(([start]) => week >= start)?.[1] ?? null
  }
  if (/^\d{2}\.\d/.test(minecraftVersion)) return 100
  return null
}

interface PresetSpec {
  renderDistance: number
  simulationDistance: number
  fancy: boolean
  /** 0 全部、1 减少、2 最少 */
  particles: number
  entityShadows: boolean
  biomeBlendRadius: number
  mipmapLevels: number
  ao: boolean
}

const PRESETS: Record<VideoPreset, PresetSpec> = {
  smooth: {
    renderDistance: 6,
    simulationDistance: 5,
    fancy: false,
    particles: 1,
    entityShadows: false,
    biomeBlendRadius: 0,
    mipmapLevels: 2,
    ao: false
  },
  balanced: {
    renderDistance: 10,
    simulationDistance: 8,
    fancy: true,
    particles: 0,
    entityShadows: true,
    biomeBlendRadius: 2,
    mipmapLevels: 4,
    ao: true
  },
  high: {
    renderDistance: 16,
    simulationDistance: 12,
    fancy: true,
    particles: 0,
    entityShadows: true,
    biomeBlendRadius: 5,
    mipmapLevels: 4,
    ao: true
  }
}

function valueOf(lines: string[], key: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${key}:`))
  return line === undefined ? undefined : line.slice(key.length + 1)
}

/** 有 renderDistance（1.7 起）的设置才能用画质档位；更早的版本设置项完全不同 */
function presetSupported(lines: string[], minecraftVersion: string): boolean {
  const minor = minecraftMinor(minecraftVersion)
  if (minor !== null && minor < 7) return false
  return valueOf(lines, 'renderDistance') !== undefined
}

/**
 * 某个档位要写入的设置项。写法优先跟随现有的 options.txt（游戏写出的文件包含它认识的全部设置项），
 * 现有文件里没有时按版本判断：图形质量 1.16 起是 graphicsMode（0 流畅、1 高品质），更早是 fancyGraphics；
 * 平滑光照 1.19 起是 true / false，更早是 0（关）/ 2（最大）
 */
function presetEntries(preset: VideoPreset, lines: string[], minecraftVersion: string): [string, string][] {
  const spec = PRESETS[preset]
  const minor = minecraftMinor(minecraftVersion) ?? 100
  const has = (key: string): boolean => valueOf(lines, key) !== undefined
  const entries: [string, string][] = [['renderDistance', String(spec.renderDistance)]]
  if (has('simulationDistance') || minor >= 18) {
    entries.push(['simulationDistance', String(spec.simulationDistance)])
  }
  const graphicsMode = has('graphicsMode') || (!has('fancyGraphics') && minor >= 16)
  entries.push(graphicsMode ? ['graphicsMode', spec.fancy ? '1' : '0'] : ['fancyGraphics', String(spec.fancy)])
  entries.push(['particles', String(spec.particles)])
  if (has('entityShadows') || minor >= 8) entries.push(['entityShadows', String(spec.entityShadows)])
  if (has('biomeBlendRadius') || minor >= 13) entries.push(['biomeBlendRadius', String(spec.biomeBlendRadius)])
  entries.push(['mipmapLevels', String(spec.mipmapLevels)])
  const ao = valueOf(lines, 'ao')
  const boolAo = ao === 'true' || ao === 'false' || (ao === undefined && minor >= 19)
  entries.push(['ao', boolAo ? String(spec.ao) : spec.ao ? '2' : '0'])
  return entries
}

/** 当前设置正好是哪个档位（平滑光照 1 和 2 都算开启） */
function currentPreset(lines: string[], minecraftVersion: string): VideoPreset | null {
  for (const preset of Object.keys(PRESETS) as VideoPreset[]) {
    const matches = presetEntries(preset, lines, minecraftVersion).every(([key, value]) => {
      const current = valueOf(lines, key)
      if (key === 'ao' && current !== undefined && /^[12]$/.test(current)) return value === '2'
      return current === value
    })
    if (matches) return preset
  }
  return null
}

/** 套用画质档位：只改视距、图形质量、粒子、阴影、平滑光照等几项，其他设置不变；修改前自动备份 */
export async function applyVideoPreset(versionId: string, preset: VideoPreset): Promise<void> {
  await writePreset(versionId, preset, [])
}

/** 修复向导：画质改成流畅并关闭游戏内的全屏（显卡驱动、全屏切换出问题时常见），修改前自动备份 */
export async function applySafeVideoSettings(versionId: string): Promise<void> {
  await writePreset(versionId, 'smooth', [['fullscreen', 'false']])
}

async function writePreset(versionId: string, preset: VideoPreset, extra: [string, string][]): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, preset)) throw new Error('无效的画质档位')
  const target = await targetOf(versionId)
  await assertNotRunning(versionId, target.gamePath)
  const text = await readOptions(target.file)
  // 还没有设置时不创建：整合包的默认设置模组、「新版本默认简体中文」都要在没有 options.txt 时才生效
  if (text === null) throw new Error('这个版本还没有游戏设置，请先启动一次游戏')
  const { lines, eol } = splitLines(text)
  if (!presetSupported(lines, target.minecraftVersion)) throw new Error('这个版本太旧，不支持画质档位')
  const next = [...lines]
  for (const [key, value] of [...presetEntries(preset, lines, target.minecraftVersion), ...extra]) {
    const index = next.findIndex((l) => l.startsWith(`${key}:`))
    if (index >= 0) next[index] = `${key}:${value}`
    else next.push(`${key}:${value}`)
  }
  await writeOptionsWithBackup(target.gamePath, next.join(eol) + eol)
}

// ---------- 按键冲突 ----------

/** 常用操作的中文名（模组的按键显示原来的名字） */
const ACTION_NAMES: Record<string, string> = {
  'key.attack': '攻击 / 破坏',
  'key.use': '使用物品 / 放置方块',
  'key.forward': '向前走',
  'key.back': '向后走',
  'key.left': '向左走',
  'key.right': '向右走',
  'key.jump': '跳跃',
  'key.sneak': '潜行',
  'key.sprint': '疾跑',
  'key.drop': '丢弃物品',
  'key.inventory': '打开 / 关闭物品栏',
  'key.chat': '打开聊天栏',
  'key.playerlist': '玩家列表',
  'key.pickItem': '选取方块',
  'key.command': '输入命令',
  'key.socialInteractions': '社交屏幕',
  'key.screenshot': '截图',
  'key.togglePerspective': '切换视角',
  'key.smoothCamera': '电影视角',
  'key.fullscreen': '全屏',
  'key.spectatorOutlines': '高亮玩家（旁观者）',
  'key.swapOffhand': '与副手交换物品',
  'key.saveToolbarActivator': '保存快捷栏',
  'key.loadToolbarActivator': '加载快捷栏',
  'key.advancements': '进度'
}

function actionName(id: string): string {
  const hotbar = /^key\.hotbar\.(\d)$/.exec(id)
  if (hotbar) return `快捷栏 ${hotbar[1]}`
  return ACTION_NAMES[id] ?? id
}

/** 按键的显示名：key.keyboard.space → Space，key.mouse.left → 鼠标左键；旧版本是数字键码 */
function keyLabel(value: string): string {
  const [key, modifier] = value.split(':')
  let label: string
  const mouse = /^key\.mouse\.(.+)$/.exec(key)
  if (mouse) {
    label = { left: '鼠标左键', right: '鼠标右键', middle: '鼠标中键' }[mouse[1]] ?? `鼠标按键 ${mouse[1]}`
  } else if (/^key\.keyboard\./.test(key)) {
    label = key
      .slice('key.keyboard.'.length)
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  } else if (/^-?\d+$/.test(key)) {
    label = Number(key) < 0 ? `鼠标按键 ${Number(key) + 101}` : `键码 ${key}`
  } else {
    label = key
  }
  // Forge 的组合键写在后面（例如 key.keyboard.k:SHIFT）
  return modifier && modifier !== 'NONE' ? `${modifier.charAt(0)}${modifier.slice(1).toLowerCase()} + ${label}` : label
}

/** 没有绑定的按键 */
const isUnbound = (value: string): boolean => value === 'key.keyboard.unknown' || value === '0' || value === ''

/** 绑在同一个键上的操作 */
export async function getKeyConflicts(versionId: string): Promise<KeyConflict[]> {
  const target = await targetOf(versionId)
  const text = await readOptions(target.file)
  if (text === null) return []
  const groups = new Map<string, string[]>()
  for (const line of splitLines(text).lines) {
    const m = /^key_([^:]+):(.*)$/.exec(line)
    if (!m || isUnbound(m[2])) continue
    // 按完整的值比较（Forge 的组合键带修饰键，例如 key.keyboard.k:SHIFT 和 key.keyboard.k 不冲突）
    const list = groups.get(m[2]) ?? []
    list.push(m[1])
    groups.set(m[2], list)
  }
  return [...groups.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([key, actions]) => ({
      key,
      label: keyLabel(key),
      actions: actions.map((id) => ({ id, name: actionName(id) }))
    }))
}

async function editKeyLines(versionId: string, edit: (lines: string[], named: boolean) => string[]): Promise<void> {
  const target = await targetOf(versionId)
  await assertNotRunning(versionId, target.gamePath)
  const text = await readOptions(target.file)
  if (text === null) throw new Error('这个版本还没有游戏设置')
  const { lines, eol } = splitLines(text)
  const next = edit(lines, usesNamedKeys(target.minecraftVersion))
  await writeOptionsWithBackup(target.gamePath, next.join(eol) + eol)
}

/** 解除某个操作的按键绑定 */
export async function unbindKey(versionId: string, action: string): Promise<void> {
  if (typeof action !== 'string' || !/^[\w.:-]{1,200}$/.test(action)) throw new Error('无效的操作')
  await editKeyLines(versionId, (lines, named) => {
    const index = lines.findIndex((l) => l.startsWith(`key_${action}:`))
    if (index < 0) throw new Error('找不到这个操作的按键设置')
    lines[index] = `key_${action}:${named ? 'key.keyboard.unknown' : '0'}`
    return lines
  })
}

/** 全部按键恢复默认：删掉所有按键设置，下次进入游戏时游戏（和模组）会写回默认键位 */
export async function resetKeyBindings(versionId: string): Promise<void> {
  await editKeyLines(versionId, (lines) => lines.filter((l) => !l.startsWith('key_')))
}
