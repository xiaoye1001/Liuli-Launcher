import { Wrench } from 'lucide-react'
import FastDownloadPanel from '../components/FastDownloadPanel'

/** 更多：百宝箱里的各种小工具（目前有高速多线程下载器） */
function MorePage(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">更多</h1>
        <span className="flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-1.5 text-sm text-white/70">
          <Wrench className="h-4 w-4 text-emerald-300" />
          百宝箱
        </span>
      </div>
      <FastDownloadPanel />
    </div>
  )
}

export default MorePage
