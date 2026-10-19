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
function useCurrentImage(appearance: Appearance, paused: boolean): string {
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

  // 轮播：按背景库的顺序定时切换（游戏运行、窗口隐藏等暂停时不切换）
  useEffect(() => {
    if (paused || mode !== 'slideshow' || images.length < 2) return
    const minutes = Math.min(120, Math.max(1, backgroundInterval || 10))
    const timer = setInterval(() => {
      setSlide((prev) => {
        const list = imagesRef.current
        const index = list.indexOf(prev)
        return list[(index + 1) % list.length] ?? ''
      })
    }, minutes * 60_000)
    return () => clearInterval(timer)
  }, [paused, mode, images.length, backgroundInterval])

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

/** 视频壁纸的填充方式（平铺对视频无意义，按填充处理） */
const VIDEO_FIT: Record<BackgroundFit, 'cover' | 'contain' | 'fill' | 'none'> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  tile: 'cover'
}

/** 背景库里的文件是不是视频 */
export function isVideoBackground(name: string): boolean {
  return /\.(mp4|webm)$/i.test(name)
}

/** 视频壁纸：循环、静音播放；暂停时停在当前画面 */
function VideoWallpaper({ name, fit, paused }: { name: string; fit: BackgroundFit; paused: boolean }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (paused) video.pause()
    else void video.play().catch(() => undefined)
  }, [paused, name])
  return (
    <video
      ref={ref}
      src={backgroundUrl(name)}
      autoPlay={!paused}
      loop
      muted
      playsInline
      className="h-full w-full"
      style={{ objectFit: VIDEO_FIT[fit] ?? 'cover' }}
    />
  )
}

/**
 * 启动器的壁纸：图片 / 视频 + 模糊 + 遮罩，换图时淡入淡出。
 * 由 DynamicBackground 放在动态背景之上、粒子之下
 */
function AppBackground({
  appearance,
  paused = false
}: {
  appearance: Appearance
  paused?: boolean
}): JSX.Element | null {
  const image = useCurrentImage(appearance, paused)
  if (!image) return null
  const { backgroundBlur: blur, backgroundDim: dim, backgroundFit } = appearance
  const fit = FIT_STYLES[backgroundFit] ?? FIT_STYLES.cover
  const video = isVideoBackground(image)
  const effects = {
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    // 模糊会让边缘变透明，稍微放大以遮住
    transform: blur > 0 ? 'scale(1.08)' : undefined
  }
  return (
    <>
      <AnimatePresence initial={false}>
        <motion.div
          key={image}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0 bg-center"
          data-background={image}
          style={video ? effects : { backgroundImage: `url("${backgroundUrl(image)}")`, ...fit, ...effects }}
        >
          {video && <VideoWallpaper name={image} fit={backgroundFit} paused={paused} />}
        </motion.div>
      </AnimatePresence>
      {/* 遮罩：深色主题下变暗，浅色主题下变亮，让文字在明亮的图片上也看得清 */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: dim / 100 }}
        data-background-dim
      />
    </>
  )
}

export default AppBackground
