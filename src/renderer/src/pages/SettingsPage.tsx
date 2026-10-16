import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Coffee, Loader2, RefreshCw } from 'lucide-react'
import type { JavaInfo } from '../../../preload/index.d'

function SettingsPage(): JSX.Element {
  const [javaList, setJavaList] = useState<JavaInfo[]>([])
  const [selected, setSelected] = useState<string>('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  const scan = async (): Promise<void> => {
    setScanning(true)
    setError('')
    try {
      const list = await window.api.scanJava()
      setJavaList(list)
      if (list.length > 0 && !list.some((j) => j.path === selected)) {
        setSelected(list[0].path)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto pr-1">
      <h1 className="text-3xl font-bold tracking-tight">设置</h1>

      <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Coffee className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="text-lg font-semibold">Java 运行环境</h2>
              <p className="text-xs text-white/50">自动扫描本机已安装的 Java，点击选择用于启动游戏的版本</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? '扫描中...' : '重新扫描'}
          </motion.button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {error && (
            <div className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">扫描失败：{error}</div>
          )}
          {!scanning && !error && javaList.length === 0 && (
            <div className="rounded-xl bg-black/20 px-4 py-6 text-center text-sm text-white/50">
              未找到任何 Java，请先安装 Java 17 或 Java 21
            </div>
          )}
          <AnimatePresence>
            {javaList.map((java, index) => {
              const active = java.path === selected
              return (
                <motion.button
                  key={java.path}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelected(java.path)}
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/15'
                      : 'border-white/5 bg-black/20 hover:bg-black/30'
                  }`}
                >
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-lg font-bold">
                    {java.majorVersion}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Java {java.version}</div>
                    <div className="truncate font-mono text-xs text-white/50" title={java.path}>
                      {java.path}
                    </div>
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </section>
    </div>
  )
}

export default SettingsPage
