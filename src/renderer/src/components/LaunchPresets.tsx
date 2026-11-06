import { useState } from 'react'
import { Check } from 'lucide-react'
import type { VersionConfig } from '../../../shared/types'

interface Preset {
  key: string
  name: string
  desc: string
  /** 这个预设会改的内容（给人看的） */
  details: string[]
  /** 至少要用 Java 几（低于时不能选） */
  minJava?: number
  patch: (totalMemory: number, memoryMax: number) => Partial<VersionConfig>
}

const round = (mb: number): number => Math.floor(mb / 256) * 256

/** 启动参数预设：一键套用内存和 JVM 参数（只改这两项，其他版本设置不动） */
export const LAUNCH_PRESETS: Preset[] = [
  {
    key: 'auto',
    name: '自动（推荐）',
    desc: '跟随全局设置：启动器按游戏版本、模组数量和电脑内存自动分配，并自动优化内存回收',
    details: ['内存：跟随全局（自动分配）', 'JVM 参数：不加'],
    patch: () => ({ maxMemory: 0, jvmArgs: '' })
  },
  {
    key: 'low',
    name: '省内存（低配电脑）',
    desc: '8 GB 以下内存的电脑、原版或少量模组；配合游戏设置里的画质「流畅」效果更好',
    details: ['内存：2 GB', 'JVM 参数：不加'],
    patch: (_total, max) => ({ maxMemory: Math.min(2048, max), jvmArgs: '' })
  },
  {
    key: 'big',
    name: '大型整合包',
    desc: '200 个以上模组的整合包：给 6～8 GB，内存不够时按本机内存的一半来给',
    details: ['内存：6～8 GB（不超过本机一半太多）', 'JVM 参数：不加（启动器会自动优化 G1 回收）'],
    patch: (total, max) => ({ maxMemory: Math.min(max, Math.max(4096, Math.min(8192, round(total / 2)))), jvmArgs: '' })
  },
  {
    key: 'zgc',
    name: '低卡顿（ZGC）',
    desc: '用 ZGC 回收器，减少回收造成的突然卡一下，但会多用一些内存；需要 Java 17 以上，16 GB 以上内存的电脑效果好',
    details: ['内存：不改', 'JVM 参数：-XX:+UseZGC'],
    minJava: 17,
    patch: () => ({ jvmArgs: '-XX:+UseZGC' })
  }
]

/** 现在的设置和哪个预设一样 */
function matching(config: VersionConfig, totalMemory: number, memoryMax: number): string | null {
  for (const preset of LAUNCH_PRESETS) {
    const patch = preset.patch(totalMemory, memoryMax)
    if (Object.entries(patch).every(([k, v]) => (config as unknown as Record<string, unknown>)[k] === v))
      return preset.key
  }
  return null
}

function LaunchPresets({
  config,
  totalMemory,
  memoryMax,
  javaMajor,
  onApply
}: {
  config: VersionConfig
  totalMemory: number
  memoryMax: number
  /** 这个版本用的 Java 主版本（自动选择时是游戏要求的版本）；不知道时不限制 */
  javaMajor?: number | null
  onApply: (patch: Partial<VersionConfig>) => void
}): JSX.Element {
  const [confirm, setConfirm] = useState<string | null>(null)
  const current = matching(config, totalMemory, memoryMax)

  const apply = (preset: Preset): void => {
    const patch = preset.patch(totalMemory, memoryMax)
    // 自己填过别的 JVM 参数：会被替换掉，先确认一次
    const replacing = 'jvmArgs' in patch && config.jvmArgs.trim() !== '' && config.jvmArgs.trim() !== patch.jvmArgs
    if (replacing && confirm !== preset.key) {
      setConfirm(preset.key)
      return
    }
    setConfirm(null)
    onApply(patch)
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="launch-presets">
      {LAUNCH_PRESETS.map((preset) => {
        const active = current === preset.key
        const blocked = !!preset.minJava && !!javaMajor && javaMajor < preset.minJava
        return (
          <button
            key={preset.key}
            onClick={() => apply(preset)}
            disabled={blocked}
            title={blocked ? `这个版本用 Java ${javaMajor}，ZGC 需要 Java ${preset.minJava} 以上` : undefined}
            aria-pressed={active}
            className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/5 bg-black/20 hover:bg-black/30'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {preset.name}
              {active && <Check className="h-4 w-4 text-emerald-300" />}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-white/50">{preset.desc}</div>
            <div className="mt-1.5 space-y-0.5 text-[11px] text-white/40">
              {preset.details.map((d) => (
                <div key={d}>· {d}</div>
              ))}
            </div>
            {confirm === preset.key && (
              <div className="mt-2 rounded-lg bg-amber-500/15 px-2 py-1 text-xs text-amber-200">
                会替换掉你填的 JVM 参数「{config.jvmArgs.trim()}」，再点一次确认
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default LaunchPresets
