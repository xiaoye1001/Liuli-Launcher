/**
 * 模组二分排查：游戏崩溃又不知道是哪个模组时，每轮只启用一半可疑的模组，玩家进游戏试一下，
 * 回答「问题还在」或「问题消失了」，可疑范围每轮减半，几轮后找到出问题的模组。
 * - 开始前记下原来启用了哪些模组（保存在版本游戏目录的 liuli-bisect.json，重启启动器也能继续），
 *   结束或中途退出时按记录恢复
 * - 禁用一半后如果有模组缺少前置（前置在被禁用的那一半里），把前置一起启用，避免因为缺前置而崩溃
 * - 原来就禁用的模组不参与
 */
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { checkModIssues, listModFiles, listMods, modsContextOf, setModEnabled } from './mods'
import { autoSnapshot } from './versionSnapshots'
import type { ModBisectState } from '../shared/types'

const FILE = 'liuli-bisect.json'
const DISABLED = '.disabled'

interface Session {
  versionId: string
  startedAt: number
  /** 原来启用的模组（不带 .disabled 的文件名） */
  original: string[]
  /** 还可疑的模组 */
  suspects: string[]
  /** 这一轮启用的可疑模组 */
  testing: string[]
  round: number
  /** 找到的模组 */
  found?: string
  /** 剩下的模组互相依赖，没法再分 */
  stuck?: boolean
}

const base = (name: string): string => name.replace(/\.disabled$/, '')

async function pathOf(versionId: string): Promise<{ file: string; modsDir: string }> {
  const ctx = await modsContextOf(versionId)
  return { file: join(dirname(ctx.dir), FILE), modsDir: ctx.dir }
}

async function load(versionId: string): Promise<Session | null> {
  try {
    const { file } = await pathOf(versionId)
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Partial<Session>
    const names = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.endsWith('.jar')).slice(0, 2000) : []
    if (!Array.isArray(raw.original)) return null
    return {
      versionId,
      startedAt: Number(raw.startedAt) || Date.now(),
      original: names(raw.original),
      suspects: names(raw.suspects),
      testing: names(raw.testing),
      round: Number(raw.round) || 1,
      found: typeof raw.found === 'string' ? raw.found : undefined,
      stuck: raw.stuck === true
    }
  } catch {
    return null
  }
}

async function save(session: Session): Promise<void> {
  const { file } = await pathOf(session.versionId)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(session, null, 2), 'utf-8')
  await rename(`${file}.tmp`, file)
}

async function clear(versionId: string): Promise<void> {
  const { file } = await pathOf(versionId)
  await rm(file, { force: true })
}

/** 把磁盘上的模组改成：wanted 里的启用，original 里其他的禁用（不在 original 里的不动） */
async function applyEnabled(versionId: string, original: string[], wanted: Set<string>): Promise<void> {
  const { modsDir } = await pathOf(versionId)
  const present = new Map((await listModFiles(modsDir)).map((f) => [base(f), f]))
  for (const name of original) {
    const current = present.get(name)
    // 排查期间被删掉或更新掉的模组：跳过
    if (!current) continue
    const enabled = !current.endsWith(DISABLED)
    const want = wanted.has(name)
    if (enabled !== want) await setModEnabled(versionId, current, want)
  }
}

/**
 * 准备一轮：启用 suspects 的前一半（不行就换后一半），被禁用的那一半里如果有别的模组需要的前置，一起启用。
 * 返回这一轮启用的可疑模组；分不开时返回 null
 */
async function prepareRound(session: Session): Promise<string[] | null> {
  const { suspects, original } = session
  const half = Math.ceil(suspects.length / 2)
  for (const first of [suspects.slice(0, half), suspects.slice(half)]) {
    const off = new Set(suspects.filter((s) => !first.includes(s)))
    for (let i = 0; i < 20; i++) {
      await applyEnabled(session.versionId, original, new Set(original.filter((m) => !off.has(m))))
      const issues = await checkModIssues(session.versionId).catch(() => [])
      const needed = issues
        .filter((issue) => issue.kind === 'missing' && issue.disabled)
        .map((issue) => (issue.kind === 'missing' && issue.disabled ? base(issue.disabled.fileName) : ''))
        .filter((name) => off.has(name))
      if (needed.length === 0) break
      for (const name of needed) off.delete(name)
    }
    const testing = suspects.filter((s) => !off.has(s))
    // 这一半能分开：有启用的，也有禁用的
    if (testing.length > 0 && testing.length < suspects.length) return testing
  }
  return null
}

