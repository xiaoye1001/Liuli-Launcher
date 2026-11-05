import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  FlyingAnimation,
  IdleAnimation,
  RunningAnimation,
  SkinViewer,
  WalkingAnimation,
  WaveAnimation,
  type PlayerAnimation
} from 'skinview3d'
import { createDefaultSkin } from '../utils/defaultSkin'
import { useTheme } from '../context/ThemeContext'
import type { SkinModel } from '../../../shared/types'

export type SkinAnimation = 'idle' | 'walk' | 'run' | 'wave' | 'fly'

function createAnimation(type: SkinAnimation): PlayerAnimation {
  switch (type) {
    case 'walk':
      return new WalkingAnimation()
    case 'run':
      return new RunningAnimation()
    case 'wave':
      return new WaveAnimation()
    case 'fly':
      return new FlyingAnimation()
    default:
      return new IdleAnimation()
  }
}

interface SkinViewer3DProps {
  /** 皮肤 data URL，空字符串使用默认皮肤 */
  skin: string
  model: SkinModel
  animation: SkinAnimation
  autoRotate: boolean
  nameTag: string
  /** 披风 data URL，空字符串不显示 */
  cape?: string
  /** WebGL 不可用时显示的内容（默认显示一行说明） */
  fallback?: ReactNode
  /** 镜头远近，默认 0.7 */
  zoom?: number
  /** 角色转过的角度（弧度），默认正对镜头 */
  angle?: number
}

/** 基于 skinview3d 的 3D 皮肤预览，支持鼠标拖动旋转、滚轮缩放 */
function SkinViewer3D({
  skin,
  model,
  animation,
  autoRotate,
  nameTag,
  cape = '',
  fallback,
  zoom = 0.7,
  angle = 0
}: SkinViewer3DProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const [failed, setFailed] = useState(false)
  // 游戏运行中、窗口隐藏或关闭了动画时暂停 3D 渲染（和动态背景一样），不占用显卡
  const { paused } = useTheme()

  // 创建与销毁查看器，并跟随容器大小自适应
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let viewer: SkinViewer
    try {
      viewer = new SkinViewer({
        canvas,
        width: container.clientWidth,
        height: container.clientHeight,
        pixelRatio: 'match-device',
        fov: 40,
        zoom
      })
    } catch (e) {
      // 显卡驱动不支持或禁用了 WebGL（例如远程桌面、虚拟机）：不显示 3D 预览，页面其他功能照常使用
      console.error('无法创建 3D 皮肤预览：', e)
      setFailed(true)
      return
    }
    viewer.controls.enablePan = false
    viewer.autoRotateSpeed = 0.8
    viewer.playerWrapper.rotation.y = angle
    viewerRef.current = viewer

    const observer = new ResizeObserver(() => {
      viewer.setSize(container.clientWidth, container.clientHeight)
      // 暂停渲染时也画一帧静止的画面，否则大小变了之后是空白
      if (viewer.renderPaused) viewer.render()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.renderPaused = paused
    // 暂停时（关闭了动画、游戏运行中等）停在当前画面，但至少要画一帧
    if (paused) viewer.render()
  }, [paused])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (skin) {
      viewer
        .loadSkin(skin, { model })
        .then(() => viewer.renderPaused && viewer.render())
        .catch((e: unknown) => console.error('加载皮肤失败：', e))
    } else {
      viewer.loadSkin(createDefaultSkin(), { model })
      if (viewer.renderPaused) viewer.render()
    }
  }, [skin, model])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (cape) {
      viewer.loadCape(cape).catch((e: unknown) => console.error('加载披风失败：', e))
    } else {
      viewer.loadCape(null)
    }
  }, [cape])

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.animation = createAnimation(animation)
  }, [animation])

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.autoRotate = autoRotate
  }, [autoRotate])

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.nameTag = nameTag || null
  }, [nameTag])

  if (failed) {
    if (fallback) return <>{fallback}</>
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/50">
        当前显卡环境不支持 3D 预览（WebGL 不可用），皮肤和披风仍然可以正常更换
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing">
      <canvas ref={canvasRef} />
    </div>
  )
}

export default SkinViewer3D
