import { useEffect, useState } from 'react'
import { ACHIEVEMENTS, isAchievementId, type AchievementId } from '../../../shared/achievements'
import { ACHIEVEMENT_ICONS } from '../utils/achievementIcons'

/** 每个提示显示多久 */
const SHOW_MS = 5000

/**
 * 解锁成就时右上角弹出的「达成进度！」提示（Minecraft 进度提示的样式，深色底黄字，浅色模式也不变）。
 * 同时解锁多个时排队一个个显示；启动器窗口隐藏时（例如游戏运行中）等窗口出现后再显示。点一下关闭
 */
function AchievementToast(): JSX.Element | null {
  const [queue, setQueue] = useState<AchievementId[]>([])

  useEffect(
    () =>
      window.api.onAchievementUnlocked((id) => {
        if (isAchievementId(id)) setQueue((q) => (q.includes(id) ? q : [...q, id]))
      }),
    []
  )

  const current = queue[0]
  useEffect(() => {
    if (!current) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = (): void => {
      timer = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS)
    }
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onVisible)
      start()
    }
    if (document.visibilityState === 'visible') start()
    else document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [current])

  if (!current) return null
  const achievement = ACHIEVEMENTS.find((a) => a.id === current)!
  const Icon = ACHIEVEMENT_ICONS[current]
  return (
    <button
      key={current}
      type="button"
      role="status"
      onClick={() => setQueue((q) => q.slice(1))}
      title="点击关闭"
      className="animate-slide-in fixed right-4 top-12 z-[60] flex w-72 items-center gap-3 rounded-md border-2 border-[#5a5a5a] bg-[#212121] px-3 py-2.5 text-left shadow-2xl"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#3a3a3a]">
        <Icon className="h-6 w-6 text-[#ffff55]" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-[#ffff55]">达成进度！</div>
        <div className="truncate text-sm text-[#fff]">{achievement.title}</div>
      </div>
    </button>
  )
}

export default AchievementToast
