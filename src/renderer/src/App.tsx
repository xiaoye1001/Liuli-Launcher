import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import WindowControls from './components/WindowControls'
import Sidebar, { NAV_ITEMS, type PageKey } from './components/Sidebar'
import AccountPage from './pages/AccountPage'
import DownloadPage from './pages/DownloadPage'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import VersionsPage from './pages/VersionsPage'
import ServersPage from './pages/ServersPage'
import SettingsPage from './pages/SettingsPage'
import MorePage from './pages/MorePage'
import DropOverlay from './components/DropOverlay'
import PageErrorBoundary from './components/PageErrorBoundary'
import UpdateNotice from './components/UpdateNotice'
import type { ModpackInfo, ResourceType } from '../../shared/types'
import { useAppearance } from './utils/appearance'
import DynamicBackground from './components/DynamicBackground'
import { ThemeProvider } from './context/ThemeContext'

interface PageContext {
  droppedModpack: ModpackInfo | null
  clearDroppedModpack: () => void
  navigate: (key: PageKey) => void
  /** 从主页打开某个版本的版本设置 */
  versionSettings: string | null
  /** 打开下载页的某个分类，并预选安装目标 */
  downloadRequest: { section: ResourceType; versionId: string; world?: string } | null
  openDownload: (section: ResourceType, versionId: string, world?: string) => void
  clearDownloadRequest: () => void
  openVersionSettings: (versionId: string) => void
  clearVersionSettings: () => void
}

function renderPage(key: PageKey, ctx: PageContext): JSX.Element {
  if (key === 'home') {
    return (
      <HomePage onOpenVersionSettings={ctx.openVersionSettings} onManageVersions={() => ctx.navigate('versions')} />
    )
  }
  if (key === 'versions') {
    return (
      <VersionsPage
        openSettingsFor={ctx.versionSettings}
        onSettingsOpened={ctx.clearVersionSettings}
        onInstallNew={() => ctx.navigate('download')}
        onDownloadResources={ctx.openDownload}
      />
    )
  }
  if (key === 'account') return <AccountPage />
  if (key === 'download') {
    return (
      <DownloadPage
        incomingModpack={ctx.droppedModpack}
        onModpackConsumed={ctx.clearDroppedModpack}
        request={ctx.downloadRequest}
        onRequestConsumed={ctx.clearDownloadRequest}
      />
    )
  }
  if (key === 'servers') return <ServersPage />
  if (key === 'settings') return <SettingsPage />
  if (key === 'more') return <MorePage />
  const item = NAV_ITEMS.find((nav) => nav.key === key)!
  return <PlaceholderPage title={item.label} icon={item.icon} />
}

function App(): JSX.Element {
  const [page, setPage] = useState<PageKey>('home')
  /** 拖入窗口的整合包，交给下载页打开安装确认页 */
  const [droppedModpack, setDroppedModpack] = useState<ModpackInfo | null>(null)
  const clearDroppedModpack = useCallback(() => setDroppedModpack(null), [])
  const [versionSettings, setVersionSettings] = useState<string | null>(null)
  const [downloadRequest, setDownloadRequest] = useState<PageContext['downloadRequest']>(null)
  const clearDownloadRequest = useCallback(() => setDownloadRequest(null), [])
  const openDownload = useCallback((section: ResourceType, versionId: string, world?: string) => {
    setDownloadRequest({ section, versionId, world })
    setPage('download')
  }, [])
  const clearVersionSettings = useCallback(() => setVersionSettings(null), [])
  const openVersionSettings = useCallback((versionId: string) => {
    setVersionSettings(versionId)
    setPage('versions')
  }, [])
  const appearance = useAppearance()
  // 在设置里隐藏了当前所在的页面时回到主页（从其它页面跳转过去仍然可以打开）
  // 依赖用字符串：其它设置变化时数组会重新生成，不能因此跳走
  const hiddenKey = appearance.hiddenPages.join(',')
  useEffect(() => {
    const hidden = hiddenKey.split(',')
    setPage((current) => (hidden.includes(current) ? 'home' : current))
  }, [hiddenKey])

  return (
    // 关闭动画时，framer-motion 的位移、缩放等动画也一并关闭
    <ThemeProvider>
      <MotionConfig reducedMotion={appearance.animations ? 'never' : 'always'}>
        <div className="relative isolate flex h-full overflow-hidden app-background text-white">
          {/* 动态背景：主题方案的动态图层 + 自定义壁纸 + 粒子特效 */}
          <DynamicBackground />
          {/* 窗口顶部的拖动区域（Windows、Linux 隐藏了系统标题栏） */}
          <div className="titlebar-drag fixed inset-x-0 top-0 z-30">
            <WindowControls className="absolute right-0 top-0" />
          </div>
          <Sidebar current={page} onChange={setPage} />
          <UpdateNotice />
          <DropOverlay
            onModpack={(info) => {
              setDroppedModpack(info)
              setPage('download')
            }}
          />
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
                <PageErrorBoundary resetKey={page}>
                  {renderPage(page, {
                    droppedModpack,
                    clearDroppedModpack,
                    navigate: setPage,
                    versionSettings,
                    downloadRequest,
                    openDownload,
                    clearDownloadRequest,
                    openVersionSettings,
                    clearVersionSettings
                  })}
                </PageErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </MotionConfig>
    </ThemeProvider>
  )
}

export default App
