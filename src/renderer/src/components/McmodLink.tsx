import { BookOpen } from 'lucide-react'

/** MC百科的搜索地址：按模组的英文名搜索最准确 */
export function mcmodSearchUrl(name: string): string {
  return `https://search.mcmod.cn/s?key=${encodeURIComponent(name.trim())}`
}

/** 「MC百科」按钮：在 MC百科 查看模组的中文介绍、合成表和教程 */
function McmodLink({ name, label = true }: { name: string; label?: boolean }): JSX.Element | null {
  if (!name.trim()) return null
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        window.open(mcmodSearchUrl(name), '_blank')
      }}
      title={`在 MC百科 查看「${name}」的中文介绍、合成表和教程`}
      aria-label={`在 MC百科 查看 ${name}`}
      className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
    >
      <BookOpen className="h-3.5 w-3.5" />
      {label && 'MC百科'}
    </button>
  )
}

export default McmodLink
