import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, Loader2 } from 'lucide-react'
import type { CloudBackupConfig, CloudBackupStatus } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/60'

/** 设置页的「存档云备份」：WebDAV 网盘地址、账号，备份后自动上传 */
function CloudBackupSettings(): JSX.Element {
  const [config, setConfig] = useState<CloudBackupConfig | null>(null)
  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [folder, setFolder] = useState('LiuliLauncher')
  const [status, setStatus] = useState<CloudBackupStatus | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.getCloudBackupConfig().then((c) => {
      setConfig(c)
      setUrl(c.url)
      setUser(c.user)
      setFolder(c.folder)
    })
    void window.api.getCloudBackupStatus().then(setStatus)
    return window.api.onCloudBackupStatus(setStatus)
  }, [])

  const run = async (key: string, action: () => Promise<string>): Promise<void> => {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      setMessage(await action())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy('')
    }
  }

  const save = (enabled: boolean): Promise<void> =>
    run('save', async () => {
      const next = await window.api.configureCloudBackup({ enabled, url, user, password, folder })
      setConfig(next)
      setFolder(next.folder)
      setPassword('')
      return enabled ? '已保存，之后的存档备份会自动上传到网盘' : '已保存'
    })

  if (!config) return <div className="mt-3 h-16 rounded-xl bg-black/20" />

  return (
    <div className="mt-3 rounded-xl bg-black/20 px-4 py-3" data-testid="cloud-backup-settings">
      <div className="flex items-center gap-3">
        <Cloud className="h-4 w-4 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">存档云备份（WebDAV）</div>
          <div className="text-xs text-white/50">
            存档备份做好后自动上传到自己的网盘（坚果云、Nextcloud、群晖等支持 WebDAV 的网盘），换电脑也能下载回来接着玩
          </div>
        </div>
        {config.enabled && config.hasPassword && (
          <span className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">已开启</span>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block min-w-0 sm:col-span-2">
          <span className="text-xs text-white/50">WebDAV 地址</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="例如 https://dav.jianguoyun.com/dav/"
            spellCheck={false}
            aria-label="WebDAV 地址"
            className={`mt-1 font-mono ${INPUT}`}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-white/50">用户名</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="WebDAV 用户名"
            className={`mt-1 ${INPUT}`}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-white/50">密码（坚果云要用「应用密码」）</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={config.hasPassword ? '已保存，不改就不用填' : ''}
            autoComplete="new-password"
            aria-label="WebDAV 密码"
            className={`mt-1 ${INPUT}`}
          />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="text-xs text-white/50">网盘里的文件夹</span>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="LiuliLauncher"
            aria-label="网盘文件夹"
            className={`mt-1 ${INPUT}`}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save(true)}
          disabled={!!busy || !url.trim() || !user.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sky-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {config.enabled ? '保存' : '保存并开启'}
        </button>
        <button
          onClick={() =>
            void run('test', async () => {
              if (password || url !== config.url || user !== config.user || folder !== config.folder) {
                setConfig(
                  await window.api.configureCloudBackup({ enabled: config.enabled, url, user, password, folder })
                )
                setPassword('')
              }
              return window.api.testCloudBackup()
            })
          }
          disabled={!!busy || !url.trim() || !user.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
        >
          {busy === 'test' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          测试连接
        </button>
        {config.enabled && (
          <button
            onClick={() => void save(false)}
            disabled={!!busy}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            暂停自动上传
          </button>
        )}
        {config.url && (
          <button
            onClick={() =>
              void run('clear', async () => {
                const next = await window.api.configureCloudBackup({
                  enabled: false,
                  url: '',
                  user: '',
                  folder,
                  clear: true
                })
                setConfig(next)
                setUrl('')
                setUser('')
                setPassword('')
                return '已清除网盘设置和密码（网盘里的备份不会删除）'
              })
            }
            disabled={!!busy}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs text-white/50 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50"
          >
            清除设置
          </button>
        )}
      </div>

      {status && (status.state !== 'idle' || status.lastUploadAt) && (
        <div className="mt-2 text-xs text-white/50" data-testid="cloud-status">
          {status.state === 'uploading' && (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在上传 {status.file}
              {status.queued > 1 ? `（还有 ${status.queued - 1} 个在排队）` : ''}
            </span>
          )}
          {status.state === 'error' && <span className="text-rose-300">上传失败：{status.error}</span>}
          {status.state === 'idle' && status.lastUploadAt && (
            <span>上次上传：{new Date(status.lastUploadAt).toLocaleString('zh-CN', { hour12: false })}</span>
          )}
        </div>
      )}
      {message && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-emerald-300" role="status">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-2 text-xs text-white/40">
        密码用系统安全存储加密保存在这台电脑上，只用来连接这个网盘地址；网盘里每个存档只保留最近 5
        份自动备份，手动备份不会删除。 在「版本 → 存档 → 云端」里可以把网盘里的备份下载回来
      </div>
    </div>
  )
}

export default CloudBackupSettings
