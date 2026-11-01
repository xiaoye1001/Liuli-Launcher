/**
 * 1.20（快照 23w14a）起游戏支持「快速游戏」参数：--quickPlayMultiplayer 直接进入服务器，
 * --quickPlaySingleplayer 直接进入存档。更早的版本进入服务器用 --server / --port，不能直接进入存档
 */
export function supportsQuickPlay(minecraftVersion: string): boolean {
  const release = /^1\.(\d+)/.exec(minecraftVersion)
  if (release) return Number(release[1]) >= 20
  const snapshot = /^(\d{2})w(\d{2})/.exec(minecraftVersion)
  if (snapshot) return Number(snapshot[1]) > 23 || (Number(snapshot[1]) === 23 && Number(snapshot[2]) >= 14)
  // 新的版本号格式（例如 26.1）
  return /^\d{2}\.\d/.test(minecraftVersion)
}
