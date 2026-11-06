/**
 * 模组配置可视化编辑：版本游戏目录下 config 文件夹里的配置文件，把常见的设置项显示成开关、数字和文字框。
 * - 支持 .toml（Forge / NeoForge）、.json（不带注释的）、.properties、旧版 Forge .cfg（B:/I:/D:/S: 前缀）
 * - TOML / properties / cfg 按行修改：只替换那一行的值，注释和其他内容原样保留；JSON 改完按原来的缩进重新写出
 * - 第一次修改前把原文件备份到 liuli-config-backup，可以一键恢复原样；也可以直接改文本
 * - 游戏运行时不能改（游戏退出时会重写配置）；只能操作 config 文件夹里的文件
 */
import { copyFile, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'path'
import { assertGameStopped, modsContextOf } from './mods'
import type { ConfigEntry, ConfigFileInfo, ConfigFileView } from '../shared/types'

const EXTENSIONS = ['.toml', '.json', '.json5', '.properties', '.cfg', '.txt', '.yml', '.yaml', '.ini']
const EDITABLE = ['.toml', '.json', '.properties', '.cfg']
const MAX_FILES = 2000
const MAX_DEPTH = 5
const MAX_BYTES = 1024 * 1024
const BACKUP_DIR = 'liuli-config-backup'

async function rootsOf(versionId: string): Promise<{ gamePath: string; config: string; backup: string }> {
  const ctx = await modsContextOf(versionId)
  const gamePath = dirname(ctx.dir)
  return { gamePath, config: join(gamePath, 'config'), backup: join(gamePath, BACKUP_DIR) }
}

async function resolveConfig(versionId: string, name: unknown): Promise<{ path: string; rel: string; backup: string }> {
  if (typeof name !== 'string' || !name || name.includes('\0')) throw new Error('无效的文件名')
  const roots = await rootsOf(versionId)
  const path = resolve(roots.config, name)
  if (!path.startsWith(roots.config + sep)) throw new Error('无效的文件名')
  if (!EXTENSIONS.includes(extname(path).toLowerCase())) throw new Error('不是配置文件')
  const info = await lstat(path).catch(() => null)
  if (!info || !info.isFile()) throw new Error('找不到这个配置文件')
  const rel = relative(roots.config, path).split(sep).join('/')
  return { path, rel, backup: join(roots.backup, ...rel.split('/')) }
}

export async function listConfigFiles(versionId: string): Promise<ConfigFileInfo[]> {
  const { config, backup } = await rootsOf(versionId)
  const result: ConfigFileInfo[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || result.length >= MAX_FILES) return
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (result.length >= MAX_FILES) return
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path, depth + 1)
      else if (entry.isFile() && EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
        const info = await stat(path).catch(() => null)
        if (!info) continue
        const rel = relative(config, path).split(sep).join('/')
        result.push({
          name: rel,
          size: info.size,
          modified: info.mtimeMs,
          editable: EDITABLE.includes(extname(entry.name).toLowerCase()) && info.size <= MAX_BYTES,
          hasBackup: !!(await stat(join(backup, ...rel.split('/'))).catch(() => null))
        })
      }
    }
  }
  await walk(config, 0)
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- 解析 ----------

