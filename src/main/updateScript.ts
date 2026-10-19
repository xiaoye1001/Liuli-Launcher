/**
 * 自动更新日志的解析。不依赖 Electron，便于测试。
 * 日志格式：[时间] STARTED <标记> v<版本> … [时间] DONE（成功）或 [时间] ERROR <原因>（失败）
 */

/** 上次更新的结果（日志中最后一次更新的记录） */
export interface UpdateLogResult {
  ok: boolean
  version: string
  error?: string
}

/** 从日志中读取最后一次更新的结果；已经提示过（REPORTED）或没有记录时返回 null */
export function parseUpdateLog(text: string): UpdateLogResult | null {
  const lines = text.split(/\r?\n/).filter(Boolean)
  let start = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\] STARTED /.test(lines[i])) {
      start = i
      break
    }
  }
  if (start < 0) return null
  const block = lines.slice(start)
  if (block.some((l) => /\] REPORTED$/.test(l))) return null
  const version = /STARTED \S+ v(\S+)/.exec(block[0])?.[1] ?? ''
  // 文件替换成功就算更新成功（之后打开失败时，用户手动打开的已经是新版本）
  if (block.some((l) => /\] DONE$/.test(l))) return { ok: true, version }
  const error = block.find((l) => /\] ERROR /.test(l))?.replace(/^.*?\] ERROR /, '')
  if (error) return { ok: false, version, error }
  // 脚本没有运行完（例如被结束了）
  return { ok: false, version, error: '更新没有完成' }
}
