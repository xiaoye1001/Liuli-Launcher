import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LogWindow from './LogWindow'
import { initTheme } from './utils/theme'
import './index.css'

initTheme()

// 日志窗口与主窗口共用同一个页面，通过地址中的 #logs 区分
const isLogWindow = window.location.hash === '#logs'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isLogWindow ? <LogWindow /> : <App />}</React.StrictMode>
)