/** 注释里的「Range: 1 ~ 100」「Allowed Values: A, B」 */
function hints(comment: string): Pick<ConfigEntry, 'min' | 'max' | 'options'> {
  const out: Pick<ConfigEntry, 'min' | 'max' | 'options'> = {}
  const range = /Range:\s*(-?[\d.]+|[<>]?\s*-?[\d.]+)\s*~\s*(-?[\d.]+)/i.exec(comment)
  if (range) {
    const min = Number(range[1].replace(/[<>\s]/g, ''))
    const max = Number(range[2])
    if (Number.isFinite(min)) out.min = min
    if (Number.isFinite(max)) out.max = max
  }
  const allowed = /Allowed Values:\s*([^\n]+)/i.exec(comment)
  if (allowed) {
    const options = allowed[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (options.length > 1 && options.length <= 50) out.options = options
  }
  return out
}

/** TOML 值的位置：返回值在这一行里的开始、结束位置和类型 */
function tomlValue(
  line: string,
  from: number
): { start: number; end: number; type: ConfigEntry['type']; value: string | number | boolean } | null {
  let i = from
  while (line[i] === ' ' || line[i] === '\t') i++
  const rest = line.slice(i)
  if (rest.startsWith('"') && !rest.startsWith('"""')) {
    let j = 1
    let text = ''
    while (j < rest.length) {
      const ch = rest[j]
      if (ch === '\\') {
        const next = rest[j + 1]
        const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\', r: '\r' }
        if (!(next in map)) return null
        text += map[next]
        j += 2
        continue
      }
      if (ch === '"') break
      text += ch
      j++
    }
    if (rest[j] !== '"') return null
    return { start: i, end: i + j + 1, type: 'string', value: text }
  }
  if (rest.startsWith("'") && !rest.startsWith("'''")) {
    const close = rest.indexOf("'", 1)
    if (close < 0) return null
    return { start: i, end: i + close + 1, type: 'string', value: rest.slice(1, close) }
  }
  const token = /^[^\s#,]+/.exec(rest)?.[0] ?? ''
  if (token === 'true' || token === 'false')
    return { start: i, end: i + token.length, type: 'boolean', value: token === 'true' }
  if (/^[+-]?(\d[\d_]*)(\.\d[\d_]*)?([eE][+-]?\d+)?$/.test(token)) {
    return { start: i, end: i + token.length, type: 'number', value: Number(token.replace(/_/g, '')) }
  }
  return null
}

function parseToml(text: string): ConfigEntry[] {
  const lines = text.split(/\r?\n/)
  const entries: ConfigEntry[] = []
  let section = ''
  let comment: string[] = []
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      comment = []
      return
    }
    if (trimmed.startsWith('#')) {
      comment.push(trimmed.replace(/^#+\s?/, ''))
      return
    }
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(trimmed)
    if (header) {
      section = header[1].replace(/"/g, '')
      comment = []
      return
    }
    const key = /^(\s*)("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=/.exec(line)
    if (key) {
      const value = tomlValue(line, key[0].length)
      if (value) {
        const name = key[2].replace(/^["']|["']$/g, '')
        const help = comment.join('\n')
        entries.push({
          id: `L${index}`,
          section,
          key: name,
          type: value.type,
          value: value.value,
          comment: help.slice(0, 1000),
          ...hints(help)
        })
      }
    }
    comment = []
  })
  return entries
}

/** .properties 和旧版 Forge .cfg（B:name=true、I:name=5） */
function parseProperties(text: string, cfg: boolean): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  const sections: string[] = []
  let comment: string[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      comment = []
      return
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      comment.push(trimmed.replace(/^[#!]+\s?/, ''))
      return
    }
    if (cfg) {
      const open = /^"?([^"{]+?)"?\s*\{$/.exec(trimmed)
      if (open) {
        sections.push(open[1].trim())
        comment = []
        return
      }
      if (trimmed === '}') {
        sections.pop()
        comment = []
        return
      }
      const typed = /^([BIDS]):("?)([^"=]+)\2=(.*)$/.exec(trimmed)
      if (typed) {
        const [, kind, , key, raw] = typed
        const help = comment.join('\n')
        const value = kind === 'B' ? raw.trim() === 'true' : kind === 'S' ? raw : Number(raw)
        if (kind !== 'S' && kind !== 'B' && !Number.isFinite(value as number)) return
        entries.push({
          id: `L${index}`,
          section: sections.join('.'),
          key,
          type: kind === 'B' ? 'boolean' : kind === 'S' ? 'string' : 'number',
          value,
          comment: help.slice(0, 1000),
          ...hints(help)
        })
      }
      comment = []
      return
    }
    const kv = /^([^=:\s][^=:]*?)\s*[=:]\s*(.*)$/.exec(trimmed)
    if (kv) {
      const raw = kv[2]
      const type: ConfigEntry['type'] =
        raw === 'true' || raw === 'false' ? 'boolean' : /^-?\d+(\.\d+)?$/.test(raw) ? 'number' : 'string'
      entries.push({
        id: `L${index}`,
        section: '',
        key: kv[1],
        type,
        value: type === 'boolean' ? raw === 'true' : type === 'number' ? Number(raw) : raw,
        comment: comment.join('\n').slice(0, 1000)
      })
    }
    comment = []
  })
  return entries
}

/** JSON：把对象里的文字、数字、开关摊平成设置项（最多 6 层） */
function parseJson(text: string): ConfigEntry[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const entries: ConfigEntry[] = []
  const walk = (value: unknown, path: (string | number)[]): void => {
    if (entries.length >= 3000 || path.length > 6) return
    if (value === null) return
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      const key = String(path[path.length - 1] ?? '')
      entries.push({
        id: `J${JSON.stringify(path)}`,
        section: path.slice(0, -1).join('.'),
        key,
        type: typeof value as ConfigEntry['type'],
        value,
        comment: ''
      })
      return
    }
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, [...path, i]))
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value as object)) walk(v, [...path, k])
  }
  walk(data, [])
  return entries
}

function parseFile(name: string, text: string): ConfigEntry[] | null {
  const ext = extname(name).toLowerCase()
  if (ext === '.toml') return parseToml(text)
  if (ext === '.json') return parseJson(text)
  if (ext === '.properties') return parseProperties(text, false)
  if (ext === '.cfg') return parseProperties(text, true)
  return null
}

export async function readConfigFile(versionId: string, name: unknown): Promise<ConfigFileView> {
  const file = await resolveConfig(versionId, name)
  const info = await stat(file.path)
  if (info.size > MAX_BYTES) throw new Error('配置文件太大（超过 1 MB），请用文本编辑器打开')
  const text = await readFile(file.path, 'utf-8')
  const entries = parseFile(file.rel, text)
  return {
    name: file.rel,
    text,
    entries,
    hasBackup: !!(await stat(file.backup).catch(() => null))
  }
}

// ---------- 保存 ----------

