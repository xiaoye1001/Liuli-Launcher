import { useState } from 'react'
import { AlertTriangle, Download, FileArchive, Loader2, Package } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import type { ModpackInfo } from '../../../shared/types'

const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }
const FORMAT_NAMES = { modrinth: 'Modrinth', curseforge: 'CurseForge', multimc: 'MultiMC / Prism', mcbbs: 'MCBBS' }

/** 「需要下载」一栏：不同格式的整合包获取模组的方式不同 */
function downloadSummary(modpack: ModpackInfo): string {
  const included = modpack.includedMods ?? 0
  if (modpack.fileCount === 0 || (modpack.format === 'curseforge' && included >= modpack.fileCount)) {
    return '无需下载（模组已包含在整合包中）'
  }
  const skip = included > 0 ? '，整合包里已有的跳过' : ''
  if (modpack.format === 'curseforge') return `${modpack.fileCount} 个模组（MCIM 镜像${skip}）`
  const skipped = modpack.skippedDownloads ? `（另有 ${modpack.skippedDownloads} 个整合包里已有，不用下载）` : ''
  return `${modpack.fileCount} 个文件 · ${formatBytes(modpack.totalSize)}${skipped}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 版本名检查（与安装设置页一致） */
function validateName(name: string, taken: Set<string>): string {
  if (!name) return '版本名不能为空'
  if (name.length > 64) return '版本名不能超过 64 个字符'
  if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') return '版本名不能包含 \\ / : * ? " < > | 等字符'
  if (name !== name.trim()) return '版本名首尾不能有空格'
  if (taken.has(name)) return `已存在名为「${name}」的版本`
  return ''
}

interface ModpackSetupPageProps {
  modpack: ModpackInfo
  installedIds: Set<string>
  /** 是否有安装任务正在进行 */
  busy: boolean
  onBack: () => void
  onStarted: () => void
}

/** 整合包安装确认页：显示整合包信息，可以修改版本名 */
function ModpackSetupPage({ modpack, installedIds, busy, onBack, onStarted }: ModpackSetupPageProps): JSX.Element {
  const [name, setName] = useState(`${modpack.name} ${modpack.version}`.trim().slice(0, 64))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const nameError = validateName(name, installedIds)

  const start = async (): Promise<void> => {
    setSubmitting(true)
    setError('')
    try {
      await window.api.installModpack(name)
      onStarted()
    } catch (e) {
      setError(cleanError(e))
      setSubmitting(false)
    }
  }

  const rows: [string, string][] = [
    ['Minecraft 版本', modpack.minecraftVersion],
    ['模组加载器', modpack.loader ? `${LOADER_NAMES[modpack.loader]} ${modpack.loaderVersion}` : '无（原版）'],
    ['需要下载', downloadSummary(modpack)],
    [
      '整合包内的文件',
      `${modpack.overrideCount} 个${modpack.includedMods ? `（含 ${modpack.includedMods} 个模组）` : ''}`
    ],
    [
      '游戏本体与资源',
      modpack.includedGameFiles
        ? `整合包自带 ${modpack.includedGameFiles} 个资源文件，安装时直接使用，只下载缺少的`
        : `需要下载 Minecraft ${modpack.minecraftVersion}${modpack.loader ? ' 与加载器' : ''}（含声音、语言等资源，约几百 MB；已经装过同版本时不会重复下载）`
    ],
    ['格式', FORMAT_NAMES[modpack.format]],
    ['文件', modpack.fileName]
  ]

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 顶部：返回、整合包名称（与其他页面的标题栏对齐） */}
      <PageHeader
        onBack={onBack}
        backTitle="返回版本列表"
        icon={<Package className="h-6 w-6 text-emerald-300" />}
        title={
          <>
            {modpack.name}
            <span className="ml-2 text-base font-normal text-white/50">{modpack.version}</span>
          </>
        }
        titleHint={`${modpack.name} ${modpack.version}`}
        subtitle={modpack.summary ? <span className="truncate">{modpack.summary}</span> : undefined}
      />

      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
        <label className="block text-sm font-medium">安装为版本</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          spellCheck={false}
          className={`mt-2 w-full rounded-lg border bg-black/10 px-4 py-2.5 outline-none transition-colors focus:bg-black/20 ${
            nameError ? 'border-red-400/60' : 'border-white/15 focus:border-sky-400/70'
          }`}
        />
        {nameError && <p className="mt-1.5 text-xs text-red-300">{nameError}</p>}

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-xs text-white/50">{label}</div>
              <div className="break-words text-sm" title={value}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      <p className="flex items-center gap-2 px-1 text-xs text-white/40">
        <FileArchive className="h-3.5 w-3.5 shrink-0" />
        会依次安装 Minecraft 与模组加载器、下载整合包中的模组，并把配置文件放进该版本使用的游戏目录。
      </p>

      <div className="mt-auto flex justify-center pb-2">
        <button
          onClick={start}
          disabled={busy || submitting || !!nameError}
          title={busy ? '已有安装任务在进行中' : undefined}
          className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3.5 text-base font-semibold shadow-xl shadow-emerald-500/30 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-500 disabled:shadow-none"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          安装整合包
        </button>
      </div>
    </div>
  )
}

export default ModpackSetupPage
