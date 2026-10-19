/**
 * 整合包「下载 → 进入安装确认页」的全局流程。
 * 下载在后台进行，不依赖下载页是否还在显示：期间切换到其它页面（例如去「更多 → 百宝箱」看进度），
 * 下载完成后也会自动回到下载页并打开安装确认页；下载失败的原因回到下载页也能看到。
 */
import { useSyncExternalStore } from 'react'
import type { ModpackInfo } from '../../../shared/types'

export interface ModpackFlowState {
  /** 正在下载的整合包版本 ID */
  versionId: string | null
  /** 正在下载的整合包名称 */
  title: string
  /** 最近一次下载失败的原因 */
  error: string
}

let state: ModpackFlowState = { versionId: null, title: '', error: '' }
const listeners = new Set<() => void>()
let readyHandler: ((info: ModpackInfo) => void) | null = null

function set(patch: Partial<ModpackFlowState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** 由一直存在的 App 注册：整合包下载并读取完成后打开安装确认页 */
export function setModpackReadyHandler(handler: ((info: ModpackInfo) => void) | null): void {
  readyHandler = handler
}

/** 下载整合包的某个版本；同一时间只下载一个 */
export async function downloadModpackVersion(versionId: string, title: string): Promise<void> {
  if (state.versionId) return
  set({ versionId, title, error: '' })
  try {
    const info = await window.api.downloadModpack(versionId)
    set({ versionId: null })
    readyHandler?.(info)
  } catch (e) {
    set({ versionId: null, error: `${title} 下载失败：${cleanError(e)}` })
  }
}

export function clearModpackError(): void {
  if (state.error) set({ error: '' })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useModpackFlow(): ModpackFlowState {
  return useSyncExternalStore(subscribe, () => state)
}
