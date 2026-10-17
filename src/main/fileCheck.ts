import { readFile } from 'fs/promises'
import {
  diagnoseAssetIndex,
  diagnoseAssets,
  diagnoseJar,
  diagnoseLibraries,
  MinecraftFolder,
  type ResolvedLibrary,
  type ResolvedVersion
} from '@xmcl/core'

/** 启动前检查发现的缺失或损坏的文件 */
export interface MissingFiles {
  /** 游戏本体 jar */
  jar: boolean
  /** 资源索引文件（缺失时需要重新下载全部资源） */
  assetIndex: boolean
  libraries: ResolvedLibrary[]
  assets: { name: string; hash: string; size: number }[]
  /** 没有下载地址、只能重新安装版本才能生成的依赖库（例如 Forge 安装时生成的文件） */
  unfixable: string[]
}

export function countMissing(missing: MissingFiles): number {
  return (missing.jar ? 1 : 0) + (missing.assetIndex ? 1 : 0) + missing.libraries.length + missing.assets.length
}

/**
 * 快速检查版本需要的文件：依赖库和资源文件只比较大小（大小不对时才计算哈希），
 * 游戏本体与资源索引校验哈希。几千个资源文件通常一秒内就能检查完。
 */
export async function findMissingFiles(version: ResolvedVersion): Promise<MissingFiles> {
  const folder = MinecraftFolder.from(version.minecraftDirectory)
  const [jarIssue, indexIssue, libraryIssues] = await Promise.all([
    diagnoseJar(version, folder),
    diagnoseAssetIndex(version, folder),
    // xmcl 的 strict 模式对依赖库只比较大小
    diagnoseLibraries(version, folder, { strict: true })
  ])
  let assets: MissingFiles['assets'] = []
  if (!indexIssue) {
    const index = JSON.parse(await readFile(folder.getAssetsIndex(version.assets), 'utf-8')) as {
      objects?: Record<string, { hash: string; size: number }>
    }
    // 非 strict 模式对资源文件只比较大小
    const issues = await diagnoseAssets(index.objects ?? {}, folder)
    assets = issues.map((issue) => issue.asset)
  }
  const fixable = libraryIssues.filter((issue) => issue.library.download.url)
  return {
    // 没有下载信息的本体（例如部分旧的自定义版本）无法补全，交给启动时的检查处理
    jar: !!jarIssue && !!version.downloads.client,
    assetIndex: !!indexIssue && !!version.assetIndex,
    libraries: fixable.map((issue) => issue.library),
    assets,
    unfixable: libraryIssues.filter((issue) => !issue.library.download.url).map((issue) => issue.library.name)
  }
}
