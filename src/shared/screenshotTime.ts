/** 游戏截图的文件名带日期：2025-11-05_20.31.07.png */
const DATED = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})/

/** 拍摄时间：文件名里有日期时按文件名（复制、同步过的截图修改时间会变），否则按修改时间 */
export function screenshotTakenAt(fileName: string, mtimeMs: number): number {
  const m = DATED.exec(fileName)
  if (!m) return mtimeMs
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return Number.isFinite(t) ? t : mtimeMs
}
