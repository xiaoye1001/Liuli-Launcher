import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { cpus } from 'os'
import { getGameProcessInfo, onGameStatusChange } from './launch'
import { setTrayDetail } from './tray'
import type { GameResources } from '../shared/types'

/**
 * 游戏资源监控：游戏运行时每隔几秒读取游戏进程的内存和 CPU 占用，显示在主页和托盘图标的提示里。
 * Linux 读 /proc，macOS 用 ps，Windows 用 tasklist；用了包装命令（例如 gamemoderun）时找它启动的 java 进程
 */
const INTERVAL = process.platform === 'win32' ? 5000 : 3000

interface RawSample {
  /** 常驻内存（字节） */
  rss: number
  /** 累计 CPU 时间（秒）；macOS 直接给出最近的 CPU 占用百分比 */
  cpuSeconds?: number
  cpuPercent?: number
}

let timer: ReturnType<typeof setInterval> | null = null
let latest: GameResources | null = null
let previous: { cpuSeconds: number; at: number } | null = null
let sampling = false

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(String(stdout))
    )
  })
}

// ---------- Linux ----------

const CLOCK_TICKS = 100

async function linuxComm(pid: number): Promise<string> {
  return (await readFile(`/proc/${pid}/comm`, 'utf-8').catch(() => '')).trim()
}

/** 包装命令启动的 java：在子进程里找（最多往下找三层） */
async function linuxJavaPid(pid: number, depth = 0): Promise<number> {
  if (/java/i.test(await linuxComm(pid)) || depth >= 3) return pid
  const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf-8').catch(() => ''))
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
  for (const child of children) {
    const found = await linuxJavaPid(child, depth + 1)
    if (/java/i.test(await linuxComm(found))) return found
  }
  return pid
}

async function sampleLinux(pid: number): Promise<RawSample | null> {
  const target = await linuxJavaPid(pid)
  const [stat, status] = await Promise.all([
    readFile(`/proc/${target}/stat`, 'utf-8').catch(() => ''),
    readFile(`/proc/${target}/status`, 'utf-8').catch(() => '')
  ])
  if (!stat || !status) return null
  // 进程名里可能有空格和括号：从最后一个 ) 后面开始数
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const ticks = Number(fields[11]) + Number(fields[12])
  const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? NaN)
  if (!Number.isFinite(rssKb)) return null
  return { rss: rssKb * 1024, cpuSeconds: Number.isFinite(ticks) ? ticks / CLOCK_TICKS : undefined }
}

// ---------- macOS ----------

async function sampleMac(pid: number): Promise<RawSample | null> {
  const out = await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=,comm='])
  const rows = out
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cpu: +m[4], comm: m[5] }))
  let current = rows.find((r) => r.pid === pid)
  for (let depth = 0; current && !/java/i.test(current.comm) && depth < 3; depth++) {
    const parent: number = current.pid
    current = rows.find((r) => r.ppid === parent && /java/i.test(r.comm)) ?? rows.find((r) => r.ppid === parent)
  }
  const target = current && /java/i.test(current.comm) ? current : rows.find((r) => r.pid === pid)
  if (!target) return null
  return { rss: target.rss * 1024, cpuPercent: target.cpu / Math.max(1, cpus().length) }
}

// ---------- Windows ----------

/** 解析 tasklist 的 CSV 一行 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  const re = /"((?:[^"]|"")*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) cells.push(m[1].replace(/""/g, '"'))
  return cells
}

async function sampleWindows(pid: number): Promise<RawSample | null> {
  const out = await run('tasklist', ['/v', '/fo', 'csv', '/nh', '/fi', `PID eq ${pid}`])
  const cells = parseCsvLine(out.split(/\r?\n/).find((l) => l.includes(`"${pid}"`)) ?? '')
  if (cells.length < 8) return null
  // 内存一列形如「1,234,567 K」（分隔符随系统语言不同）
  const memKb = Number(cells[4].replace(/[^\d]/g, ''))
  const time = /^(\d+):(\d{2}):(\d{2})$/.exec(cells[7].trim())
  if (!Number.isFinite(memKb) || memKb <= 0) return null
  return {
    rss: memKb * 1024,
    cpuSeconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : undefined
  }
}

function sampleProcess(pid: number): Promise<RawSample | null> {
  if (process.platform === 'linux') return sampleLinux(pid)
  if (process.platform === 'darwin') return sampleMac(pid)
  if (process.platform === 'win32') return sampleWindows(pid)
  return Promise.resolve(null)
}

/** 不到 1 GB 时显示 MB */
function formatMemory(mb: number): string {
  return mb < 1024 ? `${mb} MB` : `${(mb / 1024).toFixed(1)} GB`
}

function publish(next: GameResources | null): void {
  latest = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('game:resources', next)
  }
  setTrayDetail(
    next ? `内存 ${formatMemory(next.memoryMb)}${next.cpuPercent !== null ? ` · CPU ${next.cpuPercent}%` : ''}` : null
  )
}

async function sample(): Promise<void> {
  if (sampling) return
  sampling = true
  try {
    const info = getGameProcessInfo()
    if (!info) return
    const raw = await sampleProcess(info.pid).catch(() => null)
    if (!raw || !getGameProcessInfo()) return
    const now = Date.now()
    let cpuPercent: number | null = null
    if (raw.cpuPercent !== undefined) {
      cpuPercent = raw.cpuPercent
    } else if (raw.cpuSeconds !== undefined) {
      if (previous && now > previous.at) {
        const used = raw.cpuSeconds - previous.cpuSeconds
        cpuPercent = (used / ((now - previous.at) / 1000) / Math.max(1, cpus().length)) * 100
      }
      previous = { cpuSeconds: raw.cpuSeconds, at: now }
    }
    publish({
      memoryMb: Math.round(raw.rss / 1024 / 1024),
      maxMemoryMb: info.maxMemory,
      cpuPercent: cpuPercent === null ? null : Math.max(0, Math.min(100, Math.round(cpuPercent))),
      at: now
    })
  } finally {
    sampling = false
  }
}

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
  previous = null
  if (latest) publish(null)
}

export function setupGameMonitor(): void {
  onGameStatusChange((next) => {
    if (next.state === 'running') {
      if (timer) return
      previous = null
      void sample()
      timer = setInterval(() => void sample(), INTERVAL)
    } else if (next.state !== 'launching') {
      stop()
    }
  })
}

/** 最近一次读取的游戏资源占用（游戏没有运行时为 null） */
export function getGameResources(): GameResources | null {
  return latest
}
