import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Coffee, Info, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { cleanIpcError } from '../utils/downloads'
import type { JavaCheckReport, JavaIssue } from '../../../shared/types'

function IssueLine({ issue }: { issue: JavaIssue }): JSX.Element {
  const style =
    issue.level === 'error'
      ? { Icon: XCircle, color: 'text-rose-300' }
      : issue.level === 'warning'
        ? { Icon: AlertTriangle, color: 'text-amber-300' }
        : { Icon: Info, color: 'text-sky-300' }
  return (
    <div className="flex items-start gap-2 text-sm">
      <style.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.color}`} />
      <span className="text-white/80">{issue.message}</span>
    </div>
  )
}

/** 百宝箱：Java 环境深度检测 */
function JavaCheckPanel(): JSX.Element {
  const [report, setReport] = useState<JavaCheckReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      setReport(await window.api.checkJavaEnvironment())
    } catch (e) {
      setError(cleanIpcError(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void run()
  }, [])

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Coffee className="h-5 w-5 text-orange-300" />
            Java 环境深度检测
          </h2>
          <p className="truncate text-xs text-white/50">
            {report ? report.system : '检查本机所有 Java 的版本、位数、架构和兼容性'}
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新检测
        </button>
      </div>

      {error && <div className="mt-3 rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200">{error}</div>}
      {!report && busy && <div className="py-8 text-center text-sm text-white/50">正在检测，需要几秒钟…</div>}

      {report && (
        <>
          {/* 总结 */}
          <div className="mt-4 space-y-1.5 rounded-xl bg-black/20 px-4 py-3">
            {report.issues.map((issue, i) => (
              <IssueLine key={i} issue={issue} />
            ))}
            <div className="pt-1 text-xs text-white/40">
              {report.javaAuto
                ? '已开启「自动选择 Java」：启动时按版本自动挑选，没有时自动下载'
                : '使用设置里手动选择的 Java'}
            </div>
          </div>

          {/* 每个 Java */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {report.javas.map((java) => (
              <div key={java.path} className="rounded-xl bg-black/20 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">Java {java.majorVersion}</span>
                  <span className="text-xs text-white/50">{java.version}</span>
                  {java.selected && (
                    <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-200">
                      当前使用
                    </span>
                  )}
                  {java.managed && (
                    <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-200">启动器下载</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {[java.vendor || '未知发行方', java.bits ? `${java.bits} 位` : '', java.arch]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="mt-1 truncate text-xs text-white/40" title={java.path}>
                  {java.path}
                </div>
                <div className="mt-2 text-xs text-white/70">适合：{java.suitable}</div>
                {java.issues.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {java.issues.map((issue, i) => (
                      <IssueLine key={i} issue={issue} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    正常
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 已安装版本的需求 */}
          {report.versions.length > 0 && (
            <div className="mt-3 rounded-xl bg-black/20 px-4 py-3">
              <div className="mb-2 text-sm font-medium">已安装的版本</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {report.versions.map((v) => (
                  <div key={v.versionId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-white/70" title={v.versionId}>
                      {v.versionId}
                    </span>
                    <span className={`shrink-0 ${v.satisfied ? 'text-emerald-300' : 'text-amber-300'}`}>
                      需要 Java {v.required}
                      {v.required <= 8 ? '' : '+'} · {v.satisfied ? '已有' : report.javaAuto ? '启动时下载' : '缺少'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default JavaCheckPanel
