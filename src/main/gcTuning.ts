/**
 * 优化 Java 内存回收（G1）。目标：游戏流畅的前提下尽量少占内存。
 *
 * - 回收器与停顿：沿用官方启动器的 G1 参数（新生代至少 20%、预留 20%、目标停顿 50 ms、32 MB 分区），
 *   Java 8 默认的 Parallel 回收器停顿很长，这里也统一改用 G1
 * - 少占内存：
 *   · 堆的空闲部分超过 40% 时把多余的内存还给系统（默认要空闲 70% 才还），扩容时也只多留 20% 空闲
 *   · 去掉重复的字符串（游戏里有大量相同的方块、物品 ID 字符串）
 *   · Java 12 及以上：一段时间没有回收时（例如停在主菜单、切到后台）主动回收一次，把不用的内存还给系统
 * - 并行处理引用：减少回收时处理软引用、弱引用的停顿
 *
 * 自定义了回收器时不添加任何参数（同时指定两种回收器 Java 会拒绝启动），自定义的其他参数放在后面，可以覆盖这里的值。
 * 所有参数都在 Java 8 和 Java 21 上验证过可以启动；不认识的 -XX 参数 OpenJ9 会忽略。
 */

/** 用户自己指定了回收器（例如 -XX:+UseZGC、-XX:+UseShenandoahGC） */
function hasCustomCollector(customArgs: string[]): boolean {
  return customArgs.some((arg) => /^-XX:[+-]Use\w*GC$/.test(arg.trim()))
}

export function gcTuningArgs(javaMajor: number | undefined, customArgs: string[]): string[] {
  if (hasCustomCollector(customArgs)) return []
  const args = [
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+UseG1GC',
    '-XX:G1NewSizePercent=20',
    '-XX:G1ReservePercent=20',
    '-XX:MaxGCPauseMillis=50',
    '-XX:G1HeapRegionSize=32M',
    '-XX:+ParallelRefProcEnabled',
    '-XX:+UseStringDeduplication',
    '-XX:MinHeapFreeRatio=20',
    '-XX:MaxHeapFreeRatio=40'
  ]
  // 定时回收是 Java 12 新增的参数；版本未知时不加，避免旧版 Java 无法启动
  if (javaMajor !== undefined && javaMajor >= 12) args.push('-XX:G1PeriodicGCInterval=30000')
  return args
}
