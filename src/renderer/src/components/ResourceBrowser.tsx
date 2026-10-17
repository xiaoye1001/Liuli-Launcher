import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Loader2,
  Package,
  Puzzle,
  Search,
  Shapes,
  Sun,
  type LucideIcon
} from 'lucide-react'
import type {
  InstalledVersion,
  ModpackInfo,
  ModrinthProjectHit,
  ModrinthProjectVersion,
  ResourceSearchFilters,
  ResourceType
} from '../../../shared/types'

/** 各类资源的显示信息与可用的筛选项 */
export const RESOURCE_TYPES: Record<
  ResourceType,
  { label: string; icon: LucideIcon; desc: string; loaders: [string, string][]; categories: [string, string][] }
> = {
  mod: {
    label: 'Mod',
    icon: Puzzle,
    desc: '安装到所选版本的 mods 文件夹，并自动安装需要的前置模组',
    loaders: [
      ['fabric', 'Fabric'],
      ['forge', 'Forge'],
      ['neoforge', 'NeoForge'],
      ['quilt', 'Quilt']
    ],
    categories: [
      ['adventure', '冒险'],
      ['decoration', '装饰'],
      ['equipment', '装备'],
      ['food', '食物'],
      ['game-mechanics', '游戏机制'],
      ['library', '前置库'],
      ['magic', '魔法'],
      ['management', '管理'],
      ['minigame', '小游戏'],
      ['mobs', '生物'],
      ['optimization', '优化'],
      ['social', '社交'],
      ['storage', '存储'],
      ['technology', '科技'],
      ['transportation', '交通'],
      ['utility', '实用'],
      ['worldgen', '世界生成']
    ]
  },
  modpack: {
    label: '整合包',
    icon: Package,
    desc: '下载后进入安装页，自动安装 Minecraft、模组加载器与全部模组',
    loaders: [
      ['fabric', 'Fabric'],
      ['forge', 'Forge'],
      ['neoforge', 'NeoForge'],
      ['quilt', 'Quilt']
    ],
    categories: [
      ['adventure', '冒险'],
      ['challenging', '挑战'],
      ['combat', '战斗'],
      ['kitchen-sink', '大型综合'],
      ['lightweight', '轻量'],
      ['magic', '魔法'],
      ['multiplayer', '多人'],
      ['optimization', '优化'],
      ['quests', '任务'],
      ['technology', '科技']
    ]
  },
  datapack: {
    label: '数据包',
    icon: Shapes,
    desc: '安装到所选版本某个存档的 datapacks 文件夹',
    loaders: [],
    categories: [
      ['adventure', '冒险'],
      ['decoration', '装饰'],
      ['equipment', '装备'],
      ['game-mechanics', '游戏机制'],
      ['magic', '魔法'],
      ['mobs', '生物'],
      ['technology', '科技'],
      ['utility', '实用'],
      ['worldgen', '世界生成']
    ]
  },
  resourcepack: {
    label: '资源包',
    icon: ImageIcon,
    desc: '安装到所选版本的 resourcepacks 文件夹，进入游戏后在「资源包」中启用',
    loaders: [],
    categories: [
      ['vanilla-like', '原版风格'],
      ['realistic', '写实'],
      ['simplistic', '简约'],
      ['themed', '主题'],
      ['tweaks', '微调'],
      ['decoration', '装饰'],
      ['gui', '界面'],
      ['fonts', '字体'],
      ['models', '模型'],
      ['16x', '16x'],
      ['32x', '32x'],
      ['64x', '64x'],
      ['128x', '128x']
    ]
  },
  shader: {
    label: '光影包',
    icon: Sun,
    desc: '安装到所选版本的 shaderpacks 文件夹，需要 Iris 或 OptiFine 才能使用',
    loaders: [
      ['iris', 'Iris'],
      ['optifine', 'OptiFine'],
      ['canvas', 'Canvas']
    ],
    categories: [
      ['vanilla-like', '原版风格'],
      ['semi-realistic', '半写实'],
      ['realistic', '写实'],
      ['fantasy', '幻想'],
      ['cartoon', '卡通'],
      ['potato', '极低配置'],
      ['low', '低配置'],
      ['medium', '中配置'],
      ['high', '高配置'],
      ['atmosphere', '大气效果'],
      ['reflections', '反射'],
      ['shadows', '阴影'],
      ['path-tracing', '路径追踪']
    ]
  }
}

