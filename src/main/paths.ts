import { app } from 'electron'
import { join } from 'path'

/**
 * 固定用户数据目录（设置、账号、默认游戏目录都在这里）。
 * Electron 默认按程序名决定这个目录，以后打包时改了显示名称也不能让数据「消失」，
 * 所以必须在其他模块读取 userData 之前执行（index.ts 第一个导入本模块）。
 */
app.setPath('userData', join(app.getPath('appData'), 'mc_launcher'))
