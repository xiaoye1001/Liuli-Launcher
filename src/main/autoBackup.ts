import { getSettings } from './config'
import { onGameStatusChange } from './launch'
import { notify } from './notify'
import { uploadIfEnabled } from './cloudBackup'
import { autoBackupWorlds } from './worlds'

/**
 * 存档自动备份：游戏退出后，在后台备份这次玩过的存档（见 worlds.ts 的 autoBackupWorlds）。
 * 正常退出时每个存档保留最近 3 份自动备份；游戏崩溃后也备份，但不删除之前的自动备份
 */
let sessionStart = 0
let sessionVersion = ''
let running: Promise<unknown> = Promise.resolve()

export function setupAutoBackup(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'launching' && previous !== 'launching') {
      sessionStart = next.startedAt ?? Date.now()
      sessionVersion = next.versionId
    }
    const ended = next.state === 'exited' || next.state === 'crashed'
    const wasPlaying = previous === 'running' || previous === 'launching'
    if (!ended || !wasPlaying || !sessionVersion || !sessionStart) return
    const versionId = sessionVersion
    // 存档的保存时间可能比进程启动时间稍早一点点（文件系统的时间精度），往前放宽几秒
    const since = sessionStart - 5000
    const prune = next.state === 'exited'
    sessionStart = 0
    running = running
      .then(async () => {
        if (!(await getSettings()).autoBackupWorlds) return
        const { done, failed, paths } = await autoBackupWorlds(versionId, since, prune)
        if (done.length > 0) console.log(`已自动备份存档：${done.join('、')}`)
        // 开启了存档云备份：上传这次的自动备份
        if (paths.length > 0) void uploadIfEnabled(versionId, paths).catch(() => undefined)
        if (failed.length > 0) {
          console.warn(`这些存档自动备份失败：${failed.join('、')}`)
          void notify('存档自动备份失败', `这些存档没能备份：${failed.join('、')}，可以在存档页手动备份`)
        }
      })
      .catch((e) => console.warn('自动备份存档失败：', e))
  })
}
