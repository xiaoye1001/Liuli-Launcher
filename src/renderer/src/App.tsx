import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar, { NAV_ITEMS, type PageKey } from './components/Sidebar'
import AccountPage from './pages/AccountPage'
import DownloadPage from './pages/DownloadPage'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'

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

  return (
    <div className="flex h-full overflow-hidden app-background text-white">
      <Sidebar current={page} onChange={setPage} />
      <main className="relative flex-1 overflow-hidden p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            className="h-full"
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {renderPage(page)}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
