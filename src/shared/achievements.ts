/** 启动器成就：在启动器里玩游戏时自动解锁，解锁时弹出 Minecraft 风格的「达成进度」提示 */
export const ACHIEVEMENTS = [
  { id: 'first_launch', title: '第一步', desc: '第一次用琉璃启动器启动游戏' },
  { id: 'modded', title: '模组世界', desc: '启动一个装了模组加载器的版本' },
  { id: 'continue_world', title: '无缝衔接', desc: '用「继续上次的存档」直接进入存档' },
  { id: 'join_server', title: '多人游戏', desc: '从服务器列表直接加入服务器' },
  { id: 'night_owl', title: '夜猫子', desc: '在凌晨 0~5 点玩游戏' },
  { id: 'early_bird', title: '早起的鸟儿', desc: '在早上 5~7 点玩游戏' },
  { id: 'marathon', title: '马拉松', desc: '一次连续玩满 3 小时' },
  { id: 'hours_10', title: '入门玩家', desc: '累计游玩 10 小时', target: 10 },
  { id: 'hours_100', title: '资深玩家', desc: '累计游玩 100 小时', target: 100 },
  { id: 'explorer', title: '版本收藏家', desc: '玩过 5 个不同的版本', target: 5 },
  { id: 'crash', title: '这不是 bug', desc: '第一次遇到游戏崩溃（别灰心！）' },
  { id: 'backup', title: '有备无患', desc: '第一次备份存档' },
  { id: 'ai_doctor', title: 'AI 医生', desc: '让 AI 助手分析一次崩溃' },
  { id: 'decorator', title: '装修达人', desc: '换上自己的启动器背景' }
] as const

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id']

export interface AchievementStatus {
  id: AchievementId
  title: string
  desc: string
  /** 解锁时间（毫秒时间戳），没有解锁时没有 */
  unlockedAt?: number
  /** 需要累计的成就的进度 */
  progress?: { current: number; target: number }
}

export function isAchievementId(id: unknown): id is AchievementId {
  return typeof id === 'string' && ACHIEVEMENTS.some((a) => a.id === id)
}
