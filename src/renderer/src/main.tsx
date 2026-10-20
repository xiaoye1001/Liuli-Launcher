import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LogWindow from './LogWindow'
import LaunchSplashWindow from './LaunchSplashWindow'
import { initTheme } from './utils/theme'
import { initAppearance } from './utils/appearance'
import { initMusic } from './utils/music'
import './index.css'

initTheme()
initAppearance()
if (window.api.customTitleBar) document.documentElement.classList.add('custom-titlebar')

// 日志窗口、桌面启动悬浮窗与主窗口共用同一个页面，通过地址中的 #logs、#launch-splash 区分
const isLogWindow = window.location.hash === '#logs'
const isLaunchSplash = window.location.hash.startsWith('#launch-splash')
// 悬浮窗是透明窗口，只显示中间的卡片
if (isLaunchSplash) document.documentElement.classList.add('launch-splash-window')
// 背景音乐只在主窗口播放
if (!isLogWindow && !isLaunchSplash) initMusic()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isLogWindow ? <LogWindow /> : isLaunchSplash ? <LaunchSplashWindow /> : <App />}</React.StrictMode>
)
