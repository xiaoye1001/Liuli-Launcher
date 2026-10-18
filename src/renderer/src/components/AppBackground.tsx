import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { backgroundUrl, type Appearance } from '../utils/appearance'
import type { BackgroundFit } from '../../../shared/types'

/** 各种填充方式对应的 CSS */
const FIT_STYLES: Record<BackgroundFit, { backgroundSize: string; backgroundRepeat: string }> = {
  cover: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat' },
  contain: { backgroundSize: 'contain', backgroundRepeat: 'no-repeat' },
  stretch: { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' },
  center: { backgroundSize: 'auto', backgroundRepeat: 'no-repeat' },
  tile: { backgroundSize: 'auto', backgroundRepeat: 'repeat' }
}

/** 「每次启动随机」选中的图片：本次运行内保持不变 */
let sessionRandom = ''

function randomOf(list: string[], except?: string): string {
  const pool = list.length > 1 && except ? list.filter((n) => n !== except) : list
  return pool[Math.floor(Math.random() * pool.length)] ?? ''
}

/** 根据背景模式决定当前显示哪张图片 */
function useCurrentImage(appearance: Appearance): string {
  const { backgroundMode: mode, backgroundImages: images, backgroundImage: fixed, backgroundInterval } = appearance
  const [slide, setSlide] = useState(() => (images.includes(fixed) ? fixed : (images[0] ?? '')))
  const imagesRef = useRef(images)
  imagesRef.current = images
  /** 上一次显示的图片：切换到轮播时从这张接着往下轮，不会跳回别的图片 */
  const shown = useRef('')
  const [prevMode, setPrevMode] = useState(mode)
  if (mode !== prevMode) {
    setPrevMode(mode)
    if (mode === 'slideshow' && images.includes(shown.current)) setSlide(shown.current)
  }

  // 轮播：按背景库的顺序定时切换
  useEffect(() => {
    if (mode !== 'slideshow' || images.length < 2) return
    const minutes = Math.min(120, Math.max(1, backgroundInterval || 10))
    const timer = setInterval(() => {
      setSlide((prev) => {
        const list = imagesRef.current
        const index = list.indexOf(prev)
        return list[(index + 1) % list.length] ?? ''
      })
    }, minutes * 60_000)
    return () => clearInterval(timer)
  }, [mode, images.length, backgroundInterval])

  shown.current = pick(mode, images, fixed, slide)
  return shown.current
}

function pick(mode: Appearance['backgroundMode'], images: string[], fixed: string, slide: string): string {
  if (mode === 'off' || images.length === 0) return ''
  if (mode === 'fixed') return images.includes(fixed) ? fixed : images[0]
  if (mode === 'random') {
    if (!images.includes(sessionRandom)) sessionRandom = randomOf(images)
    return sessionRandom
  }
  return images.includes(slide) ? slide : images[0]
}

/** 启动器的背景：图片 + 模糊 + 遮罩，换图时淡入淡出 */
function AppBackground({ appearance }: { appearance: Appearance }): JSX.Element | null {
  const image = useCurrentImage(appearance)
  if (!image) return null
  const { backgroundBlur: blur, backgroundDim: dim, backgroundFit } = appearance
  const fit = FIT_STYLES[backgroundFit] ?? FIT_STYLES.cover
  return (
    <>
      <AnimatePresence initial={false}>
        <motion.div
          key={image}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0 -z-10 bg-center"
          data-background={image}
          style={{
            backgroundImage: `url("${backgroundUrl(image)}")`,
            ...fit,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            // 模糊会让边缘变透明，稍微放大以遮住
            transform: blur > 0 ? 'scale(1.08)' : undefined
          }}
        />
      </AnimatePresence>
      {/* 遮罩：深色主题下变暗，浅色主题下变亮，让文字在明亮的图片上也看得清 */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black" style={{ opacity: dim / 100 }} />
    </>
  )
}

export default AppBackground