async function stateOf(session: Session | null): Promise<ModBisectState | null> {
  if (!session) return null
  const names = new Map<string, string>()
  try {
    for (const mod of (await listMods(session.versionId)).mods) {
      names.set(base(mod.fileName), mod.zhName ? `${mod.name}（${mod.zhName}）` : mod.name)
    }
  } catch {
    // 读不到模组信息时显示文件名
  }
  const label = (file: string): { fileName: string; name: string } => ({
    fileName: file,
    name: names.get(file) ?? file
  })
  return {
    versionId: session.versionId,
    round: session.round,
    total: session.original.length,
    suspects: session.suspects.map(label),
    testing: session.testing.map(label),
    roundsLeft: session.found || session.stuck ? 0 : Math.ceil(Math.log2(Math.max(2, session.suspects.length))),
    found: session.found ? label(session.found) : null,
    stuck: session.stuck === true
  }
}

export async function getModBisect(versionId: string): Promise<ModBisectState | null> {
  return stateOf(await load(versionId))
}

/** 开始排查：记下现在启用的模组，准备第一轮 */
export async function startModBisect(versionId: string): Promise<ModBisectState> {
  if (await load(versionId)) throw new Error('这个版本已经在排查了')
  const list = await listMods(versionId)
  if (!list.loader || list.loader === 'optifine') throw new Error('这个版本没有模组加载器')
  const original = list.mods.filter((m) => m.enabled).map((m) => base(m.fileName))
  if (original.length < 2) throw new Error('至少要有 2 个启用的模组才能排查')
  await autoSnapshot(versionId, '模组二分排查')
  const session: Session = {
    versionId,
    startedAt: Date.now(),
    original,
    suspects: [...original],
    testing: [],
    round: 1
  }
  // 先保存记录再改文件：中途出错也能按记录恢复
  await save(session)
  const testing = await prepareRound(session)
  if (!testing) {
    session.stuck = true
    await applyEnabled(versionId, original, new Set(original))
  } else {
    session.testing = testing
  }
  await save(session)
  return (await stateOf(session))!
}

/** 回答这一轮的结果：bad 表示问题还在，good 表示问题消失了 */
export async function answerModBisect(versionId: string, result: unknown): Promise<ModBisectState> {
  const session = await load(versionId)
  if (!session) throw new Error('没有正在进行的排查')
  if (session.found || session.stuck) return (await stateOf(session))!
  if (result !== 'bad' && result !== 'good') throw new Error('无效的结果')
  const testing = new Set(session.testing)
  session.suspects =
    result === 'bad' ? session.suspects.filter((s) => testing.has(s)) : session.suspects.filter((s) => !testing.has(s))
  session.round++
  session.testing = []
  if (session.suspects.length === 0) {
    // 不应该出现（每轮都有启用和禁用的）；当作找不到，恢复原样
    session.stuck = true
  } else if (session.suspects.length === 1) {
    session.found = session.suspects[0]
  } else {
    await save(session)
    const next = await prepareRound(session)
    if (next) session.testing = next
    else session.stuck = true
  }
  // 找到了或者分不开：先把模组恢复原样，让玩家决定怎么处理
  if (session.found || session.stuck) await applyEnabled(versionId, session.original, new Set(session.original))
  await save(session)
  return (await stateOf(session))!
}

/** 结束排查：恢复原来启用的模组；disableFound 为 true 时把找到的模组禁用 */
export async function finishModBisect(versionId: string, disableFound = false): Promise<void> {
  const session = await load(versionId)
  if (!session) return
  await applyEnabled(versionId, session.original, new Set(session.original))
  if (disableFound && session.found) {
    const { modsDir } = await pathOf(versionId)
    const file = (await listModFiles(modsDir)).find((f) => f === session.found)
    if (file) await setModEnabled(versionId, file, false)
  }
  await clear(versionId)
}
