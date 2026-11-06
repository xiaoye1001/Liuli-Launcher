import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Plus, TerminalSquare, X } from 'lucide-react'
import {
  ERA_LABELS,
  TEXT_COLORS,
  effectCommand,
  eraOf,
  giveCommand,
  summonCommand,
  tellrawCommand,
  type CommandEra,
  type EnchantmentChoice
} from '../utils/commandGen'

const ITEMS: [string, string][] = [
  ['diamond_sword', '钻石剑'],
  ['netherite_sword', '下界合金剑'],
  ['diamond_pickaxe', '钻石镐'],
  ['netherite_pickaxe', '下界合金镐'],
  ['diamond_axe', '钻石斧'],
  ['netherite_axe', '下界合金斧'],
  ['diamond_shovel', '钻石锹'],
  ['bow', '弓'],
  ['crossbow', '弩'],
  ['trident', '三叉戟'],
  ['mace', '重锤（1.21）'],
  ['fishing_rod', '钓鱼竿'],
  ['shield', '盾牌'],
  ['elytra', '鞘翅'],
  ['diamond_helmet', '钻石头盔'],
  ['diamond_chestplate', '钻石胸甲'],
  ['diamond_leggings', '钻石护腿'],
  ['diamond_boots', '钻石靴子'],
  ['netherite_helmet', '下界合金头盔'],
  ['netherite_chestplate', '下界合金胸甲'],
  ['netherite_leggings', '下界合金护腿'],
  ['netherite_boots', '下界合金靴子'],
  ['turtle_helmet', '海龟壳'],
  ['book', '书（附魔用）'],
  ['enchanted_golden_apple', '附魔金苹果'],
  ['golden_apple', '金苹果'],
  ['totem_of_undying', '不死图腾'],
  ['diamond', '钻石'],
  ['netherite_ingot', '下界合金锭'],
  ['emerald', '绿宝石'],
  ['ender_pearl', '末影珍珠'],
  ['firework_rocket', '烟花火箭'],
  ['experience_bottle', '附魔之瓶'],
  ['beacon', '信标'],
  ['nether_star', '下界之星'],
  ['command_block', '命令方块'],
  ['barrier', '屏障'],
  ['light', '光源方块'],
  ['spawner', '刷怪笼'],
  ['name_tag', '命名牌']
]

/** 附魔：ID、中文名、生存模式里的最高等级 */
const ENCHANTMENTS: [string, string, number][] = [
  ['sharpness', '锋利', 5],
  ['smite', '亡灵杀手', 5],
  ['bane_of_arthropods', '节肢杀手', 5],
  ['knockback', '击退', 2],
  ['fire_aspect', '火焰附加', 2],
  ['looting', '抢夺', 3],
  ['sweeping_edge', '横扫之刃', 3],
  ['efficiency', '效率', 5],
  ['silk_touch', '精准采集', 1],
  ['fortune', '时运', 3],
  ['unbreaking', '耐久', 3],
  ['mending', '经验修补', 1],
  ['protection', '保护', 4],
  ['fire_protection', '火焰保护', 4],
  ['blast_protection', '爆炸保护', 4],
  ['projectile_protection', '弹射物保护', 4],
  ['feather_falling', '摔落保护', 4],
  ['respiration', '水下呼吸', 3],
  ['aqua_affinity', '水下速掘', 1],
  ['thorns', '荆棘', 3],
  ['depth_strider', '深海探索者', 3],
  ['frost_walker', '冰霜行者', 2],
  ['soul_speed', '灵魂疾行', 3],
  ['swift_sneak', '迅捷潜行', 3],
  ['power', '力量', 5],
  ['punch', '冲击', 2],
  ['flame', '火矢', 1],
  ['infinity', '无限', 1],
  ['multishot', '多重射击', 1],
  ['piercing', '穿透', 4],
  ['quick_charge', '快速装填', 3],
  ['loyalty', '忠诚', 3],
  ['riptide', '激流', 3],
  ['channeling', '引雷', 1],
  ['impaling', '穿刺', 5],
  ['luck_of_the_sea', '海之眷顾', 3],
  ['lure', '饵钓', 3],
  ['density', '致密（1.21）', 5],
  ['breach', '破甲（1.21）', 4],
  ['wind_burst', '风爆（1.21）', 3]
]

