/**
 * 哪些游戏目录正在被游戏使用：主游戏（启动中、运行中）和多开的游戏窗口。
 * 没开版本隔离的版本共用同一个游戏目录（存档、配置），所以比较的是游戏目录，不只是版本名
 */
import { dirname, resolve } from 'path'
import { getGameStatus } from './launch'
import { listExtraInstances } from './extraInstances'
import { modsContextOf } from './mods'

/** 正在运行的游戏用的版本 */
export function runningVersionIds(): string[] {
  const ids: string[] = []
  const game = getGameStatus()
  if ((game.state === 'launching' || game.state === 'running') && game.versionId) ids.push(game.versionId)
  for (const extra of listExtraInstances()) if (extra.state === 'running') ids.push(extra.versionId)
  return [...new Set(ids)]
}

async function gameDirOf(versionId: string): Promise<string> {
  return resolve(dirname((await modsContextOf(versionId)).dir)).toLowerCase()
}

/** 这个版本的游戏目录正在被运行中的游戏使用时报错 */
export async function assertGameDirFree(versionId: string, what: string): Promise<void> {
  const running = runningVersionIds()
  if (running.length === 0) return
  if (running.includes(versionId)) throw new Error(`游戏正在运行，请退出游戏后再${what}`)
  const target = await gameDirOf(versionId).catch(() => '')
  for (const id of running) {
    const dir = await gameDirOf(id).catch(() => '')
    if (dir && target && dir === target) throw new Error(`游戏（${id}）正在使用同一个游戏目录，请退出游戏后再${what}`)
  }
}
