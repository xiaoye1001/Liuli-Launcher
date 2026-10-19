import type { CrashAnalysis, CrashCause } from '../shared/types'

/** 分析时需要的环境信息 */
export interface CrashContext {
  /** 本次启动使用的 Java 主版本号 */
  javaMajor?: number
  /** 本次启动分配的最大内存（MB） */
  maxMemory?: number
  /** 是否在版本设置里填写了附加的 JVM 参数 */
  customJvmArgs?: boolean
}

export interface CrashTexts {
  /** 游戏输出（启动器收集的标准输出） */
  log: string
  /** 崩溃报告 crash-reports/crash-*.txt */
  crashReport?: string
  /** Java 虚拟机崩溃日志 hs_err_pid*.log */
  nativeLog?: string
}

const MAX_NAMES = 12

/** 去重并限制数量 */
function unique(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, MAX_NAMES)
}

/** 取出所有匹配的第一个分组 */
function all(text: string, re: RegExp, group = 1): string[] {
  const result: string[] = []
  for (const match of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
    if (match[group]) result.push(match[group])
  }
  return result
}

/** Fabric 依赖描述里的名字："mod 'Fabric API' (fabric-api)" → "Fabric API (fabric-api)" */
function cleanDepName(text: string): string {
  return text
    .replace(/^(any version|version \S+|versions? .+?) of /, '')
    .replace(/^mod /, '')
    .replace(/'/g, '')
    .trim()
}

/** 各条识别规则，按优先级排列；每条规则最多产生一个原因 */
type Rule = (all: string, texts: CrashTexts, ctx: CrashContext) => CrashCause | null

const rules: Rule[] = [
  // 手动按 F3 + C 触发的调试崩溃
  (text) =>
    /Manually triggered debug crash/.test(text)
      ? {
          title: '手动触发的调试崩溃',
          detail: '在游戏中按住 F3 + C 超过 10 秒会主动让游戏崩溃，用于调试。',
          suggestions: ['这不是错误，重新启动游戏即可。']
        }
      : null,

  // Java 版本过低：类文件版本高于当前 Java 支持的版本
  (text, _t, ctx) => {
    const match =
      /class file version (\d+)(?:\.\d+)?\)?,? this version of the Java Runtime only recognizes class file versions up to (\d+)/.exec(
        text
      )
    const fabricJava = /requires (?:any version|version (\S+)) of (?:'Java'|java|'OpenJDK)/i.exec(text)
    if (!match && !fabricJava && !/UnsupportedClassVersionError/.test(text)) return null
    const need = match ? Number(match[1]) - 44 : undefined
    const have = match ? Number(match[2]) - 44 : ctx.javaMajor
    return {
      title: 'Java 版本过低',
      detail: need
        ? `游戏或模组需要 Java ${need} 或更高版本，本次使用的是 Java ${have ?? '（未知）'}。`
        : `游戏或模组需要更高版本的 Java${have ? `，本次使用的是 Java ${have}` : ''}。`,
      suggestions: ['在该版本的「版本设置」中把 Java 改为「自动选择」，启动器会下载合适的 Java。'],
      action: 'versionSettings'
    }
  },

  // Java 版本过高：旧版 Forge / LaunchWrapper 只能在 Java 8 上运行
  (text, _t, ctx) => {
    const tooNew =
      /AppClassLoader cannot be cast to (?:class )?java\.net\.URLClassLoader/.test(text) ||
      /Unsupported class file major version (\d+)/.test(text) ||
      /Unsupported major\.minor version/.test(text) ||
      /java\.lang\.IllegalArgumentException: Unsupported class file major version/.test(text)
    if (!tooNew) return null
    return {
      title: 'Java 版本过高',
      detail: `这个版本（通常是旧版 Forge 或较老的模组）不支持新版 Java${ctx.javaMajor ? `，本次使用的是 Java ${ctx.javaMajor}` : ''}。1.16.5 及更早的 Forge 一般需要 Java 8。`,
      suggestions: ['在该版本的「版本设置」中把 Java 改为「自动选择」，或指定 Java 8。'],
      action: 'versionSettings'
    }
  },

  // 分配的内存超过可用内存，Java 无法启动
  (text, _t, ctx) =>
    /Could not reserve enough space for (?:\d+\w* )?object heap|Invalid maximum heap size|There is insufficient memory for the Java Runtime Environment|Native memory allocation \((?:mmap|malloc)\) failed/.test(
      text
    )
      ? {
          title: '可用内存不足，Java 无法分配内存',
          detail: `游戏需要的内存超过了电脑当前可用的内存${ctx.maxMemory ? `（本次分配 ${ctx.maxMemory} MB）` : ''}，或使用了 32 位的 Java。`,
          suggestions: [
            '关闭其他占用内存的程序后重试。',
            '在「设置」或该版本的「版本设置」中适当调低游戏内存。',
            '确认使用的是 64 位 Java（开启「自动选择 Java」即可）。'
          ],
          action: 'versionSettings'
        }
      : null,

  // 游戏运行中内存不足
  (text, _t, ctx) =>
    /java\.lang\.OutOfMemoryError/.test(text)
      ? {
          title: '游戏内存不足',
          detail: `游戏用完了分配的内存${ctx.maxMemory ? `（${ctx.maxMemory} MB）` : ''}。模组多、光影或高渲染距离都需要更多内存。`,
          suggestions: ['在该版本的「版本设置」中调高游戏内存，整合包一般建议 6 ~ 8 GB。', '降低渲染距离或关闭光影。'],
          action: 'versionSettings'
        }
      : null,

  // 附加的 JVM 参数无效
  (text, _t, ctx) => {
    const option = /Unrecognized VM option '([^']+)'|Unrecognized option: (\S+)/.exec(text)
    if (!option) return null
    return {
      title: 'JVM 参数无效',
      detail: `Java 无法识别参数「${option[1] ?? option[2]}」，所以没能启动。`,
      suggestions: [
        ctx.customJvmArgs
          ? '检查该版本「版本设置」→「高级」中的 JVM 参数，删掉无效的参数。'
          : '如果使用了其他 Java，请改为「自动选择 Java」。'
      ],
      action: 'versionSettings'
    }
  },

  // Fabric / Quilt：缺少前置模组
  (text) => {
    const lines = text.split(/\r?\n/).filter((l) => /requires .+ which is missing/.test(l))
    const installs = all(text, /^\s*-\s*Install ([^,\n]+), (?:any version|version [^\n.]+)/m)
    if (lines.length === 0 && installs.length === 0) return null
    // 「Install xxx」给出的是模组 ID，更准确；没有时再从「requires ... which is missing」里取
    const missing = unique(
      installs.length > 0
        ? installs
        : lines.map((l) => cleanDepName(/requires (.+?), which is missing/.exec(l)?.[1] ?? ''))
    )
    const requesters = unique(lines.map((l) => /Mod '([^']+)'/.exec(l)?.[1] ?? ''))
    // 缺少的是 Minecraft 或 Java 时属于版本不匹配，交给下一条规则
    if (missing.every((m) => /^(minecraft|java)\b/i.test(m))) return null
    return {
      title: '缺少前置模组',
      detail: `${requesters.length ? `${requesters.join('、')} ` : '部分模组'}需要的前置模组没有安装。`,
      mods: missing,
      suggestions: ['在「下载 → Mod」中搜索并安装上面列出的前置模组（注意选择与游戏版本匹配的版本）。'],
      action: 'versions'
    }
  },

  // Fabric / Quilt：模组与 Minecraft 版本或其他模组不兼容
  (text) => {
    const lines = text
      .split(/\r?\n/)
      .filter(
        (l) =>
          /requires .*(?:minecraft|'Minecraft').*(?:wrong version|which is missing)/i.test(l) ||
          /is incompatible with/.test(l) ||
          /Replace mod '/.test(l)
      )
    if (lines.length === 0) return null
    const mods = unique(lines.map((l) => /(?:Mod|Replace mod) '([^']+)'/.exec(l)?.[1] ?? ''))
    const versionMismatch = lines.some((l) => /minecraft/i.test(l))
    return {
      title: versionMismatch ? '模组与游戏版本不匹配' : '模组之间不兼容',
      detail: versionMismatch
        ? '有模组不适用于当前的 Minecraft 版本。'
        : '有模组声明了与其他模组不兼容，不能同时安装。',
      mods,
      suggestions: versionMismatch
        ? ['在该版本的「模组」中删除这些模组，或换成适用于当前游戏版本的版本。']
        : ['在该版本的「模组」中禁用冲突的其中一个模组。'],
      action: 'versions'
    }
  },

  // Forge / NeoForge：缺少前置或版本不对
  (text) => {
    const deps = [
      ...text.matchAll(
        /Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']*)', Actual version: '([^']*)'/g
      )
    ]
    const legacy = [...text.matchAll(/MissingModsException: Mod (.+?) \(([\w-]+)\) requires \[([^\]]+)\]/g)]
    if (deps.length === 0 && legacy.length === 0) return null
    const missing = deps.filter((d) => d[4] === '[MISSING]')
    const wrong = deps.filter((d) => d[4] !== '[MISSING]')
    const mods = unique([
      ...missing.map((d) => d[1]),
      ...wrong.map((d) => `${d[1]}（需要 ${d[3]}，当前 ${d[4]}）`),
      ...legacy.map((d) => d[3])
    ])
    const requesters = unique([...deps.map((d) => d[2]), ...legacy.map((d) => d[1])])
    const onlyVersions = missing.length === 0 && legacy.length === 0
    return {
      title: onlyVersions ? '模组依赖的版本不匹配' : '缺少前置模组',
      detail: `${requesters.join('、')} 需要的模组${onlyVersions ? '版本不对' : '没有安装或版本不对'}。`,
      mods,
      suggestions: [
        '在「下载 → Mod」中安装缺少的前置模组，或更新到要求的版本。',
        '如果需要的是 minecraft / forge / neoforge 的其他版本，说明这个模组不适用于当前的游戏或加载器版本。'
      ],
      action: 'versions'
    }
  },

  // 重复的模组
  (text) => {
    const forge = [...text.matchAll(/Mod ID:? '([^']+)' from mod files: ([^\n]+)/g)].map(
      (m) => `${m[1]}：${m[2].trim()}`
    )
    // Fabric 的格式；Forge 的格式已经识别到时不再重复匹配
    const fabric =
      forge.length > 0
        ? []
        : [
            ...all(text, /duplicate mods?(?: found)?:?[ \t]*'?([\w\-.]{2,})/i),
            ...all(text, /Mod ID '([^']+)' is provided by multiple/)
          ]
    if (forge.length === 0 && fabric.length === 0) return null
    return {
      title: '安装了重复的模组',
      detail: '同一个模组安装了多份（可能是不同版本），游戏无法同时加载。',
      mods: unique([...forge, ...fabric]),
      suggestions: ['在该版本的「模组」中删除多余的那一份，只保留一个版本。'],
      action: 'versions'
    }
  },

  // OptiFine 与 Forge 版本不兼容
  (text) =>
    /optifine/i.test(text) &&
    /(NoSuchMethodError|NoSuchFieldError|ClassNotFoundException|NoClassDefFoundError)[^\n]*(net\.minecraft|net\.optifine|net\.minecraftforge)/.test(
      text
    ) &&
    /net\.optifine|optifine\./i.test(text)
      ? {
          title: 'OptiFine 与 Forge 版本不兼容',
          detail: 'OptiFine 只兼容特定版本的 Forge，版本不匹配时会在启动时崩溃。',
          suggestions: [
            '重新安装该版本，选择 OptiFine 下载页注明兼容的 Forge 版本。',
            '或者删除 OptiFine，改用 Embeddium / Sodium + Oculus / Iris。'
          ],
          action: 'versions'
        }
      : null,

  // Mixin 注入失败（某个模组与游戏或其他模组冲突）
  (text) => {
    if (
      !/Mixin apply|MixinApplyError|MixinTransformerError|InvalidInjectionException|InvalidMixinException|mixin\.injection\.throwables/i.test(
        text
      )
    ) {
      return null
    }
    const mods = unique([
      ...all(text, /Mixin apply for mod ([\w\-.]+) failed/),
      ...all(text, /from mod ([\w\-.]+)\] (?:failed|from)/),
      ...all(text, /\[?([\w\-]+)\.mixins?\.json/)
    ]).filter((m) => !/^(minecraft|java)$/i.test(m))
    return {
      title: '模组注入失败（Mixin）',
      detail: '有模组修改游戏代码时失败，通常是模组版本与游戏版本不匹配，或与其他模组冲突。',
      mods,
      suggestions: [
        '把上面列出的模组更新到适用于当前游戏版本的最新版本。',
        '如果问题仍在，暂时禁用这些模组，确认是哪个模组导致的。'
      ],
      action: 'versions'
    }
  },

  // 模组初始化时出错（Forge 会写出模组名）
  (text) => {
    const caught = all(text, /Caught exception from (.+?)(?: \([\w\-.]+\))?\s*$/m)
    const suspected = suspectedMods(text)
    const mods = unique([...caught, ...suspected])
    if (mods.length === 0) return null
    return {
      title: '模组运行出错',
      detail: '崩溃报告指出是下面的模组出错导致游戏崩溃。',
      mods,
      suggestions: ['更新这些模组到最新版本，或暂时禁用它们。', '检查这些模组是否需要额外的前置模组。'],
      action: 'versions'
    }
  },

  // 显卡驱动或 OpenGL 问题
  (text, texts) => {
    const driverDll = /\b(atio6axx|atioglxx|ig[0-9a-z]*icd(?:32|64)|nvoglv(?:32|64)|amdxc64|igxelpicd64)\.dll/i.exec(
      texts.nativeLog ?? text
    )
    const opengl =
      /Pixel format not accelerated|WGL: The driver does not appear to support OpenGL|GLFW error 65542|GLFW error 65543|Couldn't set pixel format|No OpenGL context found|OpenGL 3\.2 or higher is required|LWJGLException: Could not create context/.test(
        text
      )
    if (!driverDll && !opengl) return null
    return {
      title: '显卡驱动问题',
      detail: driverDll
        ? `游戏在显卡驱动（${driverDll[1]}.dll）中崩溃。`
        : '显卡驱动不支持游戏需要的 OpenGL 版本，或驱动没有正确安装。',
      suggestions: [
        '到显卡厂商官网（NVIDIA / AMD / Intel）下载安装最新的显卡驱动。',
        '笔记本电脑请在显卡控制面板中让 Java（javaw.exe）使用独立显卡。'
      ]
    }
  },

  // 文件损坏
  (text) => {
    if (
      !/zip END header not found|invalid LOC header|Invalid or corrupt jarfile|error in opening zip file|ZipException|truncated ZIP/i.test(
        text
      )
    ) {
      return null
    }
    // 限制文件名长度，避免超长的一行（例如聊天内容）让匹配非常慢
    const jars = unique(
      all(text, /([\w\-.+][\w\-.+ ]{0,150}\.jar)/)
        .map((n) => n.trim())
        .filter((n) => !/^(client|minecraft)\.jar$/i.test(n))
    )
    return {
      title: '文件损坏',
      detail: '有游戏文件或模组文件不完整（通常是下载中断导致）。',
      mods: jars,
      suggestions: ['在「版本」页对该版本使用「检查并修复」。', '如果是模组文件损坏，删除后重新下载该模组。'],
      action: 'versions'
    }
  },

  // 本地库或主类缺失
  (text) =>
    /no lwjgl(?:64)? in java\.library\.path|Failed to locate library: lwjgl|UnsatisfiedLinkError|Could not find or load main class|ClassNotFoundException: (?:net\.minecraft\.client\.main\.Main|net\.minecraft\.launchwrapper|cpw\.mods\.modlauncher\.Launcher)/.test(
      text
    )
      ? {
          title: '游戏文件缺失',
          detail: '启动游戏需要的文件缺失或损坏。',
          suggestions: ['在「版本」页对该版本使用「检查并修复」，仍然不行时重新安装该版本。'],
          action: 'versions'
        }
      : null,

  // 磁盘空间不足
  (text) =>
    /No space left on device|There is not enough space on the disk|磁盘空间不足/.test(text)
      ? {
          title: '磁盘空间不足',
          detail: '游戏所在的磁盘已满，无法写入文件。',
          suggestions: ['清理磁盘空间后重试，或在「设置」中把游戏目录换到其他磁盘。']
        }
      : null
]

