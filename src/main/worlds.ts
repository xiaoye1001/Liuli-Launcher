import { BrowserWindow, dialog, shell } from 'electron'
import { open, openEntryReadStream, readAllEntries } from '@xmcl/unzip'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { createHash, randomUUID } from 'crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { getSettings } from './config'
import { getGameStatus } from './launch'
import { modsContextOf } from './mods'
import { parseNbt, type NbtCompound } from './nbt'
import { readPackMeta } from './resources'
import { zipDirectory } from './zipWriter'
import type {
  WorldBackup,
  WorldDatapack,
  WorldDetails,
  WorldDifficulty,
  WorldGameMode,
  WorldInfo,
  WorldList,
  WorldStats
} from '../shared/types'

const GAME_MODES: WorldGameMode[] = ['survival', 'creative', 'adventure', 'spectator']
const MAX_ICON_BYTES = 256 * 1024
/** 导入存档时解压后的总大小上限 */
const MAX_WORLD_BYTES = 64 * 1024 * 1024 * 1024

/** 版本使用的游戏目录（考虑版本隔离） */
async function gameDirOf(versionId: string): Promise<string> {
  return dirname((await modsContextOf(versionId)).dir)
}

/**
 * 游戏运行时不能改动它正在使用的存档。没有开启版本隔离的版本共用同一个 saves 文件夹，
 * 所以比较的是游戏目录，而不只是版本名
 */
async function assertGameStopped(versionId: string): Promise<void> {
  const game = getGameStatus()
  if (!(game.state === 'launching' || game.state === 'running') || !game.versionId) return
  if (game.versionId === versionId) throw new Error('游戏正在运行，请退出游戏后再操作存档')
  const [running, target] = await Promise.all([
    gameDirOf(game.versionId).catch(() => ''),
    gameDirOf(versionId).catch(() => '')
  ])
  if (running && target && resolve(running).toLowerCase() === resolve(target).toLowerCase()) {
    throw new Error(`游戏（${game.versionId}）正在使用同一个存档文件夹，请退出游戏后再操作存档`)
  }
}

/** 存档文件夹名、数据包文件名只能是普通名字，防止通过 ../ 访问其他文件 */
function assertSafeName(name: string, what: string): void {
  if (!name || name !== basename(name) || name === '.' || name === '..') throw new Error(`无效的${what}：${name}`)
}

async function worldDir(versionId: string, folder: string): Promise<string> {
  assertSafeName(folder, '存档名')
  const dir = join(await gameDirOf(versionId), 'saves', folder)
  if (!(await stat(join(dir, 'level.dat')).catch(() => null))) throw new Error(`找不到存档：${folder}`)
  return dir
}

async function readLevel(dir: string): Promise<NbtCompound | null> {
  try {
    // level.dat 通常只有几 KB，过大的文件不读进内存
    if (((await stat(join(dir, 'level.dat')).catch(() => null))?.size ?? 0) > 32 * 1024 * 1024) return null
    const root = parseNbt(await readFile(join(dir, 'level.dat')))
    const data = root.Data
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as NbtCompound) : null
  } catch {
    return null
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 列出版本的所有存档（按最后游玩时间排序） */
export async function listWorldInfos(versionId: string): Promise<WorldList> {
  const dir = join(await gameDirOf(versionId), 'saves')
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const worlds: WorldInfo[] = []
  for (const entry of entries) {
    // 点开头的是启动器的临时文件夹（例如还原备份时的 .liuli-restore-xxx），不是存档
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    const levelStat = await stat(join(path, 'level.dat')).catch(() => null)
    if (!levelStat) continue
    const data = await readLevel(path)
    const version = data?.Version as NbtCompound | undefined
    const gameType = typeof data?.GameType === 'number' ? data.GameType : -1
    let icon: string | undefined
    const iconSize = (await stat(join(path, 'icon.png')).catch(() => null))?.size ?? 0
    const iconData =
      iconSize > 0 && iconSize <= MAX_ICON_BYTES ? await readFile(join(path, 'icon.png')).catch(() => null) : null
    if (iconData && iconData.length <= MAX_ICON_BYTES) icon = `data:image/png;base64,${iconData.toString('base64')}`
    worlds.push({
      folder: entry.name,
      name: str(data?.LevelName) || entry.name,
      gameMode: GAME_MODES[gameType] ?? 'unknown',
      hardcore: data?.hardcore === 1,
      cheats: data?.allowCommands === 1,
      version: str(version?.Name),
      // 旧存档没有 LastPlayed 时用 level.dat 的修改时间
      lastPlayed: typeof data?.LastPlayed === 'number' && data.LastPlayed > 0 ? data.LastPlayed : levelStat.mtimeMs,
      icon,
      damaged: !data
    })
  }
  worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
  return { versionId, dir, worlds }
}

const DIFFICULTIES: WorldDifficulty[] = ['peaceful', 'easy', 'normal', 'hard']
/** 旧版本（1.16 之前）的世界类型名 */
const LEGACY_WORLD_TYPES: Record<string, string> = {
  default: 'normal',
  default_1_1: 'normal',
  flat: 'flat',
  largebiomes: 'large_biomes',
  amplified: 'amplified',
  debug_all_block_states: 'debug',
  customized: 'custom'
}

function compound(value: unknown): NbtCompound | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NbtCompound) : undefined
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return undefined
}

