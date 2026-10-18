/** 主页欢迎语：支持在文字里插入变量 */

export const WELCOME_VARIABLES: { key: string; label: string }[] = [
  { key: '{name}', label: '玩家名' },
  { key: '{greeting}', label: '问候语' },
  { key: '{version}', label: '当前版本' },
  { key: '{tip}', label: '随机小贴士' }
]

/** 随机小贴士（每次打开启动器换一条） */
const TIPS = [
  '在版本设置里可以为每个版本单独设置内存和 Java。',
  '把整合包文件直接拖进窗口就能安装。',
  '按 Ctrl + 加号 / 减号可以调整界面大小。',
  '游戏崩溃后，主页会显示崩溃原因和解决办法。',
  '在下载页可以直接搜索并安装模组、光影和资源包。',
  '「设置 → 个性化」里可以换主题色、背景图片和背景音乐。',
  '版本隔离可以让每个版本的模组和存档互不影响。',
  '在服务器页保存常去的服务器，一键进入。',
  '分享日志时会自动去掉账号令牌和电脑上的路径。',
  '下载慢的话，可以在设置里切换下载源。',
  '睡觉前记得把床放好，免得重生点丢了。',
  '挖矿时别往脚下直挖，小心掉进岩浆。',
  '钻石通常出现在很深的地下，带够火把再出发。',
  '苦力怕靠近时会发出嘶嘶声，听到就快跑。',
  '附魔台周围摆满书架，能附上更高级的魔咒。',
  '下界里不能睡觉，床会爆炸。',
  '用剪刀剪树叶，可以直接得到树叶方块。',
  '把南瓜戴在头上，看末影人就不会惹怒它们。'
]

const sessionTip = TIPS[Math.floor(Math.random() * TIPS.length)]

/** 按当前时间返回问候语 */
export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export interface WelcomeValues {
  name: string
  version: string
}

/** 把模板里的变量替换成实际内容 */
export function renderWelcome(template: string, values: WelcomeValues): string {
  return template.replace(/\{(name|greeting|version|tip)\}/g, (_, key: string) => {
    if (key === 'name') return values.name || '玩家'
    if (key === 'greeting') return greeting()
    if (key === 'version') return values.version || '未选择版本'
    return sessionTip
  })
}