const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  iris: 'Iris',
  optifine: 'OptiFine',
  canvas: 'Canvas',
  datapack: '数据包',
  minecraft: '原版'
}
const TYPE_LABELS = { release: '', beta: '测试版', alpha: '早期测试版' }
const SORTS: [string, string][] = [
  ['', '默认排序'],
  ['relevance', '相关度'],
  ['downloads', '下载量'],
  ['follows', '关注数'],
  ['updated', '最近更新'],
  ['newest', '最新发布']
]

function formatDownloads(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`
  if (n >= 1e6) return `${Math.round(n / 1e4)} 万`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`
  return String(n)
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function ProjectIcon({ url, fallback: Fallback }: { url?: string; fallback: LucideIcon }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Fallback className="h-6 w-6 text-white/40" />
      </div>
    )
  }
  return <img src={url} alt="" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
}

/** 筛选下拉框 */
function FilterSelect({
  value,
  onChange,
  options,
  title
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  title?: string
}): JSX.Element {
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 max-w-44 rounded-lg border bg-black/20 px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-sky-400/70 ${
        value ? 'border-emerald-400/50 text-white' : 'border-white/10 text-white/70'
      }`}
    >
      {options.map(([key, label]) => (
        <option key={key} value={key} className="bg-slate-800 text-white">
          {label}
        </option>
      ))}
    </select>
  )
}

/** 模组加载器能否作为模组的筛选条件（OptiFine 版本不是模组加载器） */
const MOD_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']

interface ResourceBrowserProps {
  type: ResourceType
  /** 已安装的版本（模组、资源包等要安装到其中一个） */
  installed: InstalledVersion[]
  /** 优先选中的安装目标（从「版本」页跳转过来时） */
  targetHint?: string
  /** 数据包优先选中的存档 */
  worldHint?: string
  /** 整合包下载并读取完成，进入安装确认页 */
  onModpackPicked: (info: ModpackInfo) => void
  /** 标题栏右侧的附加内容（整合包页的导入按钮） */
  headerExtra?: ReactNode
  /** 标题下方的附加内容（整合包页的拖放区域） */
  topExtra?: ReactNode
}

/** 社区资源浏览：搜索、筛选 Modrinth 上的模组 / 整合包 / 数据包 / 资源包 / 光影，选择版本后安装 */
function ResourceBrowser({
  type,
  installed,
  targetHint,
  worldHint,
  onModpackPicked,
  headerExtra,
  topExtra
}: ResourceBrowserProps): JSX.Element {
  const meta = RESOURCE_TYPES[type]
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<ModrinthProjectHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 展开查看版本的项目 */
  const [expanded, setExpanded] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, ModrinthProjectVersion[] | 'loading'>>({})
  const [showUnstable, setShowUnstable] = useState(false)
  /** 正在下载的版本 */
  const [downloading, setDownloading] = useState<string | null>(null)
  const [filters, setFilters] = useState<ResourceSearchFilters>({})
  /** 正式版 Minecraft 版本（筛选用） */
  const [gameVersions, setGameVersions] = useState<string[]>([])
  /** 安装到哪个版本（整合包不需要） */
  const [targetId, setTargetId] = useState('')
  const [worlds, setWorlds] = useState<string[] | null>(null)
  const [world, setWorld] = useState('')
  const requestId = useRef(0)

  const needsTarget = type !== 'modpack'
  const target = installed.find((v) => v.id === targetId)

  useEffect(() => {
    window.api
      .getVersionList()
      .then((manifest) => setGameVersions(manifest.versions.filter((v) => v.type === 'release').map((v) => v.id)))
      .catch(() => undefined)
  }, [])

  // 从「版本」页跳转过来时，安装到那个版本
  useEffect(() => {
    if (needsTarget && targetHint && installed.some((v) => v.id === targetHint)) setTargetId(targetHint)
  }, [needsTarget, targetHint, installed])

  // 默认安装到主页选中的版本
  useEffect(() => {
    if (!needsTarget || installed.length === 0 || installed.some((v) => v.id === targetId)) return
    window.api.getSettings().then((s) => {
      const fallback = installed.some((v) => v.id === s.selectedVersion) ? s.selectedVersion : installed[0].id
      // 读取设置期间可能已经选好了目标（例如从「版本」页跳转过来），不要覆盖
      setTargetId((prev) => (installed.some((v) => v.id === prev) ? prev : fallback))
    })
  }, [needsTarget, targetId, installed])

  // 选择安装目标后，筛选条件跟随该版本的 Minecraft 版本与加载器
  // （只在换了目标时跟随；刷新版本列表不会覆盖手动改过的筛选）
  const targetMc = target?.minecraftVersion
  const targetLoader = target?.loader
  useEffect(() => {
    if (!targetMc) return
    setFilters((prev) => ({
      ...prev,
      gameVersion: targetMc,
      loader: type === 'mod' && targetLoader && MOD_LOADERS.includes(targetLoader) ? targetLoader : prev.loader
    }))
  }, [targetId, targetMc, targetLoader, type])

  // 数据包需要选择存档
  useEffect(() => {
    if (type !== 'datapack' || !targetId) return
    setWorlds(null)
    window.api
      .listWorlds(targetId)
      .then((list) => {
        setWorlds(list)
        setWorld((prev) =>
          worldHint && list.includes(worldHint) ? worldHint : list.includes(prev) ? prev : (list[0] ?? '')
        )
      })
      .catch(() => setWorlds([]))
  }, [type, targetId, worldHint])

  const setFilter = (key: keyof ResourceSearchFilters, value: string): void =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))

  const search = useCallback(
    async (query: string, offset: number, current: ResourceSearchFilters) => {
      const id = ++requestId.current
      setLoading(true)
      setError('')
      try {
        const result = await window.api.searchResources(type, query, offset, current)
        if (id !== requestId.current) return
        setHits((prev) => (offset === 0 ? result.hits : [...prev, ...result.hits]))
        setTotal(result.total)
      } catch (e) {
        if (id === requestId.current) setError(cleanError(e))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [type]
  )

  useEffect(() => {
    const timer = setTimeout(() => search(keyword, 0, filters), keyword ? 400 : 0)
    return () => clearTimeout(timer)
  }, [keyword, filters, search])

  /** 版本是否符合当前的 Minecraft 版本与加载器筛选 */
  const matches = (v: ModrinthProjectVersion): boolean =>
    (!filters.gameVersion || v.gameVersions.includes(filters.gameVersion)) &&
    (!filters.loader || v.loaders.includes(filters.loader))

  const toggle = async (projectId: string): Promise<void> => {
    if (expanded === projectId) {
      setExpanded(null)
      return
    }
    setExpanded(projectId)
    if (versions[projectId]) return
    setVersions((prev) => ({ ...prev, [projectId]: 'loading' }))
    try {
      const list = await window.api.getResourceVersions(projectId, type)
      setVersions((prev) => ({ ...prev, [projectId]: list }))
    } catch (e) {
      setVersions((prev) => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
      setExpanded(null)
      setError(cleanError(e))
    }
  }

  const install = async (project: ModrinthProjectHit, version: ModrinthProjectVersion): Promise<void> => {
    setDownloading(version.id)
    setError('')
    setNotice('')
    try {
      if (type === 'modpack') {
        onModpackPicked(await window.api.downloadModpack(version.id))
        return
      }
      if (!targetId) throw new Error('请先在右上角选择要安装到的版本')
      if (type === 'datapack' && !world) throw new Error('请先选择要安装到的存档')
      const result = await window.api.installResource({ versionId: targetId, world }, type, version.id)
      const deps = result.installed.filter((m) => m.dependency).map((m) => m.title)
      let message = `已将 ${project.title} ${version.versionNumber} 安装到 ${targetId}${type === 'datapack' ? ` 的存档「${world}」` : ''}`
      if (deps.length > 0) message += `，同时安装了前置模组：${deps.join('、')}`
      if (result.missingDependencies.length > 0) {
        message += `。找不到适用的前置模组：${result.missingDependencies.join('、')}`
      }
      setNotice(message)
    } catch (e) {
      setError(`${project.title} 安装失败：${cleanError(e)}`)
    } finally {
      setDownloading(null)
    }
  }

  const hasFilter = !!(filters.gameVersion || filters.loader || filters.category || filters.sort)
  const versionOptions = useMemo(() => {
    const list = gameVersions.map((v): [string, string] => [v, v])
    // 安装目标是快照等不在正式版列表里的版本时，也要能选中
    if (filters.gameVersion && !gameVersions.includes(filters.gameVersion))
      list.unshift([filters.gameVersion, filters.gameVersion])
    return [['', '全部 Minecraft 版本'] as [string, string], ...list]
  }, [gameVersions, filters.gameVersion])

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{meta.label}</h1>
          <p className="truncate text-xs text-white/50">来自 Modrinth · {meta.desc}</p>
        </div>
        {needsTarget ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-white/50">安装到</span>
            {installed.length === 0 ? (
              <span className="text-xs text-amber-300">请先安装一个游戏版本</span>
            ) : (
              <FilterSelect
                value={targetId}
                onChange={setTargetId}
                options={installed.map((v): [string, string] => [v.id, v.id])}
                title="下载的内容会放进这个版本使用的游戏目录"
              />
            )}
            {type === 'datapack' && targetId && (
              <>
                {worlds === null ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                ) : worlds.length === 0 ? (
                  <span className="text-xs text-amber-300" title="数据包要放进存档里，先进入游戏创建一个世界">
                    该版本还没有存档
                  </span>
                ) : (
                  <FilterSelect
                    value={world}
                    onChange={setWorld}
                    options={worlds.map((w): [string, string] => [w, `存档：${w}`])}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          headerExtra
        )}
      </div>

      {type === 'mod' && target && !(target.loader && MOD_LOADERS.includes(target.loader)) && (
        <p className="flex items-center gap-2 px-1 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {target.id} 没有安装模组加载器（Fabric / Forge
          等），装进去的模组不会生效。请在「原版游戏」里安装带加载器的版本。
        </p>
      )}
      {topExtra}

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={`搜索${meta.label}（英文名效果更好）`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-white/50">
            <input
              type="checkbox"
              checked={showUnstable}
              onChange={(e) => setShowUnstable(e.target.checked)}
              className="accent-emerald-500"
            />
            显示测试版
          </label>
        </div>

        {/* 筛选 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterSelect
            value={filters.gameVersion ?? ''}
            onChange={(v) => setFilter('gameVersion', v)}
            options={versionOptions}
          />
          {meta.loaders.length > 0 && (
            <FilterSelect
              value={filters.loader ?? ''}
              onChange={(v) => setFilter('loader', v)}
              options={[['', type === 'shader' ? '全部光影加载器' : '全部加载器'], ...meta.loaders]}
            />
          )}
          <FilterSelect
            value={filters.category ?? ''}
            onChange={(v) => setFilter('category', v)}
            options={[['', '全部分类'], ...meta.categories]}
          />
          <FilterSelect value={filters.sort ?? ''} onChange={(v) => setFilter('sort', v)} options={SORTS} />
          {hasFilter && (
            <button
              onClick={() => setFilters({})}
              className="rounded-lg px-2 py-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white"
            >
              清除筛选
            </button>
          )}
          <span className="ml-auto text-xs text-white/40">共 {total} 个</span>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-red-500/20 px-4 py-2.5 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
        {notice && (
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {!loading && !error && hits.length === 0 && (
            <div className="py-10 text-center text-sm text-white/40">没有找到符合条件的{meta.label}</div>
          )}
          {hits.map((project) => {
            const open = expanded === project.projectId
            const list = versions[project.projectId]
            // 显示全部版本：符合筛选条件的排在前面，其余变暗
            const visible = Array.isArray(list)
              ? list
                  .filter((v) => showUnstable || v.versionType === 'release')
                  .sort((a, b) => Number(matches(b)) - Number(matches(a)))
              : []
            const matchCount = visible.filter(matches).length
            return (
              <div key={project.projectId} className="overflow-hidden rounded-xl bg-black/20">
                <button
                  onClick={() => toggle(project.projectId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <ProjectIcon url={project.iconUrl} fallback={meta.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{project.title}</span>
                      <span className="shrink-0 text-xs text-white/40">by {project.author}</span>
                    </div>
                    <div className="truncate text-xs text-white/50" title={project.description}>
                      {project.description}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {project.latestGameVersion && (
                        <span className="rounded bg-white/10 px-1.5 text-xs text-white/60">
                          {project.latestGameVersion}
                        </span>
                      )}
                      {project.loaders.map((l) => (
                        <span key={l} className="rounded bg-emerald-500/15 px-1.5 text-xs text-emerald-300">
                          {LOADER_NAMES[l] ?? l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-white/40">
                    <Download className="h-3.5 w-3.5" />
                    {formatDownloads(project.downloads)}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>

                {open && (
                  <div className="max-h-96 overflow-y-auto border-t border-white/10 p-2">
                    {list === 'loading' && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/50">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在获取版本列表…
                      </div>
                    )}
                    {Array.isArray(list) && visible.length > 0 && (
                      <div className="px-3 pb-1 pt-0.5 text-xs text-white/40">
                        共 {visible.length} 个版本
                        {(filters.gameVersion || filters.loader) && `，其中 ${matchCount} 个符合筛选`}
                        {list.length > visible.length && `（另有 ${list.length - visible.length} 个测试版已隐藏）`}
                      </div>
                    )}
                    {Array.isArray(list) && visible.length === 0 && (
                      <div className="px-3 py-2 text-xs text-white/40">
                        {list.length === 0 ? '没有可下载的版本' : '只有测试版，勾选「显示测试版」查看'}
                      </div>
                    )}
                    {visible.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 ${
                          matches(v) ? '' : 'opacity-45'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="truncate font-medium">{v.versionNumber}</span>
                            {TYPE_LABELS[v.versionType] && (
                              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 text-xs text-amber-300">
                                {TYPE_LABELS[v.versionType]}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs leading-5 text-white/40" title={v.fileName}>
                            {v.loaders.map((l) => LOADER_NAMES[l] ?? l).join(' / ')} · {formatSize(v.fileSize)} ·{' '}
                            {new Date(v.datePublished).toLocaleDateString('zh-CN')} · {v.fileName}
                          </div>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {v.gameVersions.map((g) => (
                              <span
                                key={g}
                                className={`rounded px-1.5 text-xs ${
                                  g === filters.gameVersion
                                    ? 'bg-emerald-500/25 text-emerald-200'
                                    : 'bg-white/10 text-white/60'
                                }`}
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => install(project, v)}
                          disabled={downloading !== null || (needsTarget && !targetId)}
                          title={needsTarget ? `安装到 ${targetId || '（未选择版本）'}` : '下载并进入安装页'}
                          className="flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {downloading === v.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {downloading === v.id ? '下载中' : '安装'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {hits.length > 0 && hits.length < total && (
            <button
              onClick={() => search(keyword, hits.length, filters)}
              disabled={loading}
              className="w-full rounded-xl py-2.5 text-sm text-white/60 hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? '加载中…' : `加载更多（${hits.length} / ${total}）`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

export default ResourceBrowser
