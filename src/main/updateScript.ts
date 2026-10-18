/**
 * Windows 免安装版的更新脚本（PowerShell）。单独放在这里，不依赖 Electron，便于测试。
 *
 * 流程：显示「正在更新」小窗口 → 等旧启动器退出 → 复制新 exe（被占用时重试）→
 * 打开新版本 → 等新窗口出现后关闭小窗口。每一步都写进日志，失败时打开旧版本，下次启动时提示原因
 */

/** PowerShell 单引号字符串 */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export interface PortableScriptOptions {
  /** 要等待退出的启动器进程 */
  pid: number
  /** 下载好的新版本 exe */
  source: string
  /** 新版本放到哪里（可能是新的文件名） */
  target: string
  /** 正在使用的旧版本 exe；和 target 不同时，替换成功后删除 */
  oldFile: string
  version: string
  logFile: string
  /** 本次更新的标记，启动器据此确认脚本已经开始运行 */
  token: string
  /** 启动器的进程名（不带 .exe），用来判断新版本的窗口是否已经出现 */
  processName: string
}

export function portableUpdateScript(o: PortableScriptOptions): string {
  return [
    `$log = ${psQuote(o.logFile)}`,
    'function Log([string]$message) {',
    `  try { Add-Content -LiteralPath $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) -Encoding UTF8 } catch {}`,
    '}',
    `Log ${psQuote(`STARTED ${o.token} v${o.version}`)}`,
    `$pidToWait = ${Math.floor(o.pid)}`,
    `$source = ${psQuote(o.source)}`,
    `$target = ${psQuote(o.target)}`,
    `$oldFile = ${psQuote(o.oldFile)}`,
    '',
    '# 小窗口：告诉用户正在更新（解压新版本需要一些时间，期间看不到启动器）',
    '$form = $null',
    'try {',
    '  Add-Type -AssemblyName System.Windows.Forms',
    '  Add-Type -AssemblyName System.Drawing',
    '  $form = New-Object System.Windows.Forms.Form',
    `  $form.Text = ${psQuote('琉璃启动器')}`,
    "  $form.FormBorderStyle = 'FixedDialog'",
    '  $form.ControlBox = $false',
    "  $form.StartPosition = 'CenterScreen'",
    '  $form.ClientSize = New-Object System.Drawing.Size(380, 90)',
    '  $form.TopMost = $true',
    '  $label = New-Object System.Windows.Forms.Label',
    `  $label.Text = ${psQuote(`正在更新到 v${o.version}，完成后会自动打开……`)}`,
    "  $label.Dock = 'Fill'",
    "  $label.TextAlign = 'MiddleCenter'",
    "  $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)",
    '  $form.Controls.Add($label)',
    '  $form.Show()',
    '  [System.Windows.Forms.Application]::DoEvents()',
    '} catch { $form = $null }',
    'function Wait-Ms([int]$ms) {',
    '  $end = (Get-Date).AddMilliseconds($ms)',
    '  while ((Get-Date) -lt $end) {',
    '    if ($form) { [System.Windows.Forms.Application]::DoEvents() }',
    '    Start-Sleep -Milliseconds 50',
    '  }',
    '}',
    '',
    '# 等旧启动器退出（最多 2 分钟）',
    '$deadline = (Get-Date).AddMinutes(2)',
    'while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Wait-Ms 300 }',
    `Log ${psQuote('启动器已退出，开始替换')}`,
    '',
    '# 免安装版的外壳程序在启动器退出后还要清理临时文件，exe 可能还被占用一会儿',
    '$ok = $false',
    "$lastError = ''",
    'for ($i = 0; $i -lt 120 -and -not $ok; $i++) {',
    '  try { Copy-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop; $ok = $true }',
    '  catch { $lastError = $_.Exception.Message; Wait-Ms 500 }',
    '}',
    '$launch = $oldFile',
    'if ($ok) {',
    '  Log ("已替换：" + $target)',
    // 新版本打开后会读取日志，所以替换完成就写 DONE
    "  Log 'DONE'",
    '  $launch = $target',
    '  Remove-Item -LiteralPath $source -ErrorAction SilentlyContinue',
    '  if ($oldFile -ne $target) {',
    '    for ($i = 0; $i -lt 60; $i++) {',
    '      try { Remove-Item -LiteralPath $oldFile -Force -ErrorAction Stop; Log ("已删除旧版本：" + $oldFile); break }',
    '      catch { Wait-Ms 500 }',
    '    }',
    '  }',
    '} else {',
    '  Log ("ERROR 替换失败：" + $lastError)',
    '}',
    '',
    'Log ("打开：" + $launch)',
    'try { Start-Process -FilePath $launch -WorkingDirectory ([System.IO.Path]::GetDirectoryName($launch)) -ErrorAction Stop }',
    'catch { Log ("ERROR 无法打开启动器：" + $_.Exception.Message) }',
    '',
    '# 等新版本的窗口出现再关闭小窗口（最多 60 秒）',
    '$end = (Get-Date).AddSeconds(60)',
    'while ((Get-Date) -lt $end) {',
    `  $shown = Get-Process -Name ${psQuote(o.processName)} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }`,
    '  if ($shown) { break }',
    '  Wait-Ms 300',
    '}',
    'if ($form) { $form.Close() }',
    'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue'
  ].join('\r\n')
}

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