/** 世界类型：1.16 起在 WorldGenSettings 的主世界生成器里，之前是 generatorName */
function worldTypeOf(data: NbtCompound): string | undefined {
  const legacy = str(data.generatorName).toLowerCase()
  if (legacy) return LEGACY_WORLD_TYPES[legacy] ?? legacy
  const generator = compound(
    compound(compound(compound(data.WorldGenSettings)?.dimensions)?.['minecraft:overworld'])?.generator
  )
  if (!generator) return undefined
  const type = str(generator.type).replace(/^minecraft:/, '')
  if (type === 'flat') return 'flat'
  if (type === 'debug') return 'debug'
  if (type === 'noise') {
    const biomeSource = compound(generator.biome_source)
    if (str(biomeSource?.type).replace(/^minecraft:/, '') === 'fixed') return 'single_biome'
    const settings = typeof generator.settings === 'string' ? generator.settings.replace(/^minecraft:/, '') : 'custom'
    return settings === 'overworld' ? 'normal' : settings
  }
  return type || undefined
}

/** 游戏规则：新版本的值是字符串，个别版本是数字或字节 */
function gameRulesOf(data: NbtCompound): { key: string; value: string }[] {
  const rules = compound(data.GameRules) ?? compound(data.game_rules) ?? {}
  return Object.entries(rules).map(([key, value]) => ({
    key,
    value:
      typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : ''
  }))
}

/** 维度名：旧版本是数字 */
function dimensionName(value: unknown): string {
  if (typeof value === 'string') return value.replace(/^minecraft:/, '')
  if (value === -1) return 'the_nether'
  if (value === 1) return 'the_end'
  return 'overworld'
}

/** 文件夹占用的空间 */
async function folderSize(dir: string): Promise<number> {
  let total = 0
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile()) continue
    total +=
      (await stat(join(entry.parentPath ?? (entry as { path?: string }).path ?? dir, entry.name)).catch(() => null))
        ?.size ?? 0
  }
  return total
}

