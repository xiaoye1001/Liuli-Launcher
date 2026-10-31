import { app, BrowserWindow, dialog, shell } from 'electron'
import { mkdir, open, readdir, rm, stat, writeFile } from 'fs/promises'
import { arch, platform, release, totalmem } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { analyzeCrash, type CrashContext } from './crashAnalysis'
import { sanitizeLog } from './logShare'
import { zipDirectory } from './zipWriter'
import type { CrashAnalysis } from '../shared/types'

/** 每个文件最多读取的大小（取末尾），崩溃信息通常在最后 */
const MAX_READ = 2 * 1024 * 1024
/** 导出时每个日志文件最多保留的大小（取末尾） */
const MAX_EXPORT = 20 * 1024 * 1024

interface LastCrash {
  versionId: string
  gamePath: string
  crashReport?: string
  nativeLog?: string
  logs: string[]
  analysis: CrashAnalysis
  context: CrashContext & { javaPath?: string }
}

let lastCrash: LastCrash | null = null

/** 读取文件末尾（大文件只取最后 2 MB） */
async function readTail(path: string, max = MAX_READ): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, max)
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, size - length)
    return buf.toString('utf-8')
  } finally {
    await handle.close()
  }
}

/** 找到本次启动后生成的最新文件 */
async function newestFile(dir: string, pattern: RegExp, since: number): Promise<string | undefined> {
  let best: { path: string; mtime: number } | undefined
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!pattern.test(name)) continue
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info?.isFile() && info.mtimeMs >= since && (!best || info.mtimeMs > best.mtime)) {
      best = { path, mtime: info.mtimeMs }
    }
  }
  return best?.path
}

/**
 * 游戏输出里「Crash report saved to:」后面的路径。游戏输出里也有服务器发来的聊天内容，可以伪造这一行，
 * 所以只接受本次启动后在 crash-reports 文件夹里生成的崩溃报告
 */
async function trustedCrashReport(
  location: string | undefined,
  dir: string,
  since: number
): Promise<string | undefined> {
  if (!location) return undefined
  const path = resolve(location.trim())
  const same = (a: string, b: string): boolean =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  if (!same(dirname(path), resolve(dir)) || !/^crash-.*\.txt$/.test(basename(path))) return undefined
  const info = await stat(path).catch(() => null)
  return info?.isFile() && info.mtimeMs >= since ? path : undefined
}

/**
 * 游戏异常退出后收集崩溃信息并分析：
 * 启动器收集的游戏输出、crash-reports 中的崩溃报告、游戏目录中的 Java 崩溃日志（hs_err_pid*.log）
 */
export async function collectCrash(options: {
  versionId: string
  gamePath: string
  startedAt: number
  exitCode: number | null
  crashReportLocation?: string
  logs: string[]
  context: CrashContext & { javaPath?: string }
}): Promise<CrashAnalysis> {
  // 文件时间可能有几秒误差
  const since = options.startedAt - 5000
  const reportsDir = join(options.gamePath, 'crash-reports')
  const crashReport =
    (await trustedCrashReport(options.crashReportLocation, reportsDir, since)) ??
    (await newestFile(reportsDir, /^crash-.*\.txt$/, since))
  const nativeLog = await newestFile(options.gamePath, /^hs_err_pid\d+\.log$/, since)
  const analysis = analyzeCrash(
    {
      log: options.logs.filter((l) => !l.startsWith('[启动器]')).join('\n'),
      crashReport: crashReport ? await readTail(crashReport).catch(() => undefined) : undefined,
      nativeLog: nativeLog ? await readTail(nativeLog).catch(() => undefined) : undefined
    },
    options.context,
    options.exitCode
  )
  lastCrash = { ...options, crashReport, nativeLog, analysis }
  return analysis
}

/** 最近一次崩溃的游戏输出和崩溃报告路径（分享日志用） */
export function getCrashFiles(): { logs: string[]; crashReport?: string } | null {
  return lastCrash ? { logs: lastCrash.logs, crashReport: lastCrash.crashReport } : null
}

/** 读取文件开头 */
async function readHead(path: string, max: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, max)
    const buf = Buffer.alloc(length)
    await handle.read(buf, 0, length, 0)
    return buf.toString('utf-8')
  } finally {
    await handle.close()
  }
}

/** 交给 AI 分析的单项材料的长度上限（字符） */
const AI_LIMITS = { output: 24_000, outputLines: 400, reportHead: 22_000, reportTail: 6_000, nativeHead: 12_000 }

/** 交给 AI 分析的崩溃材料：已去掉登录令牌和用户文件夹路径，较长的内容只保留关键部分 */
export interface CrashMaterial {
  versionId: string
  environment: string
  /** 启动器自带规则分析的结果 */
  analysis: string
  crashReport?: string
  nativeLog?: string
  /** 游戏输出的最后一部分 */
  output: string
  /** 有内容因为太长被省略 */
  trimmed: boolean
}

/**
 * 最近一次崩溃的材料，没有崩溃记录时返回 null。
 * 崩溃报告的原因和调用栈在开头、加载的模组列表在后面，所以保留开头和结尾；
 * Java 崩溃日志的关键信息（出错的位置）在开头；游戏输出保留最后的部分
 */
