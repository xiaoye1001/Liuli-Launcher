import { app, BrowserWindow, dialog, shell } from 'electron'
import { copyFile, mkdir, open, readdir, rm, stat, writeFile } from 'fs/promises'
import { arch, platform, release, totalmem } from 'os'
import { basename, join } from 'path'
import { analyzeCrash, type CrashContext } from './crashAnalysis'
import { zipDirectory } from './zipWriter'
import type { CrashAnalysis } from '../shared/types'

/** 每个文件最多读取的大小（取末尾），崩溃信息通常在最后 */
const MAX_READ = 2 * 1024 * 1024

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
async function readTail(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, MAX_READ)
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
  const crashReport =
    options.crashReportLocation && (await stat(options.crashReportLocation).catch(() => null))
      ? options.crashReportLocation
      : await newestFile(join(options.gamePath, 'crash-reports'), /^crash-.*\.txt$/, since)
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
    await writeFile(join(tmp, '环境信息.txt'), env.join('\n'), 'utf-8')
    await writeFile(join(tmp, '游戏输出.txt'), crash.logs.join('\n'), 'utf-8')
    const files = [
      crash.crashReport,
      crash.nativeLog,
      join(crash.gamePath, 'logs', 'latest.log'),
      join(crash.gamePath, 'logs', 'debug.log')
    ]
    for (const file of files) {
      if (file && (await stat(file).catch(() => null))) await copyFile(file, join(tmp, basename(file)))
    }
    await zipDirectory(tmp, result.filePath, '崩溃信息')
    return result.filePath
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
