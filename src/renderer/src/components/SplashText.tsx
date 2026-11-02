import { useState } from 'react'
import { pickSplash } from '../utils/splash'

/**
 * 主页标题旁的闪烁标语（像 Minecraft 主菜单的黄字）：出现时跳动几下就停，点一下换一句。
 * 不一直跳动：启动器放着不动时不占用 CPU
 */
function SplashText({ greeting }: { greeting?: string }): JSX.Element {
  // 生日当天先显示祝福，点一下换成普通的
  const [text, setText] = useState(() => greeting ?? pickSplash())
  const [round, setRound] = useState(0)
  return (
    <button
      type="button"
      onClick={() => {
        setText((prev) => pickSplash(new Date(), prev))
        setRound((r) => r + 1)
      }}
      title="点一下换一句"
      className="absolute right-6 top-6 max-w-[42%] -rotate-12 select-none"
    >
      {/* 换一句时重新挂载，重新播放跳动动画 */}
      <span
        key={round}
        className="splash-pulse block truncate text-base font-bold text-amber-300 drop-shadow-[2px_2px_0_rgba(0,0,0,0.35)]"
      >
        {text}
      </span>
    </button>
  )
}

export default SplashText