/** 崩溃报告中「Suspected Mod(s)」列出的模组 */
function suspectedMods(text: string): string[] {
  const match = /Suspected Mods?:\s*(?:\n|$)([\s\S]*?)(?:\n\s*\n|Stacktrace:)/.exec(text)
  const inline = /Suspected Mods?: ([^\n]+)/.exec(text)
  const lines = match ? match[1].split('\n') : inline ? [inline[1]] : []
  return lines
    .map((l) => l.trim().replace(/, Version: .*$/, ''))
    .filter((l) => l && !/^(NONE|Unknown|None)$/i.test(l) && !/^Minecraft\b/i.test(l))
}

/** 没识别出原因时，找出最关键的一行错误 */
function findKeyError(texts: CrashTexts): string | undefined {
  const report = texts.crashReport ?? ''
  const description = /Description: (.+)\r?\n\r?\n(.+)/.exec(report)
  if (description) return `${description[1]}：${description[2].trim()}`.slice(0, 300)
  const exception =
    /(?:^|\n)(?:Caused by: |Exception in thread "[^"]+" )?((?:[a-z][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error)(?::[^\n]*)?)/.exec(
      texts.log
    )
  return exception?.[1].trim().slice(0, 300)
}

/** 根据日志、崩溃报告与 Java 崩溃日志分析崩溃原因 */
export function analyzeCrash(texts: CrashTexts, ctx: CrashContext, exitCode: number | null): CrashAnalysis {
  const text = [texts.log, texts.crashReport ?? '', texts.nativeLog ?? ''].join('\n')
  const causes: CrashCause[] = []
  for (const rule of rules) {
    try {
      const cause = rule(text, texts, ctx)
      if (cause && !causes.some((c) => c.title === cause.title)) causes.push(cause)
    } catch {
      // 某条规则出错不影响其他规则
    }
  }
  // Windows 访问冲突且没有其他线索时，多半是显卡驱动或 Java 本身的问题
  if (causes.length === 0 && (exitCode === -1073741819 || exitCode === 3221225477) && !texts.crashReport) {
    causes.push({
      title: 'Java 进程异常终止',
      detail: '游戏进程发生了内存访问冲突（0xC0000005），常见于显卡驱动或 Java 本身的问题。',
      suggestions: ['更新显卡驱动。', '在该版本的「版本设置」中把 Java 改为「自动选择」。'],
      action: 'versionSettings'
    })
  }
  return {
    causes: causes.slice(0, 4),
    keyError: causes.length === 0 ? findKeyError(texts) : undefined,
    exitCode,
    hasCrashReport: !!texts.crashReport,
    hasNativeLog: !!texts.nativeLog
  }
}
