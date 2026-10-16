import { motion } from 'framer-motion'
import { Play } from 'lucide-react'

function HomePage(): JSX.Element {
  return (
    <div className="flex h-full flex-col justify-end">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-3xl font-bold tracking-tight">欢迎回来</h1>
        <p className="mt-2 text-sm text-white/60">选择版本后点击启动，开始你的冒险。</p>
        <div className="mt-6 flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3 font-semibold shadow-lg shadow-emerald-500/30"
          >
            <Play className="h-5 w-5 fill-current" />
            启动游戏
          </motion.button>
          <span className="text-sm text-white/40">尚未安装任何版本</span>
        </div>
      </div>
    </div>
  )
}

export default HomePage
