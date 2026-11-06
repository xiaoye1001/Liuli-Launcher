/**
 * 卡顿报告：游戏结束后，根据这次的游戏日志和资源占用，说说卡不卡、为什么卡、可以怎么办。
 * - 日志：内置服务器跟不上（Can't keep up! … Running 2034ms or 40 ticks behind）、内存用完（OutOfMemoryError）、
 *   连接超时
 * - 资源：游戏运行时每 5 秒读一次资源监控的最新数据（内存峰值、CPU 平均和满载时间）
 * 游戏不会在日志里记帧数，所以这里看的是服务器和资源；只是旁观游戏状态，不影响启动
 */
import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { totalmem } from 'os'
import { dirname, join } from 'path'
import { getGameLogs, onGameStatusChange } from './launch'
import { getGameResources } from './gameMonitor'
import type { LagReport, LagTip } from '../shared/types'

const FILE = join(app.getPath('userData'), 'lag-reports.json')
const MAX_REPORTS = 30
const SAMPLE_INTERVAL = 5000
/** 玩了不到这么久、也没发现问题的不记 */
const MIN_SESSION = 60 * 1000

interface Samples {
  count: number
  peakMemoryMb: number
  maxMemoryMb: number
  cpuSum: number
  cpuCount: number
  cpuHigh: number
}

export interface LogFindings {
  lagCount: number
  lagMaxMs: number
  lagTicks: number
  oom: boolean
  timeouts: number
}

/** 从游戏日志里找卡顿、内存不足、连接超时 */
export function analyzeLagLogs(lines: string[]): LogFindings {
  const found: LogFindings = { lagCount: 0, lagMaxMs: 0, lagTicks: 0, oom: false, timeouts: 0 }
  for (const line of lines) {
    const lag = /Can't keep up! Is the server overloaded\? Running (\d{1,9})ms or (\d{1,9}) ticks behind/.exec(line)
    if (lag) {
      found.lagCount++
      found.lagMaxMs = Math.max(found.lagMaxMs, Number(lag[1]))
      found.lagTicks += Number(lag[2])
      continue
    }
    if (line.includes('java.lang.OutOfMemoryError')) found.oom = true
    else if (/\b(Timed out|Read timed out|Connection timed out)\b/.test(line)) found.timeouts++
  }
  return found
}

/** 根据日志和资源占用判断这次卡不卡，给出建议 */
export function buildLagReport(
  base: { versionId: string; start: number; end: number; crashed: boolean },
  logs: LogFindings,
  samples: Samples | null,
  systemMemoryMb: number
): LagReport {
  const avgCpu = samples && samples.cpuCount > 0 ? Math.round(samples.cpuSum / samples.cpuCount) : null
  const highCpuShare = samples && samples.cpuCount > 0 ? samples.cpuHigh / samples.cpuCount : 0
  const peakMemoryMb = samples && samples.count > 0 ? samples.peakMemoryMb : null
  const tips: LagTip[] = []
  if (logs.oom) tips.push('oom')
  if (logs.lagCount > 0) tips.push('simulation')
  if (highCpuShare >= 0.5) tips.push('cpu')
  if (peakMemoryMb !== null && systemMemoryMb > 0 && peakMemoryMb >= systemMemoryMb * 0.85) tips.push('memory')
  if (logs.timeouts > 0) tips.push('network')
  const bad = logs.oom || logs.lagCount >= 10 || logs.lagMaxMs >= 5000
  const some = logs.lagCount > 0 || logs.timeouts > 0 || tips.length > 0
  return {
    id: `${base.start}`,
    ...base,
    ...logs,
    peakMemoryMb,
    maxMemoryMb: samples?.maxMemoryMb ?? 0,
    systemMemoryMb,
    avgCpu,
    highCpuShare: Math.round(highCpuShare * 100) / 100,
    level: bad ? 'bad' : some ? 'some' : 'good',
    tips,
    seen: false
  }
}

let reports: LagReport[] | null = null
let writing: Promise<void> = Promise.resolve()

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const TIPS: LagTip[] = ['oom', 'simulation', 'cpu', 'memory', 'network']

