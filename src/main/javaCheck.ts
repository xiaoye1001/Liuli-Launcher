/**
 * 百宝箱：Java 环境深度检测。
 * 对本机找到的每个 Java 运行 `java -XshowSettings:properties -version`，读出发行方、位数、CPU 架构，
 * 找出常见问题（32 位、Apple 芯片上用 Intel 版、环境变量注入参数等），并检查已安装的版本是否都有合适的 Java。
 * 环境变量只显示名称，不显示值。
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import { realpath } from 'fs/promises'
import { arch, platform, release, totalmem } from 'os'
import { Version } from '@xmcl/core'
import { getSettings } from './config'
import { resolveJava, scanJava } from './java'
import { downloadedJavaPaths, requirementOf } from './javaRuntime'
import { listInstalledVersions } from './launch'
import type { JavaCheckReport, JavaDetail, JavaInfo, JavaIssue, JavaVersionNeed } from '../shared/types'

/** 会把参数注入所有 Java 程序（包括游戏）的环境变量 */
const INJECT_ENV = ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS']

interface JavaProperties {
  vendor: string
  vmName: string
  bits: number
  arch: string
}

/** 运行 java -XshowSettings:properties -version，读出系统属性（去掉会干扰输出的环境变量） */
function readProperties(path: string): Promise<JavaProperties | null> {
  const env = { ...process.env }
  for (const name of INJECT_ENV) delete env[name]
  return new Promise((resolve) => {
    execFile(
      path,
      ['-XshowSettings:properties', '-version'],
      { env, timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null)
          return
        }
        const props = new Map<string, string>()
        for (const line of `${stderr}\n${stdout}`.split(/\r?\n/)) {
          const match = /^\s+([\w.]+) = (.*)$/.exec(line)
          if (match) props.set(match[1], match[2].trim())
        }
        const osArch = props.get('os.arch') ?? ''
        const model = Number(props.get('sun.arch.data.model'))
        resolve({
          vendor: props.get('java.vendor') ?? '',
          vmName: props.get('java.vm.name') ?? '',
          bits: model === 32 || model === 64 ? model : /64/.test(osArch) ? 64 : osArch ? 32 : 0,
          arch: osArch
        })
      }
    )
  })
}

/** 这个主版本适合运行哪些游戏版本 */
function suitableFor(major: number): string {
  if (major < 8) return '太旧，无法运行任何受支持的游戏版本'
  if (major === 8) return '1.16.5 及更早的版本（旧版 Forge 只能用 Java 8）'
  if (major < 16) return '1.16.5 及更早的原版（模组兼容性差，不推荐）'
  if (major === 16) return '1.17 ~ 1.17.1'
  if (major < 21) return '1.18 ~ 1.20.4'
  return '1.20.5 及以上（也能运行 1.18 ~ 1.20.4）'
}

/** 本机 CPU 是否是 ARM（Apple 芯片、Windows on ARM）；启动器自己在转译模式下运行时也能识别 */
function machineIsArm(): boolean {
  return process.arch === 'arm64' || app.runningUnderARM64Translation
}

function issuesOf(java: JavaInfo, props: JavaProperties | null): JavaIssue[] {
  const issues: JavaIssue[] = []
  if (!props) {
    issues.push({ level: 'warning', message: '无法读取这个 Java 的详细信息，可能已损坏' })
    return issues
  }
  if (java.majorVersion < 8) issues.push({ level: 'error', message: '版本太旧，无法运行游戏' })
  if (props.bits === 32) {
    issues.push({
      level: 'warning',
      message: '32 位 Java 最多只能使用约 1.5 GB 内存，模组版本很容易内存不足，建议改用 64 位 Java'
    })
  }
  const javaIsX64 = /^(amd64|x86_64)$/i.test(props.arch)
  if (machineIsArm() && javaIsX64) {
    issues.push({
      level: 'warning',
      message:
        process.platform === 'darwin'
          ? '这是 Intel 版 Java，在 Apple 芯片上通过 Rosetta 转译运行，性能明显较差，建议改用 arm64 版'
          : '这是 x64 版 Java，在 ARM 电脑上通过转译运行，性能较差，建议改用 arm64 版'
    })
  }
  if (/openj9/i.test(props.vmName)) {
    issues.push({ level: 'info', message: 'OpenJ9 虚拟机与部分模组不兼容，启动器的内存回收优化参数对它不生效' })
  }
  if (java.majorVersion > 8 && java.majorVersion < 16) {
    issues.push({ level: 'info', message: `Java ${java.majorVersion} 不是游戏常用的版本，建议改用 8、17 或 21` })
  }
  return issues
}