/** 读取存档详情：种子、难度、世界类型、时间、天气、出生点、玩家位置、游戏规则等 */
export async function getWorldDetails(versionId: string, folder: string): Promise<WorldDetails> {
  const dir = await worldDir(versionId, folder)
  let root: NbtCompound
  try {
    root = parseNbt(await readFile(join(dir, 'level.dat')), { exactLongs: true })
  } catch {
    throw new Error('level.dat 无法读取，存档可能已损坏')
  }
  const data = compound(root.Data)
  if (!data) throw new Error('level.dat 无法读取，存档可能已损坏')

  const seed = compound(data.WorldGenSettings)?.seed ?? data.RandomSeed
  // 较新的版本把难度放进 difficulty_settings
  const difficultySettings = compound(data.difficulty_settings)
  const difficultyValue = difficultySettings?.difficulty ?? data.Difficulty
  const difficulty =
    typeof difficultyValue === 'string'
      ? DIFFICULTIES.find((d) => d === difficultyValue.replace(/^minecraft:/, ''))
      : DIFFICULTIES[num(difficultyValue) ?? -1]
  const dayTime = num(data.DayTime) ?? num(data.Time)
  let timeOfDay: string | undefined
  if (dayTime !== undefined) {
    // 第 0 刻是早上 6 点，1000 刻为 1 小时
    const ticks = ((dayTime % 24000) + 24000) % 24000
    const minutes = Math.floor(((ticks / 1000 + 6) % 24) * 60)
    timeOfDay = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }

  // 出生点：旧格式 SpawnX/Y/Z，较新的版本为 spawn.pos
  let spawn: WorldDetails['spawn']
  const spawnPos = compound(data.spawn)?.pos
  if (Array.isArray(spawnPos) && spawnPos.length >= 3) {
    spawn = { x: Number(spawnPos[0]), y: Number(spawnPos[1]), z: Number(spawnPos[2]) }
  } else if (num(data.SpawnX) !== undefined) {
    spawn = { x: num(data.SpawnX)!, y: num(data.SpawnY) ?? 0, z: num(data.SpawnZ)! }
  }

  let player: WorldDetails['player']
  const playerData = compound(data.Player)
  const pos = playerData?.Pos
  if (playerData && Array.isArray(pos) && pos.length >= 3) {
    player = {
      x: Math.floor(Number(pos[0])),
      y: Math.floor(Number(pos[1])),
      z: Math.floor(Number(pos[2])),
      dimension: dimensionName(playerData.Dimension),
      health: num(playerData.Health),
      food: num(playerData.foodLevel),
      level: num(playerData.XpLevel)
    }
  }

  const enabledPacks = compound(data.DataPacks)?.Enabled
  const stats = await worldStatsOf(dir)
  return {
    ...(stats ? { stats } : {}),
    folder,
    seed:
      typeof seed === 'bigint' || (typeof seed === 'number' && Number.isInteger(seed))
        ? BigInt(seed).toString()
        : undefined,
    difficulty,
    difficultyLocked: (difficultySettings?.locked ?? data.DifficultyLocked) === 1,
    worldType: worldTypeOf(data),
    day: dayTime !== undefined ? Math.floor(dayTime / 24000) + 1 : undefined,
    timeOfDay,
    weather: data.thundering === 1 ? 'thunder' : data.raining === 1 ? 'rain' : 'clear',
    spawn,
    player,
    gameRules: gameRulesOf(data),
    size: await folderSize(dir),
    // 只算存档 datapacks 文件夹里的（file/ 开头），不算原版和模组自带的
    datapacks: Array.isArray(enabledPacks)
      ? enabledPacks.filter((p) => typeof p === 'string' && p.startsWith('file/')).length
      : 0
  }
}

/** 统计里的一个数（不是正常的数时当作 0） */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function sumValues(map: unknown): number {
  if (!map || typeof map !== 'object') return 0
  return Object.values(map as Record<string, unknown>).reduce<number>((sum, v) => sum + count(v), 0)
}

/** 把一个玩家的统计加进合计：1.13 起是分类的格式，更早的版本是 stat.xxx 平铺的格式 */
function addStats(total: WorldStats, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const json = raw as Record<string, unknown>
  const groups = json.stats
  if (groups && typeof groups === 'object') {
    const g = groups as Record<string, unknown>
    const custom = (g['minecraft:custom'] ?? {}) as Record<string, unknown>
    const mined = (g['minecraft:mined'] ?? {}) as Record<string, unknown>
    // 1.17 把 play_one_minute 改名为 play_time（单位都是游戏刻）
    total.playTicks += count(custom['minecraft:play_time'] ?? custom['minecraft:play_one_minute'])
    total.deaths += count(custom['minecraft:deaths'])
    total.mobKills += count(custom['minecraft:mob_kills'])
    total.jumps += count(custom['minecraft:jump'])
    total.walkCm +=
      count(custom['minecraft:walk_one_cm']) +
      count(custom['minecraft:sprint_one_cm']) +
      count(custom['minecraft:crouch_one_cm'])
    total.mined += sumValues(mined)
    total.diamonds += count(mined['minecraft:diamond_ore']) + count(mined['minecraft:deepslate_diamond_ore'])
    return
  }
  total.playTicks += count(json['stat.playOneMinute'])
  total.deaths += count(json['stat.deaths'])
  total.mobKills += count(json['stat.mobKills'])
  total.jumps += count(json['stat.jump'])
  total.walkCm += count(json['stat.walkOneCm']) + count(json['stat.sprintOneCm']) + count(json['stat.crouchOneCm'])
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith('stat.mineBlock.')) total.mined += count(value)
  }
  total.diamonds += count(json['stat.mineBlock.minecraft.diamond_ore'])
}

