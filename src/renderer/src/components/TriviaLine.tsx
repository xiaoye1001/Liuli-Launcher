import { useState } from 'react'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { pickTrivia } from '../utils/trivia'

/** 主页的「今日冷知识」：每天一条，点右边的按钮换一条 */
function TriviaLine(): JSX.Element {
  const [text, setText] = useState(() => pickTrivia())
  return (
    <div className="mt-2 flex items-start gap-1.5 text-xs text-white/50">
      <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-amber-300" />
      <span className="min-w-0">
        <span className="text-white/60">今日冷知识：</span>
        {text}
      </span>
      <button
        onClick={() => setText((prev) => pickTrivia(new Date(), prev))}
        title="换一条"
        aria-label="换一条冷知识"
        className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/70"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  )
}

export default TriviaLine