/** 版本需要的 Java 本机有没有（规则与启动时自动选择 Java 相同） */
function satisfies(javas: JavaInfo[], required: number): boolean {
  if (required <= 8) return javas.some((j) => j.majorVersion === 8)
  return javas.some((j) => j.majorVersion >= required)
}

function systemName(): string {
  const os = platform()
  const name = os === 'win32' ? 'Windows' : os === 'darwin' ? 'macOS' : os === 'linux' ? 'Linux' : os
  const cpu = machineIsArm() ? 'arm64' : arch()
  return `${name} ${release()}（${cpu}，内存 ${Math.round(totalmem() / 1024 / 1024 / 1024)} GB）`
}

async function samePath(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false
  const [x, y] = await Promise.all([realpath(a).catch(() => a), realpath(b).catch(() => b)])
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

export async function checkJavaEnvironment(): Promise<JavaCheckReport> {
  const settings = await getSettings()
  const managedPaths = await downloadedJavaPaths()
  const found = await scanJava(managedPaths)
  const managedReal = await Promise.all(managedPaths.map((p) => realpath(p).catch(() => p)))

  const javas: JavaDetail[] = await Promise.all(
    found.map(async (java) => {
      const props = await readProperties(java.path)
      const real = await realpath(java.path).catch(() => java.path)
      return {
        ...java,
        vendor: props?.vendor ?? '',
        vmName: props?.vmName ?? '',
        bits: props?.bits ?? 0,
        arch: props?.arch ?? '',
        suitable: suitableFor(java.majorVersion),
        managed: managedReal.includes(real),
        selected: !settings.javaAuto && (await samePath(settings.javaPath, java.path)),
        issues: issuesOf(java, props)
      }
    })
  )

  // 已安装的版本需要的 Java
  const versions: JavaVersionNeed[] = []
  for (const installed of await listInstalledVersions().catch(() => [])) {
    try {
      const required = requirementOf(await Version.parse(settings.gameDir, installed.id)).majorVersion
      versions.push({ versionId: installed.id, required, satisfied: satisfies(found, required) })
    } catch {
      // 版本文件损坏的版本跳过（启动时会提示）
    }
  }

  const issues: JavaIssue[] = []
  if (process.arch === 'ia32') {
    issues.push({ level: 'warning', message: '启动器运行在 32 位系统上，只能使用 32 位 Java，内存最多约 1.5 GB' })
  }
  const injected = INJECT_ENV.filter((name) => process.env[name])
  if (injected.length > 0) {
    issues.push({
      level: 'warning',
      message: `系统设置了环境变量 ${injected.join('、')}，它会给所有 Java 程序（包括游戏）添加参数，可能导致游戏无法启动或内存设置失效。如果不是自己设置的，建议删除`
    })
  }
  if (!settings.javaAuto) {
    if (!settings.javaPath) {
      issues.push({ level: 'error', message: '没有选择 Java，也没有开启「自动选择 Java」，无法启动游戏' })
    } else if (!(await resolveJava(settings.javaPath))) {
      issues.push({
        level: 'error',
        message: '设置里选择的 Java 无法运行（可能已被卸载或移动），请重新选择，或开启「自动选择 Java」'
      })
    }
  }
  if (found.length === 0) {
    issues.push(
      settings.javaAuto
        ? { level: 'info', message: '本机没有找到 Java。已开启「自动选择 Java」，启动游戏时会自动下载合适的版本' }
        : { level: 'error', message: '本机没有找到 Java，请安装 Java，或开启「自动选择 Java」' }
    )
  }
  const missing = [...new Set(versions.filter((v) => !v.satisfied).map((v) => v.required))].sort((a, b) => a - b)
  if (missing.length > 0) {
    const list = missing.map((m) => `Java ${m}`).join('、')
    issues.push(
      settings.javaAuto
        ? { level: 'info', message: `部分版本需要 ${list}，本机还没有，启动这些版本时会自动下载` }
        : { level: 'warning', message: `部分版本需要 ${list}，本机还没有。可以开启「自动选择 Java」让启动器自动下载` }
    )
  }
  if (issues.length === 0 && javas.every((j) => j.issues.every((i) => i.level === 'info'))) {
    issues.push({ level: 'info', message: '没有发现问题' })
  }

  return { system: systemName(), javaAuto: settings.javaAuto, javas, versions, issues }
}