/** 存档里所有玩家的游戏统计加起来（stats/<UUID>.json）；没有统计文件时返回 undefined */
async function worldStatsOf(dir: string): Promise<WorldStats | undefined> {
  const statsDir = join(dir, 'stats')
  const files = (await readdir(statsDir).catch(() => [] as string[]))
    .filter((name) => /^[0-9a-f-]{32,36}\.json$/i.test(name))
    .slice(0, 100)
  const total: WorldStats = { playTicks: 0, deaths: 0, mobKills: 0, mined: 0, diamonds: 0, walkCm: 0, jumps: 0 }
  let found = false
  for (const name of files) {
    const path = join(statsDir, name)
    try {
      // 正常的统计文件只有几十 KB
      if ((await stat(path)).size > 8 * 1024 * 1024) continue
      addStats(total, JSON.parse(await readFile(path, 'utf-8')))
      found = true
    } catch {
      // 文件损坏：跳过
    }
  }
  return found ? total : undefined
}

/** 这个版本的游戏目录里所有存档一共挖了多少钻石矿（成就用，最多看 50 个存档） */
export async function totalDiamonds(versionId: string): Promise<number> {
  const saves = join(await gameDirOf(versionId), 'saves')
  const entries = (await readdir(saves, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .slice(0, 50)
  let total = 0
  for (const entry of entries) total += (await worldStatsOf(join(saves, entry.name)))?.diamonds ?? 0
  return total
}

/** 删除存档：移到系统回收站 */
export async function deleteWorld(versionId: string, folder: string): Promise<void> {
  await assertGameStopped(versionId)
  await shell.trashItem(await worldDir(versionId, folder))
}

function timestamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/** 备份位置里每个游戏目录（或隔离的版本）一个文件夹：文件夹名 + 路径哈希，名字相同的不会混在一起 */
export function backupFolderName(root: string): string {
  const full = resolve(root)
  const hash = createHash('sha256')
    .update(process.platform === 'win32' ? full.toLowerCase() : full)
    .digest('hex')
    .slice(0, 8)
  // .minecraft 去掉开头的点，不变成隐藏文件夹
  const name = basename(full).replace(/^\.+/, '') || 'minecraft'
  return `${name}-${hash}`
}

/** 存档备份放在哪：默认是游戏目录里的 backups；设置了备份位置时放在「备份位置/游戏目录名-哈希」 */
export async function backupsDirFor(root: string): Promise<string> {
  const { backupDir } = await getSettings()
  if (!backupDir || !isAbsolute(backupDir)) return join(root, 'backups')
  return join(backupDir, backupFolderName(root))
}

/** 查看、还原备份时两个位置都看：当前的备份位置，以及默认位置（更改备份位置之前的备份） */
async function backupDirsFor(root: string): Promise<string[]> {
  const current = await backupsDirFor(root)
  const fallback = join(root, 'backups')
  return resolve(current) === resolve(fallback) ? [current] : [current, fallback]
}

/** 备份文件不能放在被打包的存档文件夹里（否则会把正在写入的备份也打包进去） */
function assertOutsideWorld(backups: string, worldPath: string): void {
  const rel = relative(resolve(worldPath), resolve(backups))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error('备份位置不能在存档文件夹里面，请在设置里更改备份位置')
  }
}

/** 备份存档：打包成 zip 放在备份位置（默认是游戏目录的 backups 文件夹），返回 zip 路径与大小 */
export async function backupWorld(versionId: string, folder: string): Promise<{ path: string; size: number }> {
  await assertGameStopped(versionId)
  const dir = await worldDir(versionId, folder)
  const backups = await backupsDirFor(await gameDirOf(versionId))
  assertOutsideWorld(backups, dir)
  await mkdir(backups, { recursive: true })
  const stamp = timestamp()
  let path = join(backups, `${folder}_${stamp}.zip`)
  // 同一秒内备份两次时加上序号，避免覆盖
  for (let i = 2; await stat(path).catch(() => null); i++) path = join(backups, `${folder}_${stamp} (${i}).zip`)
  // session.lock 是游戏运行时的锁文件，不需要备份
  const { size } = await zipDirectory(dir, path, folder, (rel) => rel === 'session.lock')
  return { path, size }
}

/** 每个存档最多保留几份自动备份（手动备份不受影响） */
const AUTO_KEEP = 3
/** 太大的存档不自动备份（打包很慢、占空间），需要时手动备份 */
const AUTO_MAX_BYTES = 4 * 1024 * 1024 * 1024

/** 删掉这个存档较早的自动备份，只留最近 AUTO_KEEP 份 */
async function pruneAutoBackups(backups: string, world: string): Promise<void> {
  const autos = (await readdir(backups).catch(() => [] as string[]))
    .map((file) => ({ file, parsed: parseBackupName(file) }))
    .filter((b) => b.parsed?.auto && b.parsed.world === world)
    .sort((a, b) => b.parsed!.createdAt - a.parsed!.createdAt)
  for (const old of autos.slice(AUTO_KEEP)) await rm(join(backups, old.file), { force: true }).catch(() => undefined)
}

/**
 * 退出游戏后自动备份这次玩过的存档（level.dat 在游戏启动之后保存过）：文件名带「(自动)」，
 * 每个存档只保留最近 3 份自动备份；prune 为 false 时不删旧的（例如游戏崩溃后，保留之前的备份）。
 * 又开始游戏时停止。返回备份了的存档文件夹名
 */
export async function autoBackupWorlds(
  versionId: string,
  since: number,
  prune: boolean
): Promise<{ done: string[]; failed: string[] }> {
  const root = await gameDirOf(versionId)
  const backups = await backupsDirFor(root)
  const done: string[] = []
  const failed: string[] = []
  await removeStaleTemp(backups)
  for (const entry of await readdir(join(root, 'saves'), { withFileTypes: true }).catch(() => [])) {
    // 以 . 开头的是还原、删除存档时的临时文件夹
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const game = getGameStatus()
    if (game.state === 'launching' || game.state === 'running') break
    const dir = join(root, 'saves', entry.name)
    const level = await stat(join(dir, 'level.dat')).catch(() => null)
    if (!level || level.mtimeMs < since) continue
    // 一个存档备份失败（文件被占用、文件太多等）不影响其他存档
    try {
      assertOutsideWorld(backups, dir)
      if ((await folderSize(dir)) > AUTO_MAX_BYTES) continue
      await mkdir(backups, { recursive: true })
      const stamp = timestamp()
      let path = join(backups, `${entry.name}_${stamp} (自动).zip`)
      for (let i = 2; await stat(path).catch(() => null); i++)
        path = join(backups, `${entry.name}_${stamp} (${i}) (自动).zip`)
      await zipDirectory(dir, path, entry.name, (rel) => rel === 'session.lock')
      // 打包的时候又启动了同一个游戏目录的游戏：存档可能正在被写入，这份备份不可靠，删掉并停止
      if (await gameStartedIn(root)) {
        await rm(path, { force: true }).catch(() => undefined)
        break
      }
      done.push(entry.name)
      if (prune) await pruneAutoBackups(backups, entry.name)
    } catch {
      failed.push(entry.name)
    }
  }
  return { done, failed }
}

/** 有没有游戏正在启动或运行，并且用的是这个游戏目录 */
async function gameStartedIn(root: string): Promise<boolean> {
  const game = getGameStatus()
  if (!(game.state === 'launching' || game.state === 'running') || !game.versionId) return false
  const running = await gameDirOf(game.versionId).catch(() => '')
  return !!running && resolve(running).toLowerCase() === resolve(root).toLowerCase()
}

/** 打包到一半被中断（例如备份时关闭了启动器）留下的 .zip.tmp：一小时前的删掉 */
async function removeStaleTemp(backups: string): Promise<void> {
  for (const name of await readdir(backups).catch(() => [] as string[])) {
    if (!name.endsWith('.zip.tmp')) continue
    const path = join(backups, name)
    const info = await stat(path).catch(() => null)
    if (info?.isFile() && Date.now() - info.mtimeMs > 60 * 60 * 1000)
      await rm(path, { force: true }).catch(() => undefined)
  }
}

/** 打开存档文件夹（folder 为空时打开 saves） */
export async function openWorldDir(versionId: string, folder?: string): Promise<void> {
  const dir = folder ? await worldDir(versionId, folder) : join(await gameDirOf(versionId), 'saves')
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

export async function openBackupsDir(versionId: string): Promise<void> {
  const dir = await backupsDirFor(await gameDirOf(versionId))
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

/** zip 里的路径必须在存档文件夹内部 */
function safeJoin(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-zA-Z]:/.test(path) ||
    // 冒号会在 Windows 上写进别的文件的数据流；控制字符不是正常的文件名
    /[:\u0000-\u001f]/.test(path) ||
    path.split(/[\\/]/).includes('..') ||
    rel.startsWith('..')
  ) {
    throw new Error(`存档压缩包中包含不安全的文件路径：${path}`)
  }
  return target
}

/** 不能用作文件夹名的字符换成下划线 */
function folderName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  return clean && clean !== '.' && clean !== '..' ? clean.slice(0, 80) : 'world'
}

