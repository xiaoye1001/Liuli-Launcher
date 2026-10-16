import { useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import Sidebar, { NAV_ITEMS, type PageKey } from './components/Sidebar'
import AccountPage from './pages/AccountPage'
import DownloadPage from './pages/DownloadPage'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'
import { backgroundUrl, useAppearance } from './utils/appearance'

function renderPage(key: PageKey): JSX.Element {
  if (key === 'home') return <HomePage />
  if (key === 'account') return <AccountPage />
  if (key === 'download') return <DownloadPage />
  if (key === 'settings') return <SettingsPage />
  const item = NAV_ITEMS.find((nav) => nav.key === key)!
  return <PlaceholderPage title={item.label} icon={item.icon} />
}

function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('home')
  const appearance = useAppearance()
  const { backgroundImage, backgroundBlur, backgroundDim } = appearance

  return (
    // 关闭动画时，framer-motion 的位移、缩放等动画也一并关闭
    <MotionConfig reducedMotion={appearance.animations ? 'never' : 'always'}>
      <div className="relative isolate flex h-full overflow-hidden app-background text-white">
        {/* 自定义背景：图片 + 模糊 + 遮罩（遮罩在深色主题下变暗，浅色主题下变亮） */}
        {backgroundImage && (
          <>
            <div
              className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
              style={{
                backgroundImage: `url("${backgroundUrl(backgroundImage)}")`,
                filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
                // 模糊会让边缘变透明，稍微放大以遮住
                transform: backgroundBlur > 0 ? 'scale(1.08)' : undefined
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 -z-10 bg-black"
              style={{ opacity: backgroundDim / 100 }}
            />
          </>
        )}
        <Sidebar current={page} onChange={setPage} />
        <main className="relative flex-1 overflow-hidden p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="h-full"
              initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
              transition={{ duration: appearance.animations ? 0.25 : 0, ease: 'easeOut' }}
            >
              {renderPage(page)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  )
}

export default App
