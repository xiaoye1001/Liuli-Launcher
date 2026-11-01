import { useEffect, useState } from 'react'
import { Lock, Trophy } from 'lucide-react'
import { LoadingState } from './EmptyState'
import { ACHIEVEMENT_ICONS } from '../utils/achievementIcons'
import type { AchievementStatus } from '../../../shared/achievements'

/** 百宝箱：启动器成就（解锁的显示日期，累计类的显示进度） */
function AchievementsPanel(): JSX.Element {
  const [list, setList] = useState<AchievementStatus[] | null>(null)

  useEffect(() => {
    const load = (): void => void window.api.getAchievements().then(setList)
    load()
    // 打开着这一页时解锁了新成就：刷新
    return window.api.onAchievementUnlocked(load)
  }, [])

  const box = 'rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl'
  if (!list) {
    return (
      <section className={box}>
        <LoadingState />
      </section>
    )
  }
  const done = list.filter((a) => a.unlockedAt).length

  return (
    <section className={`${box} space-y-4`}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="h-5 w-5 text-amber-300" />
            启动器成就
          </h2>
          <p className="text-xs text-white/50">在启动器里玩游戏时自动解锁</p>
        </div>
        <div className="w-40 shrink-0 text-right">
          <div className="text-sm font-medium">
            已解锁 {done} / {list.length}
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-black/20">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${(done / list.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {list.map((a) => {
          const Icon = ACHIEVEMENT_ICONS[a.id]
          const unlocked = !!a.unlockedAt
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3 rounded-xl px-3 py-3 ${unlocked ? 'bg-amber-500/10' : 'bg-black/20'}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  unlocked ? 'bg-amber-500/20' : 'bg-black/20'
                }`}
              >
                {unlocked ? <Icon className="h-5 w-5 text-amber-300" /> : <Lock className="h-4 w-4 text-white/30" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-medium ${unlocked ? '' : 'text-white/60'}`}>{a.title}</div>
                <div className="text-xs text-white/50">{a.desc}</div>
                {unlocked ? (
                  <div className="mt-1 text-[11px] text-white/40">
                    {new Date(a.unlockedAt!).toLocaleDateString('zh-CN')} 解锁
                  </div>
                ) : (
                  a.progress && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 rounded-full bg-black/20">
                        <div
                          className="h-full rounded-full bg-white/40"
                          style={{ width: `${(a.progress.current / a.progress.target) * 100}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] text-white/40">
                        {Math.floor(a.progress.current)} / {a.progress.target}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default AchievementsPanel