/** 从 zip 导入存档（zip 里可以直接是存档内容，也可以多一层文件夹），返回导入后的文件夹名 */
export async function importWorld(versionId: string, win: BrowserWindow | null): Promise<string | null> {
  await assertGameStopped(versionId)
  const options: Electron.OpenDialogOptions = {
    title: `导入存档到 ${versionId}`,
    filters: [{ name: '存档压缩包', extensions: ['zip'] }],
    properties: ['openFile']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return importWorldFile(versionId, result.filePaths[0])
}

/**
 * 打开存档压缩包，找到存档根目录（最浅的 level.dat 所在的文件夹），交给 fn 处理。
 * extract 会先检查所有路径再解压，失败时删除解压了一半的文件夹。
 */
async function withWorldZip<T>(
  file: string,
  fn: (zip: { prefix: string; extract: (target: string) => Promise<void> }) => Promise<T>
): Promise<T> {
  const zip = await open(file).catch(() => {
    throw new Error('无法打开压缩包，请确认是 zip 格式的存档')
  })
  try {
    const entries = await readAllEntries(zip).catch((e: Error) => {
      // 解压库会拒绝 ../ 之类的路径，这里换成中文提示
      if (/invalid (relative )?path|absolute path/i.test(e.message)) {
        throw new Error('存档压缩包中包含不安全的文件路径，已拒绝导入')
      }
      throw e
    })
    const level = entries
      .filter((e) => e.fileName === 'level.dat' || e.fileName.endsWith('/level.dat'))
      .sort((a, b) => a.fileName.split('/').length - b.fileName.split('/').length)[0]
    if (!level) throw new Error('压缩包里没有找到存档（缺少 level.dat）')
    const prefix = level.fileName.slice(0, -'level.dat'.length)
    const extract = async (target: string): Promise<void> => {
      const files = entries.filter((e) => e.fileName.startsWith(prefix) && !e.fileName.endsWith('/'))
      const targets = files.map((e) => safeJoin(target, e.fileName.slice(prefix.length)))
      // 解压后的总大小有上限，防止压缩炸弹把硬盘写满
      const total = files.reduce((sum, e) => sum + e.uncompressedSize, 0)
      if (total > MAX_WORLD_BYTES) throw new Error('存档压缩包解压后太大（超过 64 GB），已拒绝导入')
      await mkdir(target, { recursive: true })
      try {
        for (let i = 0; i < files.length; i++) {
          await mkdir(dirname(targets[i]), { recursive: true })
          // 逐个文件流式写入，不把整个文件读进内存
          await pipeline(await openEntryReadStream(zip, files[i]), createWriteStream(targets[i]))
        }
      } catch (e) {
        await rm(target, { recursive: true, force: true })
        throw e
      }
    }
    return await fn({ prefix, extract })
  } finally {
    zip.close()
  }
}

export async function importWorldFile(versionId: string, file: string): Promise<string> {
  await assertGameStopped(versionId)
  return withWorldZip(file, async ({ prefix, extract }) => {
    const saves = join(await gameDirOf(versionId), 'saves')
    const base = folderName(prefix ? basename(prefix.replace(/\/$/, '')) : basename(file).replace(/\.zip$/i, ''))
    let folder = base
    for (let i = 2; await stat(join(saves, folder)).catch(() => null); i++) folder = `${base} (${i})`
    await extract(join(saves, folder))
    return folder
  })
}

// ---------- 备份还原 ----------

/** 备份文件名：<存档文件夹>_<年-月-日_时-分-秒>[ (序号)].zip */
/** 备份文件名：存档名_时间（同一秒内的第二份带序号），自动备份后面多了「(自动)」 */
const BACKUP_NAME = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?: \(\d+\))?( \(自动\))?\.zip$/i

