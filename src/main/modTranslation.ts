import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { installFromModrinth } from './modrinth'
import { assertGameStopped, listMods, modsContextOf } from './mods'
import type { ModTranslationResult } from '../shared/types'

/**
 * 模组汉化：安装 CFPA（简体中文模组汉化组）的 I18nUpdateMod。这个模组在每次进入游戏时自动下载、
 * 更新社区翻译的模组汉化资源包，玩家不用自己找汉化包，模组更新后汉化也会跟着更新。
 * 汉化只在游戏语言是简体中文时生效。只安装这个固定的 Modrinth 项目，不按名字搜索
 */
const SLUG = 'i18nupdatemod'
const MOD_IDS = ['i18nupdatemod', 'i18nupdate']

/** 游戏语言是不是简体中文（读 options.txt；还没有时看「新版本默认简体中文」会不会设置） */
async function usesChinese(gamePath: string): Promise<boolean | null> {
  const file = join(gamePath, 'options.txt')
  if (!existsSync(file)) return null
  const text = await readFile(file, 'utf-8').catch(() => '')
  const lang = /^lang:(.*)$/m.exec(text)?.[1]?.trim().toLowerCase()
  return lang === 'zh_cn'
}

export async function installModTranslation(versionId: string): Promise<ModTranslationResult> {
  assertGameStopped(versionId)
  const ctx = await modsContextOf(versionId)
  if (!ctx.loader) {
    throw new Error('原版不需要模组汉化：原版游戏本身就有简体中文。装了模组的版本才需要')
  }
  const chinese = await usesChinese(dirname(ctx.dir))
  const mods = (await listMods(versionId)).mods
  if (mods.some((m) => MOD_IDS.includes(m.modId.toLowerCase()) || /i18nupdate/i.test(m.fileName))) {
    return { installed: false, already: true, chinese }
  }
  let title: string
  try {
    title = (await installFromModrinth(versionId, SLUG)).installed.find((m) => !m.dependency)?.title ?? 'I18nUpdateMod'
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/没有适用于/.test(message)) throw new Error(`模组汉化暂时不支持 ${ctx.minecraftVersion} 的这个加载器`)
    // 只装固定的这个项目：不按名字搜索，免得装上名字相似的其他模组
    if (/HTTP 404/.test(message))
      throw new Error('在 Modrinth 上找不到 I18nUpdateMod，请稍后再试或在「下载模组」里搜索')
    throw e
  }
  return { installed: true, already: false, chinese, title }
}
