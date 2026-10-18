import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LogWindow from './LogWindow'
import { initTheme } from './utils/theme'
import { initAppearance } from './utils/appearance'
import { initMusic } from './utils/music'
import './index.css'

initTheme()
initAppearance()
if (window.api.customTitleBar) document.documentElement.classList.add('custom-titlebar')

// 日志窗口与主窗口共用同一个页面，通过地址中的 #logs 区分
const isLogWindow = window.location.hash === '#logs'
// 背景音乐只在主窗口播放
if (!isLogWindow) initMusic()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isLogWindow ? <LogWindow /> : <App />}</React.StrictMode>
)