function parseBackupName(file: string): { world: string; createdAt: number; auto: boolean } | null {
  const m = BACKUP_NAME.exec(file)
  if (!m) return null
  const [, world, y, mo, d, h, mi, sec, auto] = m
  return { world, createdAt: new Date(+y, +mo - 1, +d, +h, +mi, +sec).getTime(), auto: !!auto }
}

async function backupFile(versionId: string, file: string): Promise<string> {
  assertSafeName(file, '备份文件名')
  if (!/\.zip$/i.test(file)) throw new Error(`不是备份文件：${file}`)
  for (const dir of await backupDirsFor(await gameDirOf(versionId))) {
    const path = join(dir, file)
    if ((await stat(path).catch(() => null))?.isFile()) return path
  }
  throw new Error(`找不到备份：${file}`)
}

/** 列出备份文件夹里的存档备份（新的在前） */
export async function listWorldBackups(versionId: string): Promise<WorldBackup[]> {
  const root = await gameDirOf(versionId)
  const backups: WorldBackup[] = []
  // 两个位置有同名的备份时只列出当前备份位置的（还原、删除时也先找当前备份位置）
  const seen = new Set<string>()
  for (const dir of await backupDirsFor(root)) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile() || !/\.zip$/i.test(entry.name) || seen.has(entry.name)) continue
      const info = await stat(join(dir, entry.name)).catch(() => null)
      if (!info) continue
      seen.add(entry.name)
      const parsed = parseBackupName(entry.name)
      const world = parsed?.world ?? entry.name.replace(/\.zip$/i, '')
      backups.push({
        file: entry.name,
        world,
        createdAt: parsed?.createdAt ?? info.mtimeMs,
        auto: parsed?.auto ?? false,
        size: info.size,
        worldExists: !!(await stat(join(root, 'saves', world, 'level.dat')).catch(() => null))
      })
    }
  }
  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 还原备份。asNew 为 true 时还原成一个新存档（不影响现有存档）；
 * 否则覆盖原存档，覆盖前会先把当前存档备份一次，返回这次备份的文件名。
 */
