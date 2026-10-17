import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Loader2, Search } from 'lucide-react'
import type { WorldDetails, WorldDifficulty } from '../../../shared/types'

function cleanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const DIFFICULTY_LABELS: Record<WorldDifficulty, string> = {
  peaceful: '和平',
  easy: '简单',
  normal: '普通',
  hard: '困难'
}

const WORLD_TYPE_LABELS: Record<string, string> = {
  normal: '默认',
  flat: '超平坦',
  large_biomes: '巨型生物群系',
  amplified: '放大化',
  single_biome: '单一生物群系',
  debug: '调试模式',
  custom: '自定义',
  nether: '下界',
  end: '末地',
  caves: '洞穴',
  floating_islands: '浮岛'
}

const DIMENSION_LABELS: Record<string, string> = {
  overworld: '主世界',
  the_nether: '下界',
  the_end: '末地'
}

/** 常用游戏规则的中文名和默认值（用于标出改过的规则） */
const GAME_RULES: Record<string, { label: string; default?: string }> = {
  keep_inventory: { label: '死亡后保留物品栏', default: 'false' },
  do_daylight_cycle: { label: '昼夜更替', default: 'true' },
  advance_time: { label: '昼夜更替', default: 'true' },
  do_weather_cycle: { label: '天气变化', default: 'true' },
  advance_weather: { label: '天气变化', default: 'true' },
  do_mob_spawning: { label: '生成生物', default: 'true' },
  spawn_mobs: { label: '生成生物', default: 'true' },
  spawn_monsters: { label: '生成怪物', default: 'true' },
  mob_griefing: { label: '生物破坏方块（苦力怕爆炸、末影人搬方块等）', default: 'true' },
  do_fire_tick: { label: '火焰蔓延', default: 'true' },
  natural_regeneration: { label: '自然恢复生命值', default: 'true' },
  show_death_messages: { label: '显示死亡消息', default: 'true' },
  do_immediate_respawn: { label: '立即重生（跳过死亡界面）', default: 'false' },
  immediate_respawn: { label: '立即重生（跳过死亡界面）', default: 'false' },
  players_sleeping_percentage: { label: '跳过夜晚需要睡觉的玩家比例（%）', default: '100' },
  random_tick_speed: { label: '随机刻速度（作物生长等）', default: '3' },
  do_insomnia: { label: '生成幻翼', default: 'true' },
  spawn_phantoms: { label: '生成幻翼', default: 'true' },
  do_patrol_spawning: { label: '生成灾厄巡逻队', default: 'true' },
  spawn_patrols: { label: '生成灾厄巡逻队', default: 'true' },
  do_trader_spawning: { label: '生成流浪商人', default: 'true' },
  spawn_wandering_traders: { label: '生成流浪商人', default: 'true' },
  do_warden_spawning: { label: '生成监守者', default: 'true' },
  spawn_wardens: { label: '生成监守者', default: 'true' },
  announce_advancements: { label: '公告进度', default: 'true' },
  show_advancement_messages: { label: '公告进度', default: 'true' },
  command_block_output: { label: '命令方块输出提示', default: 'true' },
  do_entity_drops: { label: '实体掉落物（矿车、物品展示框等）', default: 'true' },
  entity_drops: { label: '实体掉落物（矿车、物品展示框等）', default: 'true' },
  do_tile_drops: { label: '方块掉落物', default: 'true' },
  block_drops: { label: '方块掉落物', default: 'true' },
  do_mob_loot: { label: '生物掉落物', default: 'true' },
  mob_drops: { label: '生物掉落物', default: 'true' },
  fall_damage: { label: '摔落伤害', default: 'true' },
  fire_damage: { label: '火焰伤害', default: 'true' },
  drowning_damage: { label: '溺水伤害', default: 'true' },
  freeze_damage: { label: '冰冻伤害', default: 'true' },
  pvp: { label: '玩家之间可以互相伤害', default: 'true' },
  spawn_radius: { label: '重生点范围（格）', default: '10' },
  respawn_radius: { label: '重生点范围（格）', default: '10' },
  max_entity_cramming: { label: '实体挤压上限', default: '24' },
  forgive_dead_players: { label: '中立生物原谅死亡的玩家', default: 'true' },
  universal_anger: { label: '中立生物攻击所有玩家', default: 'false' },
  disable_raids: { label: '禁用袭击', default: 'false' },
  raids: { label: '袭击', default: 'true' },
  do_limited_crafting: { label: '只能合成已解锁的配方', default: 'false' },
  limited_crafting: { label: '只能合成已解锁的配方', default: 'false' },
  reduced_debug_info: { label: '简化调试信息（F3）', default: 'false' },
  send_command_feedback: { label: '显示命令反馈', default: 'true' },
  spectators_generate_chunks: { label: '旁观者可以生成区块', default: 'true' },
  log_admin_commands: { label: '记录管理员命令', default: 'true' },
  disable_elytra_movement_check: { label: '关闭鞘翅移动检查', default: 'false' },
  max_command_chain_length: { label: '命令连锁执行上限', default: '65536' },
  do_vines_spread: { label: '藤蔓蔓延', default: 'true' },
  spread_vines: { label: '藤蔓蔓延', default: 'true' },
  snow_accumulation_height: { label: '积雪最大层数', default: '1' },
  water_source_conversion: { label: '水可以形成水源', default: 'true' },
  lava_source_conversion: { label: '熔岩可以形成熔岩源', default: 'false' },
  block_explosion_drop_decay: { label: '方块爆炸时部分掉落物消失', default: 'true' },
  mob_explosion_drop_decay: { label: '生物爆炸时部分掉落物消失', default: 'true' },
  tnt_explosion_drop_decay: { label: 'TNT 爆炸时部分掉落物消失', default: 'false' },
  global_sound_events: { label: '全局声音事件（末影龙死亡等）', default: 'true' },
  projectiles_can_break_blocks: { label: '弹射物可以破坏方块', default: 'true' },
  ender_pearls_vanish_on_death: { label: '玩家死亡时末影珍珠消失', default: 'true' },
  spawn_chunk_radius: { label: '出生点区块常驻半径', default: '2' },
  tnt_explodes: { label: 'TNT 可以爆炸', default: 'true' },
  locator_bar: { label: '显示定位栏', default: 'true' },
  allow_entering_nether_using_portals: { label: '可以通过传送门进入下界', default: 'true' },
  command_blocks_work: { label: '命令方块可以使用', default: 'true' }
}

