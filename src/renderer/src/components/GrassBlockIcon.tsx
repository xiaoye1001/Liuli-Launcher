/** 用 SVG 绘制的等距视角草方块图标（原创绘制，不使用游戏贴图） */
function GrassBlockIcon({ className = 'h-12 w-12' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={className} shapeRendering="crispEdges">
      {/* 顶面：草 */}
      <polygon points="16,2 30,9 16,16 2,9" fill="#5fa83a" />
      <polygon points="16,4 26,9 16,14 6,9" fill="#6dbb45" opacity="0.6" />
      <rect x="11" y="7" width="2" height="1" fill="#4e9130" />
      <rect x="18" y="6" width="2" height="1" fill="#4e9130" />
      <rect x="15" y="10" width="2" height="1" fill="#80c95a" />
      <rect x="21" y="9" width="2" height="1" fill="#4e9130" />
      {/* 左侧面：泥土 */}
      <polygon points="2,9 16,16 16,30 2,23" fill="#8a5a36" />
      {/* 右侧面：泥土（更暗） */}
      <polygon points="30,9 16,16 16,30 30,23" fill="#6e4628" />
      {/* 侧面顶部的草边 */}
      <polygon points="2,9 16,16 16,19 2,12" fill="#4f9a2e" />
      <polygon points="30,9 16,16 16,19 30,12" fill="#3f7f24" />
      {/* 泥土上的颗粒 */}
      <rect x="5" y="15" width="2" height="2" fill="#a06d45" />
      <rect x="10" y="20" width="2" height="2" fill="#73492b" />
      <rect x="6" y="20" width="1" height="1" fill="#a06d45" />
      <rect x="12" y="24" width="2" height="1" fill="#a06d45" />
      <rect x="20" y="21" width="2" height="2" fill="#55361f" />
      <rect x="25" y="16" width="2" height="2" fill="#835535" />
      <rect x="23" y="24" width="1" height="2" fill="#55361f" />
    </svg>
  )
}

export default GrassBlockIcon
