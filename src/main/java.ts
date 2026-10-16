import { execFile } from 'child_process'
import { readdir, realpath } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { getPotentialJavaLocations, parseJavaVersion } from '@xmcl/installer'

export interface JavaInfo {
  /** java 可执行文件的完整路径 */
  path: string
  /** 完整版本号，例如 21.0.4 */
  version: string
  /** 主版本号，例如 21 */
  majorVersion: number
}

const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java'

/** 列出某个目录下的所有子目录（目录不存在时返回空数组） */
async function listSubDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

/** 收集各平台常见的 Java 安装目录（JAVA_HOME 形式） */
async function collectJavaHomes(): Promise<string[]> {
  const roots: string[] = []
  const homes: string[] = []

  if (process.platform === 'win32') {
    const programDirs = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['ProgramW6432']
    ].filter((p): p is string => !!p)
    const vendors = ['Java', 'Eclipse Adoptium', 'Zulu', 'Microsoft', 'BellSoft', 'Amazon Corretto']
    for (const base of programDirs) {
      for (const vendor of vendors) {
        roots.push(join(base, vendor))
      }
    }
  } else if (process.platform === 'darwin') {
    for (const dir of await listSubDirs('/Library/Java/JavaVirtualMachines')) {
      homes.push(join(dir, 'Contents', 'Home'))
    }
  } else {
    roots.push('/usr/lib/jvm', '/usr/java', '/opt/java', '/opt/jdk')
  }

  // 官方启动器自带的 Java 运行时，目录结构为 runtime/<组件>/<平台>/<组件>
  const officialRuntimeDirs =
    process.platform === 'win32'
      ? [
          join(process.env['APPDATA'] ?? '', '.minecraft', 'runtime'),
          join(
            process.env['LOCALAPPDATA'] ?? '',
            'Packages',
            'Microsoft.4297127D64EC6_8wekyb3d8bbwe',
            'LocalCache',
            'Local',
            'runtime'
          )
        ]
      : process.platform === 'darwin'
        ? [join(homedir(), 'Library', 'Application Support', 'minecraft', 'runtime')]
        : [join(homedir(), '.minecraft', 'runtime')]

  for (const runtimeDir of officialRuntimeDirs) {
    for (const component of await listSubDirs(runtimeDir)) {
      const componentName = component.split(/[\\/]/).pop() ?? ''
      for (const platformDir of await listSubDirs(component)) {
        homes.push(join(platformDir, componentName))
      }
    }
  }

  for (const root of roots) {
    homes.push(...(await listSubDirs(root)))
  }

  return homes
}

/**
 * 执行 `java -version` 并解析版本号。
 * 去掉 JAVA_TOOL_OPTIONS 等环境变量，避免 "Picked up ..." 输出干扰版本解析。
 */
function resolveJava(path: string): Promise<JavaInfo | undefined> {
  const env = { ...process.env }
  delete env['JAVA_TOOL_OPTIONS']
  delete env['_JAVA_OPTIONS']
  delete env['JDK_JAVA_OPTIONS']

  return new Promise((resolve) => {
    execFile(path, ['-version'], { env, timeout: 10000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve(undefined)
        return
      }
      const output = `${stderr}\n${stdout}`
        .split(/\r?\n/)
        .filter((line) => !line.startsWith('Picked up'))
        .join('\n')
      const parsed = parseJavaVersion(output)
      resolve(parsed ? { path, version: parsed.version, majorVersion: parsed.majorVersion } : undefined)
    })
  })
}

/** 扫描本机所有可用的 Java，按主版本号从高到低排序 */
export async function scanJava(): Promise<JavaInfo[]> {
  const homes = await collectJavaHomes()
  const candidates = [
    ...homes.map((home) => join(home, 'bin', JAVA_EXE)),
    ...(await getPotentialJavaLocations().catch(() => [] as string[]))
  ]

  // 解析符号链接后去重（例如 /usr/bin/java 实际指向 /usr/lib/jvm/...）
  const unique = new Map<string, string>()
  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    const real = await realpath(trimmed).catch(() => '')
    if (!real) continue
    const key = process.platform === 'win32' ? real.toLowerCase() : real
    if (!unique.has(key)) unique.set(key, real)
  }

  const results = await Promise.all([...unique.values()].map((path) => resolveJava(path)))
  return results
    .filter((java): java is JavaInfo => java !== undefined)
    .sort((a, b) => b.majorVersion - a.majorVersion)
}