export async function restoreWorldBackup(
  versionId: string,
  file: string,
  asNew: boolean
): Promise<{ folder: string; safetyBackup?: string }> {
  await assertGameStopped(versionId)
  const path = await backupFile(versionId, file)
  if (asNew) return { folder: await importWorldFile(versionId, path) }

  return withWorldZip(path, async ({ prefix, extract }) => {
    const world =
      parseBackupName(file)?.world ??
      folderName(prefix ? basename(prefix.replace(/\/$/, '')) : file.replace(/\.zip$/i, ''))
    assertSafeName(world, '存档名')
    const saves = join(await gameDirOf(versionId), 'saves')
    const target = join(saves, world)
    const id = randomUUID().slice(0, 8)
    // 先解压到临时文件夹，成功后再替换，避免解压失败时原存档已经没了
    const temp = join(saves, `.liuli-restore-${id}`)
    await extract(temp)

    let safetyBackup: string | undefined
    const existing = await stat(target).catch(() => null)
    if (existing) {
      if (await stat(join(target, 'level.dat')).catch(() => null)) {
        try {
          safetyBackup = basename((await backupWorld(versionId, world)).path)
        } catch (e) {
          await rm(temp, { recursive: true, force: true })
          throw new Error(`还原前备份当前存档失败，已取消还原：${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const old = join(saves, `.liuli-old-${id}`)
      try {
        await rename(target, old)
      } catch (e) {
        // 原存档被占用（例如在资源管理器中打开着）：删除临时文件夹，原存档保持不变
        await rm(temp, { recursive: true, force: true })
        throw new Error(`无法替换原存档，可能有文件正在被使用：${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await rename(temp, target)
      } catch (e) {
        await rename(old, target).catch(() => undefined)
        await rm(temp, { recursive: true, force: true })
        throw e
      }
      await rm(old, { recursive: true, force: true })
    } else {
      await rename(temp, target)
    }
    return { folder: world, safetyBackup }
  })
}

/** 删除备份：移到系统回收站 */
export async function deleteWorldBackup(versionId: string, file: string): Promise<void> {
  await shell.trashItem(await backupFile(versionId, file))
}

// ---------- 数据包 ----------

/** 列出存档中的数据包，并根据 level.dat 中的 DataPacks 判断启用状态 */
export async function listWorldDatapacks(versionId: string, folder: string): Promise<WorldDatapack[]> {
  const dir = await worldDir(versionId, folder)
  const packsDir = join(dir, 'datapacks')
  const data = await readLevel(dir)
  const packs = (data?.DataPacks ?? {}) as NbtCompound
  const enabled = Array.isArray(packs.Enabled) ? (packs.Enabled as unknown[]) : []
  const disabled = Array.isArray(packs.Disabled) ? (packs.Disabled as unknown[]) : []
  const result: WorldDatapack[] = []
  for (const entry of await readdir(packsDir, { withFileTypes: true }).catch(() => [])) {
    const isDirectory = entry.isDirectory()
    if (!isDirectory && !(entry.isFile() && entry.name.toLowerCase().endsWith('.zip'))) continue
    const path = join(packsDir, entry.name)
    const id = `file/${entry.name}`
    result.push({
      fileName: entry.name,
      isDirectory,
      size: isDirectory ? 0 : (await stat(path)).size,
      description: (await readPackMeta(path)).description,
      state: disabled.includes(id) ? 'disabled' : enabled.includes(id) ? 'enabled' : 'new'
    })
  }
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh-CN'))
}

export async function deleteWorldDatapack(versionId: string, folder: string, fileName: string): Promise<void> {
  await assertGameStopped(versionId)
  assertSafeName(fileName, '数据包')
  await shell.trashItem(join(await worldDir(versionId, folder), 'datapacks', fileName))
}

export async function addWorldDatapacks(versionId: string, folder: string, win: BrowserWindow | null): Promise<number> {
  await assertGameStopped(versionId)
  const dir = join(await worldDir(versionId, folder), 'datapacks')
  const options: Electron.OpenDialogOptions = {
    title: `添加数据包到存档「${folder}」`,
    filters: [{ name: '数据包', extensions: ['zip'] }],
    properties: ['openFile', 'multiSelections']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return 0
  await mkdir(dir, { recursive: true })
  for (const file of result.filePaths) await copyFile(file, join(dir, basename(file)))
  return result.filePaths.length
}

export async function openWorldDatapacksDir(versionId: string, folder: string): Promise<void> {
  const dir = join(await worldDir(versionId, folder), 'datapacks')
  await mkdir(dir, { recursive: true })
  const error = await shell.openPath(dir)
  if (error) throw new Error(error)
}

/** 选择存档备份位置：不能选游戏目录的 saves 文件夹或某个存档里面（返回选中的路径，取消时返回空字符串） */
export async function pickBackupDir(win: BrowserWindow | null): Promise<string> {
  const { backupDir, gameDir, gameDirs } = await getSettings()
  const options: Electron.OpenDialogOptions = {
    title: '选择存档备份位置',
    defaultPath: backupDir || join(gameDir, 'backups'),
    properties: ['openDirectory', 'createDirectory']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return ''
  const dir = resolve(result.filePaths[0])
  // 游戏目录的 saves 或隔离版本的 versions/<版本>/saves 里面
  for (const root of [gameDir, ...gameDirs.map((entry) => entry.path)]) {
    const rel = relative(resolve(root), dir)
    if (rel.startsWith('..') || isAbsolute(rel)) continue
    const parts = rel.toLowerCase().split(/[\\/]/)
    if (parts[0] === 'saves' || (parts[0] === 'versions' && parts[2] === 'saves')) {
      throw new Error('备份位置不能在存档（saves）文件夹里面')
    }
  }
  return dir
}
