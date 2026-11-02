import { existsSync } from 'fs'
import { readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { getSettings } from './config'
import { getGameStatus, listInstalledVersions } from './launch'
import { versionGameDir } from './isolation'
import { modsContextOf } from './mods'
import type { GameOptionsInfo, OptionsCopyMode, OptionsCopyResult } from '../shared/types'

/**
 * 游戏内设置（options.txt：视频、按键、声音、语言等）的小工具：从其他版本复制设置。
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
  return {
    hasOptions: existsSync(target.file),
    backupAt: backup?.isFile() ? backup.mtimeMs : null,
    minecraftVersion: target.minecraftVersion,
    sources
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
