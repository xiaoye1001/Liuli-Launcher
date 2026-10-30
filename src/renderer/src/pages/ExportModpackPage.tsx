import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, File, Folder, FolderOpen, Loader2, PackageOpen } from 'lucide-react'
import type {
  InstalledVersion,
  ModpackExportFormat,
  ModpackExportInfo,
  ModpackExportResult
} from '../../../shared/types'

const FORMATS: { key: ModpackExportFormat; label: string; ext: string; desc: string }[] = [
  {
    key: 'modrinth',
    label: 'Modrinth',
    ext: '.mrpack',
    desc: '推荐。Modrinth 上能找到的模组只写下载地址，文件更小'
  },
  { key: 'curseforge', label: 'CurseForge', ext: '.zip', desc: 'CurseForge App、HMCL、PCL 等都能导入' },
  { key: 'multimc', label: 'MultiMC / Prism', ext: '.zip', desc: '适合 MultiMC、Prism Launcher' },
  { key: 'mcbbs', label: 'MCBBS', ext: '.zip', desc: 'HMCL、PCL 等国内启动器常用' }
]
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }
/** 常见内容的说明 */
const ENTRY_LABELS: Record<string, string> = {
  mods: '模组',
  config: '模组配置',
  defaultconfigs: '默认配置',
  kubejs: 'KubeJS 脚本',
  scripts: '脚本',
  resourcepacks: '资源包',
  shaderpacks: '光影包',
  saves: '存档',
  'options.txt': '游戏设置',
  'optionsof.txt': 'OptiFine 设置',
  'optionsshaders.txt': '光影设置',
  'servers.dat': '服务器列表'
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

interface ExportModpackPageProps {
  version: InstalledVersion
  onBack: () => void
}

/** 导出整合包：选择格式、填写信息、勾选要带上的内容 */
function ExportModpackPage({ version, onBack }: ExportModpackPageProps): JSX.Element {
  const [info, setInfo] = useState<ModpackExportInfo | null>(null)
  const [format, setFormat] = useState<ModpackExportFormat>('modrinth')
  const [name, setName] = useState(version.id)
  const [packVersion, setPackVersion] = useState('1.0.0')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [include, setInclude] = useState<Set<string>>(new Set())
  const [useLinks, setUseLinks] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ModpackExportResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .getModpackExportInfo(version.id)
      .then((loaded) => {
        setInfo(loaded)
        setInclude(new Set(loaded.entries.filter((e) => e.recommended).map((e) => e.name)))
      })
      .catch((e) => setError(cleanError(e)))
    window.api.getSettings().then((s) => setAuthor((prev) => prev || s.offlineName))
    return window.api.onExportProgress(setProgress)
  }, [version.id])

  const toggle = (entry: string): void =>
    setInclude((prev) => {
      const next = new Set(prev)
      if (next.has(entry)) next.delete(entry)
      else next.add(entry)
      return next
    })

  const run = async (): Promise<void> => {
    setExporting(true)
    setError('')
    setResult(null)
    setProgress(null)
    try {
      const done = await window.api.exportModpack({
        versionId: version.id,
        format,
        name,
        version: packVersion.trim(),
        author,
        description,
        include: [...include],
        useModrinthLinks: useLinks
      })
      if (done) setResult(done)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setExporting(false)
    }
  }

  const selectedSize = info?.entries.filter((e) => include.has(e.name)).reduce((sum, e) => sum + e.size, 0) ?? 0
  const inputClass =
    'mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/70'

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            title="返回版本列表"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <PackageOpen className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold" title={version.id}>
              {version.id}
            </h1>
            <p className="truncate text-xs text-white/50">
              导出整合包 ·{' '}
              {info
                ? `Minecraft ${info.minecraftVersion}${info.loader ? ` · ${LOADER_NAMES[info.loader]} ${info.loaderVersion}` : ' · 原版'}`
                : '正在读取版本信息…'}
            </p>
          </div>
        </div>
      </div>

      <div className="page-scroll min-h-0 flex-1 space-y-4">
        {/* 格式 */}
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-3 font-semibold">格式</div>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  format === f.key
                    ? 'border-emerald-400/50 bg-emerald-500/15'
                    : 'border-white/5 bg-black/20 hover:bg-black/30'
                }`}
              >
                <div className="text-sm font-medium">
                  {f.label} <span className="font-mono text-xs text-white/40">{f.ext}</span>
                </div>
                <div className="mt-0.5 text-xs text-white/50">{f.desc}</div>
              </button>
            ))}
          </div>
          {format === 'modrinth' && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useLinks}
                onChange={(e) => setUseLinks(e.target.checked)}
                className="accent-emerald-500"
              />
              Modrinth 上能找到的模组、资源包、光影只写下载地址（导入时自动下载，整合包更小）
            </label>
          )}
        </section>

        {/* 信息 */}
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-1 font-semibold">整合包信息</div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-white/60">名称</span>
              <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">版本</span>
              <input
                value={packVersion}
                maxLength={32}
                onChange={(e) => setPackVersion(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/60">作者</span>
              <input value={author} maxLength={64} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="text-xs text-white/60">简介（可选）</span>
            <input
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话介绍这个整合包"
              className={inputClass}
            />
          </label>
        </section>

        {/* 内容 */}
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-3 flex items-center">
            <span className="font-semibold">要带上的内容</span>
            <span className="ml-auto text-xs text-white/50">
              已选 {include.size} 项 · 约 {formatSize(selectedSize)}
            </span>
          </div>
          {!info && !error && <Loader2 className="h-5 w-5 animate-spin text-white/40" />}
          {info?.entries.length === 0 && (
            <div className="text-sm text-white/40">这个版本的游戏目录里没有可以导出的内容</div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {info?.entries.map((entry) => (
              <label
                key={entry.name}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  include.has(entry.name) ? 'bg-emerald-500/10' : 'bg-black/20 hover:bg-black/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={include.has(entry.name)}
                  onChange={() => toggle(entry.name)}
                  className="accent-emerald-500"
                />
                {entry.isDirectory ? (
                  <Folder className="h-4 w-4 shrink-0 text-amber-300" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-white/50" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm" title={entry.name}>
                  {entry.name}
                  {ENTRY_LABELS[entry.name] && (
                    <span className="ml-1.5 text-xs text-white/40">{ENTRY_LABELS[entry.name]}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-white/40">
                  {entry.isDirectory ? `${entry.files} 个文件 · ` : ''}
                  {formatSize(entry.size)}
                </span>
              </label>
            ))}
          </div>
          {include.has('saves') && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              存档会让整合包变得很大，只在需要分享地图时勾选
            </p>
          )}
        </section>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {result && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-all">
            已导出 {result.path.split(/[\\/]/).pop()}（{formatSize(result.size)}，打包 {result.files} 个文件
            {result.linked > 0 ? `，${result.linked} 个改为下载地址` : ''}）
          </span>
          <button
            onClick={() => window.api.showExportedModpack()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            在文件夹中显示
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {exporting && progress && (
          <div className="flex flex-1 items-center gap-3 text-xs text-white/60">
            正在打包 {progress.done} / {progress.total}
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        <button
          onClick={run}
          disabled={exporting || !info || include.size === 0 || !name.trim()}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-500/20 disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
          {exporting ? '正在导出…' : '导出'}
        </button>
      </div>
    </div>
  )
}

export default ExportModpackPage
