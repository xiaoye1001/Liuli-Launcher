import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6']

/** 生日当天主页飘下的彩带：只播放一次，几秒后自动移除（不会一直占用 CPU），不挡鼠标 */
function BirthdayConfetti(): JSX.Element | null {
  const [visible, setVisible] = useState(true)
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 1.8,
        drift: (Math.random() - 0.5) * 160,
        rotate: 360 + Math.random() * 720,
        color: COLORS[i % COLORS.length],
        wide: Math.random() < 0.5
      })),
    []
  )
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 block rounded-sm"
          style={
            {
              left: `${p.left}%`,
              width: p.wide ? 10 : 6,
              height: p.wide ? 6 : 12,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--confetti-drift': `${p.drift}px`,
              '--confetti-rotate': `${p.rotate}deg`
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export default BirthdayConfetti