function formatTomlValue(type: ConfigEntry['type'], value: unknown, original: string): string {
  if (type === 'boolean') return value === true ? 'true' : 'false'
  if (type === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error('数字无效')
    // 原来写成小数的保持小数
    return original.includes('.') && Number.isInteger(n) ? n.toFixed(1) : String(n)
  }
  return JSON.stringify(String(value))
}

function checkValue(entry: ConfigEntry, value: unknown): unknown {
  if (entry.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`「${entry.key}」需要是开或关`)
    return value
  }
  if (entry.type === 'number') {
    const n = Number(value)
    if (typeof value === 'boolean' || value === '' || !Number.isFinite(n)) throw new Error(`「${entry.key}」需要是数字`)
    if (entry.min !== undefined && n < entry.min) throw new Error(`「${entry.key}」不能小于 ${entry.min}`)
    if (entry.max !== undefined && n > entry.max) throw new Error(`「${entry.key}」不能大于 ${entry.max}`)
    return n
  }
  const text = String(value ?? '')
  if (/[\r\n]/.test(text)) throw new Error(`「${entry.key}」不能换行`)
  if (entry.options && !entry.options.includes(text))
    throw new Error(`「${entry.key}」只能是：${entry.options.join('、')}`)
  return text.slice(0, 10_000)
}

async function backupOnce(file: { path: string; backup: string }): Promise<void> {
  if (await stat(file.backup).catch(() => null)) return
  await mkdir(dirname(file.backup), { recursive: true })
  await copyFile(file.path, file.backup)
}

/** 保存修改过的设置项：changes 是 设置项 ID → 新的值 */
export async function saveConfigEntries(versionId: string, name: unknown, changes: unknown): Promise<ConfigFileView> {
  assertGameStopped(versionId)
  const file = await resolveConfig(versionId, name)
  if (!changes || typeof changes !== 'object') throw new Error('没有要保存的修改')
  const text = await readFile(file.path, 'utf-8')
  const entries = parseFile(file.rel, text)
  if (!entries) throw new Error('这个文件只能直接改文本')
  const byId = new Map(entries.map((e) => [e.id, e]))
  const ext = extname(file.rel).toLowerCase()
  let next = text
  if (ext === '.json') {
    const data = JSON.parse(text) as unknown
    for (const [id, raw] of Object.entries(changes as Record<string, unknown>)) {
      const entry = byId.get(id)
      if (!entry) continue
      const value = checkValue(entry, raw)
      const path = JSON.parse(id.slice(1)) as (string | number)[]
      let target = data as Record<string | number, unknown>
      for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>
      target[path[path.length - 1]] = value
    }
    const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? '  '
    next = JSON.stringify(data, null, indent) + (text.endsWith('\n') ? '\n' : '')
  } else {
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r?\n/)
    for (const [id, raw] of Object.entries(changes as Record<string, unknown>)) {
      const entry = byId.get(id)
      if (!entry) continue
      const value = checkValue(entry, raw)
      const index = Number(id.slice(1))
      const line = lines[index]
      if (ext === '.toml') {
        const key = /^(\s*)("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=/.exec(line)
        const pos = key && tomlValue(line, key[0].length)
        if (!key || !pos) continue
        lines[index] =
          line.slice(0, pos.start) +
          formatTomlValue(entry.type, value, line.slice(pos.start, pos.end)) +
          line.slice(pos.end)
      } else {
        // .cfg 的值在 = 后面（前面的 B: / I: 是类型）；.properties 用 = 或 : 分隔
        const eq = ext === '.cfg' ? line.indexOf('=') : line.search(/[=:]/)
        if (eq < 0) continue
        const prefix = line.slice(0, eq + 1)
        const spacing = /^\s*/.exec(line.slice(eq + 1))?.[0] ?? ''
        lines[index] = prefix + spacing + (entry.type === 'boolean' ? String(value) : String(value))
      }
    }
    next = lines.join(eol)
  }
  if (next !== text) {
    await backupOnce(file)
    await writeFile(file.path, next, 'utf-8')
  }
  return readConfigFile(versionId, name)
}

/** 直接保存整个文本 */
export async function saveConfigText(versionId: string, name: unknown, text: unknown): Promise<ConfigFileView> {
  assertGameStopped(versionId)
  const file = await resolveConfig(versionId, name)
  if (typeof text !== 'string') throw new Error('内容无效')
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('内容太长了')
  if (extname(file.rel).toLowerCase() === '.json') {
    try {
      JSON.parse(text)
    } catch (e) {
      throw new Error(`JSON 格式不对：${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await backupOnce(file)
  await writeFile(file.path, text, 'utf-8')
  return readConfigFile(versionId, name)
}

/** 恢复成第一次修改前的样子 */
export async function restoreConfigFile(versionId: string, name: unknown): Promise<ConfigFileView> {
  assertGameStopped(versionId)
  const file = await resolveConfig(versionId, name)
  if (!(await stat(file.backup).catch(() => null))) throw new Error('这个文件没有改过（没有备份）')
  await copyFile(file.backup, file.path)
  await rm(file.backup, { force: true })
  return readConfigFile(versionId, name)
}