async function load(): Promise<LagReport[]> {
  if (reports) return reports
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf-8')) as { reports?: unknown }
    reports = (Array.isArray(raw.reports) ? raw.reports : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof r.versionId === 'string')
      .map(
        (r): LagReport => ({
          id: String(r.id ?? r.start),
          versionId: String(r.versionId).slice(0, 128),
          start: num(r.start),
          end: num(r.end),
          crashed: r.crashed === true,
          lagCount: num(r.lagCount),
          lagMaxMs: num(r.lagMaxMs),
          lagTicks: num(r.lagTicks),
          oom: r.oom === true,
          timeouts: num(r.timeouts),
          peakMemoryMb: r.peakMemoryMb === null ? null : num(r.peakMemoryMb),
          maxMemoryMb: num(r.maxMemoryMb),
          systemMemoryMb: num(r.systemMemoryMb),
          avgCpu: r.avgCpu === null ? null : num(r.avgCpu),
          highCpuShare: num(r.highCpuShare),
          level: (r.level === 'bad' || r.level === 'some' ? r.level : 'good') as LagReport['level'],
          tips: (Array.isArray(r.tips) ? r.tips : []).filter((t): t is LagTip => TIPS.includes(t as LagTip)),
          seen: r.seen === true
        })
      )
      .slice(-MAX_REPORTS)
  } catch {
    reports = []
  }
  return reports ?? []
}

function save(): void {
  const data = JSON.stringify({ reports: reports ?? [] })
  writing = writing
    .then(async () => {
      await mkdir(dirname(FILE), { recursive: true })
      await writeFile(`${FILE}.tmp`, data)
      await rename(`${FILE}.tmp`, FILE)
    })
    .catch((e) => console.warn('保存卡顿报告失败：', e))
}

/** 最近的卡顿报告（新的在前） */
export async function listLagReports(): Promise<LagReport[]> {
  return [...(await load())].reverse()
}

export async function markLagReportSeen(id: unknown): Promise<void> {
  const list = await load()
  const report = list.find((r) => r.id === String(id))
  if (report && !report.seen) {
    report.seen = true
    save()
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let samples: Samples | null = null
let session: { versionId: string; start: number } | null = null

function sample(): void {
  const r = getGameResources()
  if (!r || !samples) return
  samples.count++
  samples.peakMemoryMb = Math.max(samples.peakMemoryMb, r.memoryMb)
  if (r.maxMemoryMb > 0) samples.maxMemoryMb = r.maxMemoryMb
  if (r.cpuPercent !== null) {
    samples.cpuSum += r.cpuPercent
    samples.cpuCount++
    if (r.cpuPercent >= 90) samples.cpuHigh++
  }
}

export function setupLagReports(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'launching' && previous !== 'launching') {
      session = { versionId: next.versionId, start: next.startedAt ?? Date.now() }
    }
    if (next.state === 'running' && !timer) {
      samples = { count: 0, peakMemoryMb: 0, maxMemoryMb: 0, cpuSum: 0, cpuCount: 0, cpuHigh: 0 }
      timer = setInterval(sample, SAMPLE_INTERVAL)
    }
    const ended = next.state === 'exited' || next.state === 'crashed'
    if (!ended) return
    if (timer) clearInterval(timer)
    timer = null
    const current = session
    const collected = samples
    session = null
    samples = null
    if (!current) return
    const end = Date.now()
    const logs = analyzeLagLogs(getGameLogs())
    const report = buildLagReport(
      { versionId: current.versionId, start: current.start, end, crashed: next.state === 'crashed' },
      logs,
      collected,
      Math.round(totalmem() / 1024 / 1024)
    )
    if (end - current.start < MIN_SESSION && report.level === 'good') return
    void load()
      .then((list) => {
        list.push(report)
        if (list.length > MAX_REPORTS) list.splice(0, list.length - MAX_REPORTS)
        save()
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('lagReport:new', report)
        }
      })
      .catch((e) => console.warn('记录卡顿报告失败：', e))
  })
}
