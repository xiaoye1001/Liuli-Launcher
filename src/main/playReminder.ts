import { Notification } from 'electron'
import { getSettings } from './config'
import { onGameStatusChange } from './launch'

/**
 * 健康游戏提醒：游戏连续运行到设定的时间（30 分钟、1 小时……）时，弹一个系统通知提醒休息，
 * 之后每过同样的时间再提醒一次。只是通知，不打断游戏；设置为 0 时不提醒
 */
let timer: ReturnType<typeof setInterval> | null = null
let startedAt = 0

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} 小时${m > 0 ? ` ${m} 分钟` : ''}` : `${m} 分钟`
}

async function start(): Promise<void> {
  stop()
  const minutes = (await getSettings()).playReminderMinutes
  // 只接受 15 分钟到 10 小时（设置文件被手动改坏时不会每秒弹通知）
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600 || !Notification.isSupported()) return
  startedAt = Date.now()
  timer = setInterval(() => {
    new Notification({
      title: '休息一下吧',
      body: `你已经连续玩了 ${formatDuration(Date.now() - startedAt)}，起来活动一下、看看远处，眼睛会感谢你的`
    }).show()
  }, minutes * 60_000)
}

/** 启动时调用一次：游戏开始运行时计时，结束时停止 */
export function setupPlayReminder(): void {
  onGameStatusChange((next, previous) => {
    if (next.state === 'running' && previous !== 'running') void start()
    if (next.state !== 'running' && next.state !== 'launching') stop()
  })
}