/** keepInventory / minecraft:keep_inventory → keep_inventory */
function ruleKey(key: string): string {
  return key
    .replace(/^minecraft:/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

function Field({
  label,
  children,
  className = ''
}: {
  label: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={`min-w-0 rounded-lg bg-black/20 px-3 py-2 ${className}`}>
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-0.5 truncate text-sm">{children}</div>
    </div>
  )
}

/** 存档详情：种子、难度、世界类型、时间天气、出生点、玩家位置、游戏规则 */
function WorldDetailsPanel({ versionId, folder }: { versionId: string; folder: string }): JSX.Element {
  const [details, setDetails] = useState<WorldDetails | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)

  useEffect(() => {
    window.api
      .getWorldDetails(versionId, folder)
      .then(setDetails)
      .catch((e) => setError(cleanError(e)))
  }, [versionId, folder])

  const rules = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return (details?.gameRules ?? [])
      .map((rule) => {
        const info = GAME_RULES[ruleKey(rule.key)]
        return { ...rule, label: info?.label, changed: info?.default !== undefined && info.default !== rule.value }
      })
      .filter((r) => !changedOnly || r.changed)
      .filter((r) => !kw || r.key.toLowerCase().includes(kw) || (r.label ?? '').includes(kw))
      .sort((a, b) => Number(b.changed) - Number(a.changed))
  }, [details, keyword, changedOnly])
  const changedCount = (details?.gameRules ?? []).filter((rule) => {
    const info = GAME_RULES[ruleKey(rule.key)]
    return info?.default !== undefined && info.default !== rule.value
  }).length

  if (error) return <div className="border-t border-white/10 px-4 py-3 text-xs text-red-300">{error}</div>
  if (!details) {
    return (
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在读取存档信息…
      </div>
    )
  }

  const copySeed = async (): Promise<void> => {
    if (!details.seed) return
    await navigator.clipboard.writeText(details.seed)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const weather = { clear: '晴天', rain: '下雨', thunder: '雷雨' }[details.weather]
  const p = details.player

  return (
    <div className="space-y-3 border-t border-white/10 px-4 py-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="col-span-2 min-w-0 rounded-lg bg-black/20 px-3 py-2">
          <div className="text-xs text-white/50">种子</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="select-text truncate font-mono text-sm">{details.seed ?? '未知'}</span>
            {details.seed && (
              <button
                onClick={copySeed}
                title="复制种子"
                className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
        <Field label="难度">
          {details.difficulty ? DIFFICULTY_LABELS[details.difficulty] : '未知'}
          {details.difficultyLocked && <span className="ml-1 text-xs text-white/50">（已锁定）</span>}
        </Field>
        <Field label="世界类型">
          {details.worldType ? (WORLD_TYPE_LABELS[details.worldType] ?? details.worldType) : '未知'}
        </Field>
        <Field label="游戏时间">
          {details.day !== undefined ? `第 ${details.day} 天` : '未知'}
          {details.timeOfDay && <span className="ml-1 text-white/60">{details.timeOfDay}</span>}
          <span className="ml-1 text-white/60">· {weather}</span>
        </Field>
        <Field label="出生点">
          {details.spawn ? `${details.spawn.x}, ${details.spawn.y}, ${details.spawn.z}` : '未知'}
        </Field>
        <Field label="玩家位置">
          {p ? `${DIMENSION_LABELS[p.dimension] ?? p.dimension} ${p.x}, ${p.y}, ${p.z}` : '没有记录'}
        </Field>
        <Field label="存档大小">
          {formatSize(details.size)}
          {details.datapacks > 0 && <span className="ml-1 text-white/60">· {details.datapacks} 个数据包</span>}
        </Field>
        {p && (p.health !== undefined || p.level !== undefined) && (
          <Field label="玩家状态" className="col-span-2">
            {p.health !== undefined && `生命 ${Math.round(p.health * 10) / 10}`}
            {p.food !== undefined && ` · 饥饿 ${p.food}`}
            {p.level !== undefined && ` · 等级 ${p.level}`}
          </Field>
        )}
      </div>

      {details.gameRules.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/70">游戏规则</span>
            <span className="text-xs text-white/40">
              {details.gameRules.length} 条{changedCount > 0 && `，${changedCount} 条改过`}
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-white/50">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(e) => setChangedOnly(e.target.checked)}
                className="accent-emerald-500"
              />
              只看改过的
            </label>
            <div className="flex w-44 items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
              <Search className="h-3.5 w-3.5 text-white/40" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索规则"
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto pr-1 md:grid-cols-2">
            {rules.map((rule) => (
              <div
                key={rule.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                  rule.changed ? 'bg-amber-500/15' : 'bg-black/20'
                }`}
                title={rule.changed ? '和默认值不同' : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{rule.label ?? rule.key}</div>
                  {rule.label && <div className="truncate font-mono text-[11px] text-white/40">{rule.key}</div>}
                </div>
                <span
                  className={`shrink-0 font-mono ${
                    rule.value === 'true'
                      ? 'text-emerald-300'
                      : rule.value === 'false'
                        ? 'text-white/50'
                        : rule.changed
                          ? 'text-amber-300'
                          : ''
                  }`}
                >
                  {rule.value === 'true' ? '开' : rule.value === 'false' ? '关' : rule.value}
                </span>
              </div>
            ))}
            {rules.length === 0 && <div className="py-3 text-center text-xs text-white/40">没有符合条件的规则</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default WorldDetailsPanel