const EFFECTS: [string, string][] = [
  ['speed', '速度'],
  ['haste', '急迫'],
  ['strength', '力量'],
  ['jump_boost', '跳跃提升'],
  ['regeneration', '生命恢复'],
  ['resistance', '抗性提升'],
  ['fire_resistance', '抗火'],
  ['water_breathing', '水下呼吸'],
  ['night_vision', '夜视'],
  ['invisibility', '隐身'],
  ['health_boost', '生命提升'],
  ['absorption', '伤害吸收'],
  ['saturation', '饱和'],
  ['slow_falling', '缓降'],
  ['glowing', '发光'],
  ['levitation', '飘浮'],
  ['luck', '幸运'],
  ['conduit_power', '潮涌能量'],
  ['dolphins_grace', '海豚的恩惠'],
  ['instant_health', '瞬间治疗'],
  ['instant_damage', '瞬间伤害'],
  ['slowness', '缓慢'],
  ['mining_fatigue', '挖掘疲劳'],
  ['weakness', '虚弱'],
  ['poison', '中毒'],
  ['wither', '凋零'],
  ['hunger', '饥饿'],
  ['nausea', '反胃'],
  ['blindness', '失明'],
  ['darkness', '黑暗（1.19）']
]

const ENTITIES: [string, string][] = [
  ['zombie', '僵尸'],
  ['skeleton', '骷髅'],
  ['creeper', '苦力怕'],
  ['spider', '蜘蛛'],
  ['enderman', '末影人'],
  ['witch', '女巫'],
  ['villager', '村民'],
  ['iron_golem', '铁傀儡'],
  ['wolf', '狼'],
  ['cat', '猫'],
  ['horse', '马'],
  ['pig', '猪'],
  ['cow', '牛'],
  ['sheep', '羊'],
  ['chicken', '鸡'],
  ['allay', '悦灵（1.19）'],
  ['warden', '监守者（1.19）'],
  ['wither', '凋灵'],
  ['ender_dragon', '末影龙'],
  ['armor_stand', '盔甲架'],
  ['lightning_bolt', '闪电']
]

const COLOR_NAMES: Record<string, [string, string]> = {
  black: ['黑色', '#000000'],
  dark_blue: ['深蓝', '#0000AA'],
  dark_green: ['深绿', '#00AA00'],
  dark_aqua: ['湖蓝', '#00AAAA'],
  dark_red: ['深红', '#AA0000'],
  dark_purple: ['紫色', '#AA00AA'],
  gold: ['金色', '#FFAA00'],
  gray: ['灰色', '#AAAAAA'],
  dark_gray: ['深灰', '#555555'],
  blue: ['蓝色', '#5555FF'],
  green: ['绿色', '#55FF55'],
  aqua: ['天蓝', '#55FFFF'],
  red: ['红色', '#FF5555'],
  light_purple: ['粉色', '#FF55FF'],
  yellow: ['黄色', '#FFFF55'],
  white: ['白色', '#FFFFFF']
}

const TARGETS: [string, string][] = [
  ['@p', '最近的玩家'],
  ['@s', '自己'],
  ['@a', '所有玩家']
]

type Tab = 'give' | 'effect' | 'summon' | 'tellraw'
const TABS: [Tab, string][] = [
  ['give', '给物品'],
  ['effect', '状态效果'],
  ['summon', '召唤生物'],
  ['tellraw', '彩色文字']
]

const INPUT =
  'w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-emerald-400/50'