export async function getCrashMaterial(): Promise<CrashMaterial | null> {
  const crash = lastCrash
  if (!crash) return null
  let trimmed = false
  const environment = [
    `启动器版本：${__APP_VERSION__}`,
    `系统：${platform()} ${release()} ${arch()}`,
    `物理内存：${Math.round(totalmem() / 1024 / 1024)} MB`,
    `游戏版本：${crash.versionId}`,
    `Java 主版本：${crash.context.javaMajor ?? '未知'}`,
    `分配的最大内存：${crash.context.maxMemory ?? '未知'} MB`,
    `填写了附加的 JVM 参数：${crash.context.customJvmArgs ? '是' : '否'}`,
    `退出码：${crash.analysis.exitCode ?? '未知'}`
  ].join('\n')

  let lines = crash.logs.filter((l) => !l.startsWith('[启动器]'))
  if (lines.length > AI_LIMITS.outputLines) {
    lines = lines.slice(-AI_LIMITS.outputLines)
    trimmed = true
  }
  let output = lines.join('\n')
  if (output.length > AI_LIMITS.output) {
    output = output.slice(-AI_LIMITS.output)
    trimmed = true
  }

  let crashReport: string | undefined
  if (crash.crashReport) {
    const size = (await stat(crash.crashReport).catch(() => null))?.size ?? 0
    if (size <= AI_LIMITS.reportHead + AI_LIMITS.reportTail) {
      crashReport = await readHead(crash.crashReport, AI_LIMITS.reportHead + AI_LIMITS.reportTail).catch(() => '')
    } else {
      const head = await readHead(crash.crashReport, AI_LIMITS.reportHead).catch(() => '')
      const tail = await readTail(crash.crashReport, AI_LIMITS.reportTail).catch(() => '')
      crashReport = `${head}\n……（中间省略）……\n${tail}`
      trimmed = true
    }
  }
  let nativeLog: string | undefined
  if (crash.nativeLog) {
    nativeLog = await readHead(crash.nativeLog, AI_LIMITS.nativeHead).catch(() => undefined)
    if (((await stat(crash.nativeLog).catch(() => null))?.size ?? 0) > AI_LIMITS.nativeHead) trimmed = true
  }

  return {
    versionId: crash.versionId,
    environment: sanitizeLog(environment),
    analysis: sanitizeLog(analysisText(crash)),
    crashReport: crashReport ? sanitizeLog(crashReport) : undefined,
    nativeLog: nativeLog ? sanitizeLog(nativeLog) : undefined,
    output: sanitizeLog(output),
    trimmed
  }
}

/** 打开最近一次崩溃的崩溃报告或 Java 崩溃日志（只能打开启动器自己找到的文件） */
export async function openCrashFile(kind: 'report' | 'native'): Promise<void> {
  const path = kind === 'report' ? lastCrash?.crashReport : lastCrash?.nativeLog
  if (!path) throw new Error('没有找到对应的文件')
  const error = await shell.openPath(path)
  if (error) throw new Error(error)
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** 分析结果的文字版 */
function analysisText(crash: LastCrash): string {
  const lines = [`版本：${crash.versionId}`, `退出码：${crash.analysis.exitCode ?? '未知'}`, '']
  if (crash.analysis.causes.length === 0) {
    lines.push('未能自动识别崩溃原因。')
    if (crash.analysis.keyError) lines.push(`关键错误：${crash.analysis.keyError}`)
  }
  for (const cause of crash.analysis.causes) {
    lines.push(`【${cause.title}】`, cause.detail)
    if (cause.mods?.length) lines.push(`相关模组：${cause.mods.join('、')}`)
    for (const s of cause.suggestions) lines.push(`- ${s}`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 导出崩溃信息：把分析结果、环境信息、游戏输出、崩溃报告与游戏日志打包成 zip，
 * 方便发给别人求助。返回保存的路径，取消时返回 null
 */
export async function exportCrashInfo(win: BrowserWindow | null): Promise<string | null> {
  const crash = lastCrash
  if (!crash) throw new Error('没有可以导出的崩溃信息')
  const options: Electron.SaveDialogOptions = {
    title: '导出崩溃信息',
    defaultPath: join(app.getPath('desktop'), `崩溃信息-${crash.versionId}-${timestamp()}.zip`),
    filters: [{ name: 'zip 压缩包', extensions: ['zip'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null

  const tmp = join(app.getPath('temp'), `liuli-crash-${Date.now()}`)
  await mkdir(tmp, { recursive: true })
  try {
    await writeFile(join(tmp, '分析结果.txt'), analysisText(crash), 'utf-8')
    const env = [
      `启动器版本：${__APP_VERSION__}`,
      `系统：${platform()} ${release()} ${arch()}`,
      `物理内存：${Math.round(totalmem() / 1024 / 1024)} MB`,
      `游戏版本：${crash.versionId}`,
      `游戏目录：${crash.gamePath}`,
      `Java：${crash.context.javaMajor ?? '未知'}（${crash.context.javaPath ?? ''}）`,
      `最大内存：${crash.context.maxMemory ?? '未知'} MB`
    ]
    // 导出的文件会发给别人：所有内容都去掉登录令牌和用户文件夹路径
    await writeFile(join(tmp, '环境信息.txt'), sanitizeLog(env.join('\n')), 'utf-8')
    await writeFile(join(tmp, '游戏输出.txt'), sanitizeLog(crash.logs.join('\n')), 'utf-8')
    const files = [
      crash.crashReport,
      crash.nativeLog,
      join(crash.gamePath, 'logs', 'latest.log'),
      join(crash.gamePath, 'logs', 'debug.log')
    ]
    for (const file of files) {
      if (!file || !(await stat(file).catch(() => null))) continue
      const text = await readTail(file, MAX_EXPORT).catch(() => null)
      if (text !== null) await writeFile(join(tmp, basename(file)), sanitizeLog(text), 'utf-8')
    }
    await zipDirectory(tmp, result.filePath, '崩溃信息')
    return result.filePath
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
