function App(): JSX.Element {
  const { electron, chrome, node } = window.api.versions

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-emerald-900 text-white">
      <div className="w-[420px] rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-3xl font-bold tracking-tight">MC Launcher</h1>
        <p className="mt-2 text-sm text-white/60">阶段 1：项目骨架运行成功 🎉</p>
        <div className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between rounded-lg bg-black/20 px-4 py-2">
            <span className="text-white/60">Electron</span>
            <span className="font-mono">{electron}</span>
          </div>
          <div className="flex justify-between rounded-lg bg-black/20 px-4 py-2">
            <span className="text-white/60">Chromium</span>
            <span className="font-mono">{chrome}</span>
          </div>
          <div className="flex justify-between rounded-lg bg-black/20 px-4 py-2">
            <span className="text-white/60">Node.js</span>
            <span className="font-mono">{node}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