const SELECT = `${INPUT} cursor-pointer`
const OPTION = 'bg-slate-800 text-white'

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-white/50">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Check2({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** 百宝箱：命令生成器（Java 版） */
function CommandGeneratorPanel(): JSX.Element {
  const [era, setEra] = useState<CommandEra>('snbt')
  const [tab, setTab] = useState<Tab>('give')
  const [target, setTarget] = useState('@p')
  const [copied, setCopied] = useState(false)
  // 给物品
  const [item, setItem] = useState('diamond_sword')
  const [count, setCount] = useState('1')
  const [itemName, setItemName] = useState('')
  const [enchants, setEnchants] = useState<EnchantmentChoice[]>([{ id: 'sharpness', level: 5 }])
  const [unbreakable, setUnbreakable] = useState(false)
  // 状态效果
  const [effect, setEffect] = useState('night_vision')
  const [seconds, setSeconds] = useState('60')
  const [infinite, setInfinite] = useState(false)
  const [level, setLevel] = useState('1')
  const [hideParticles, setHideParticles] = useState(true)
  // 召唤
  const [entity, setEntity] = useState('zombie')
  const [mobName, setMobName] = useState('')
  const [showName, setShowName] = useState(true)
  const [noAI, setNoAI] = useState(false)
  const [invulnerable, setInvulnerable] = useState(false)
  const [silent, setSilent] = useState(false)
  const [persistent, setPersistent] = useState(true)
  // 彩色文字
  const [text, setText] = useState('欢迎来到我的服务器！')
  const [color, setColor] = useState('gold')
  const [bold, setBold] = useState(true)
  const [italic, setItalic] = useState(false)
  const [underlined, setUnderlined] = useState(false)

  // 默认按主页选择的版本选格式
  useEffect(() => {
    void Promise.all([window.api.getSettings(), window.api.getInstalledVersions()])
      .then(([settings, versions]) => {
        const v = versions.find((x) => x.id === settings.selectedVersion)
        if (v?.minecraftVersion) setEra(eraOf(v.minecraftVersion))
      })
      .catch(() => undefined)
  }, [])

  const result = useMemo((): { command?: string; error?: string } => {
    try {
      if (tab === 'give') {
        return {
          command: giveCommand(
            { target, item, count: Number(count), name: itemName, enchantments: enchants, unbreakable },
            era
          )
        }
      }
      if (tab === 'effect') {
        return {
          command: effectCommand(
            { target, effect, seconds: infinite ? null : Number(seconds), level: Number(level), hideParticles },
            era
          )
        }
      }
      if (tab === 'summon') {
        return {
          command: summonCommand({ entity, name: mobName, showName, noAI, invulnerable, silent, persistent }, era)
        }
      }
      return { command: tellrawCommand({ target, text, color, bold, italic, underlined }, era) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [
    tab,
    era,
    target,
    item,
    count,
    itemName,
    enchants,
    unbreakable,
    effect,
    seconds,
    infinite,
    level,
    hideParticles,
    entity,
    mobName,
    showName,
    noAI,
    invulnerable,
    silent,
    persistent,
    text,
    color,
    bold,
    italic,
    underlined
  ])

  const copy = (): void => {
    if (!result.command) return
    void navigator.clipboard.writeText(result.command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const targetField = (
    <Field label="给谁">
      <div className="flex gap-1.5">
        <select
          value={TARGETS.some(([t]) => t === target) ? target : ''}
          onChange={(e) => setTarget(e.target.value || '')}
          aria-label="目标"
          className={SELECT}
        >
          {TARGETS.map(([t, label]) => (
            <option key={t} value={t} className={OPTION}>
              {label}（{t}）
            </option>
          ))}
          <option value="" className={OPTION}>
            指定玩家…
          </option>
        </select>
        {!TARGETS.some(([t]) => t === target) && (
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="玩家名"
            aria-label="玩家名"
            className={`${INPUT} font-mono`}
          />
        )}
      </div>
    </Field>
  )

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <TerminalSquare className="h-5 w-5 text-emerald-300" />
        <h2 className="font-semibold">命令生成器</h2>
        <span className="text-xs text-white/50">Java 版 · 填表生成命令，一键复制到游戏里</span>
        <select
          value={era}
          onChange={(e) => setEra(e.target.value as CommandEra)}
          aria-label="游戏版本"
          className="ml-auto cursor-pointer rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs outline-none"
        >
          {(Object.keys(ERA_LABELS) as CommandEra[]).map((e) => (
            <option key={e} value={e} className={OPTION}>
              {ERA_LABELS[e]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 rounded-xl bg-black/20 p-1" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              tab === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'give' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {targetField}
            <Field label="物品">
              <select
                value={ITEMS.some(([id]) => id === item) ? item : ''}
                onChange={(e) => setItem(e.target.value)}
                aria-label="物品"
                className={SELECT}
              >
                {ITEMS.map(([id, name]) => (
                  <option key={id} value={id} className={OPTION}>
                    {name}
                  </option>
                ))}
                <option value="" className={OPTION}>
                  其他（自己填 ID）…
                </option>
              </select>
              {!ITEMS.some(([id]) => id === item) && (
                <input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="例如 minecraft:oak_log"
                  aria-label="物品 ID"
                  className={`mt-1.5 font-mono ${INPUT}`}
                />
              )}
            </Field>
            <Field label="数量">
              <input
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                aria-label="数量"
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="名字（可以不填）">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              maxLength={50}
              placeholder="例如 屠龙宝刀"
              aria-label="物品名字"
              className={INPUT}
            />
          </Field>
          <div>
            <div className="text-xs text-white/50">附魔</div>
            <div className="mt-1 space-y-1.5">
              {enchants.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={e.id}
                    onChange={(ev) =>
                      setEnchants(enchants.map((x, j) => (j === i ? { ...x, id: ev.target.value } : x)))
                    }
                    aria-label={`附魔 ${i + 1}`}
                    className={`${SELECT} flex-1`}
                  >
                    {ENCHANTMENTS.map(([id, name, max]) => (
                      <option key={id} value={id} className={OPTION}>
                        {name}（最高 {max} 级）
                      </option>
                    ))}
                  </select>
                  <input
                    value={e.level}
                    onChange={(ev) =>
                      setEnchants(
                        enchants.map((x, j) =>
                          j === i ? { ...x, level: Number(ev.target.value.replace(/\D/g, '').slice(0, 3)) || 0 } : x
                        )
                      )
                    }
                    inputMode="numeric"
                    aria-label={`附魔 ${i + 1} 等级`}
                    className="w-16 shrink-0 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400/50"
                  />
                  <span className="shrink-0 text-xs text-white/40">级</span>
                  <button
                    onClick={() => setEnchants(enchants.filter((_, j) => j !== i))}
                    title="去掉这个附魔"
                    aria-label={`去掉附魔 ${i + 1}`}
                    className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setEnchants([
                    ...enchants,
                    {
                      id: ENCHANTMENTS.find(([id]) => !enchants.some((x) => x.id === id))?.[0] ?? 'unbreaking',
                      level: 1
                    }
                  ])
                }
                disabled={enchants.length >= 12}
                className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                添加附魔
              </button>
            </div>
          </div>
          <Check2 label="无法破坏（永不损坏）" checked={unbreakable} onChange={setUnbreakable} />
        </div>
      )}

      {tab === 'effect' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {targetField}
            <Field label="效果">
              <select value={effect} onChange={(e) => setEffect(e.target.value)} aria-label="效果" className={SELECT}>
                {EFFECTS.map(([id, name]) => (
                  <option key={id} value={id} className={OPTION}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="持续时间（秒）">
              <input
                value={infinite ? '' : seconds}
                disabled={infinite}
                onChange={(e) => setSeconds(e.target.value.replace(/\D/g, '').slice(0, 7))}
                placeholder={infinite ? '无限' : ''}
                inputMode="numeric"
                aria-label="持续时间"
                className={`${INPUT} disabled:opacity-50`}
              />
            </Field>
            <Field label="等级">
              <input
                value={level}
                onChange={(e) => setLevel(e.target.value.replace(/\D/g, '').slice(0, 3))}
                inputMode="numeric"
                aria-label="效果等级"
                className={INPUT}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check2
              label={era === 'legacy' ? '很长时间（1.19.4 以上可以无限）' : '无限时间'}
              checked={infinite}
              onChange={setInfinite}
            />
            <Check2 label="隐藏粒子" checked={hideParticles} onChange={setHideParticles} />
          </div>
        </div>
      )}

      {tab === 'summon' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="生物">
              <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="生物" className={SELECT}>
                {ENTITIES.map(([id, name]) => (
                  <option key={id} value={id} className={OPTION}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="名字（可以不填）">
              <input
                value={mobName}
                onChange={(e) => setMobName(e.target.value)}
                maxLength={50}
                placeholder="例如 小明"
                aria-label="生物名字"
                className={INPUT}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check2 label="一直显示名字" checked={showName} onChange={setShowName} />
            <Check2 label="不会动（没有 AI）" checked={noAI} onChange={setNoAI} />
            <Check2 label="无敌" checked={invulnerable} onChange={setInvulnerable} />
            <Check2 label="不出声" checked={silent} onChange={setSilent} />
            <Check2 label="不会消失" checked={persistent} onChange={setPersistent} />
          </div>
          <p className="text-xs text-white/40">在你站的位置（~ ~ ~）召唤</p>
        </div>
      )}

      {tab === 'tellraw' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            {targetField}
            <Field label="文字">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                aria-label="文字"
                className={INPUT}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                title={COLOR_NAMES[c][0]}
                className={`h-6 w-6 rounded-md border-2 ${color === c ? 'border-white' : 'border-white/20'}`}
                style={{ background: COLOR_NAMES[c][1] }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <Check2 label="粗体" checked={bold} onChange={setBold} />
            <Check2 label="斜体" checked={italic} onChange={setItalic} />
            <Check2 label="下划线" checked={underlined} onChange={setUnderlined} />
          </div>
          <div className="rounded-lg px-3 py-2 font-mono text-sm" style={{ background: '#16161b' }}>
            <span
              style={{
                color: COLOR_NAMES[color][1],
                fontWeight: bold ? 700 : undefined,
                fontStyle: italic ? 'italic' : undefined,
                textDecoration: underlined ? 'underline' : undefined
              }}
            >
              {text}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-black/30 p-3">
        {result.command ? (
          <div className="flex items-start gap-2">
            <code
              className="min-w-0 flex-1 select-text break-all font-mono text-sm text-emerald-200"
              data-testid="command-output"
            >
              {result.command}
            </code>
            <button
              onClick={copy}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        ) : (
          <div className="text-xs text-rose-300">{result.error}</div>
        )}
      </div>
      <p className="text-xs text-white/40">
        在游戏里按 T 打开聊天栏粘贴（需要开启作弊或是管理员）；放进命令方块时去掉开头的
        /。不同版本的命令写法不一样，右上角选和游戏一致的版本
      </p>
    </section>
  )
}

export default CommandGeneratorPanel
