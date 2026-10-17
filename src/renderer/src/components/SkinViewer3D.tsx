import { useEffect, useRef } from 'react'
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
}

/** 基于 skinview3d 的 3D 皮肤预览，支持鼠标拖动旋转、滚轮缩放 */
function SkinViewer3D({ skin, model, animation, autoRotate, nameTag, cape = '' }: SkinViewer3DProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  // 创建与销毁查看器，并跟随容器大小自适应
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const viewer = new SkinViewer({
      canvas,
      width: container.clientWidth,
      height: container.clientHeight,
      pixelRatio: 'match-device',
      fov: 40,
      zoom: 0.7
    })
    viewer.controls.enablePan = false
    viewer.autoRotateSpeed = 0.8
    viewerRef.current = viewer

    const observer = new ResizeObserver(() => {
      viewer.setSize(container.clientWidth, container.clientHeight)
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
    if (skin) {
      viewer.loadSkin(skin, { model }).catch((e: unknown) => console.error('加载皮肤失败：', e))
    } else {
      viewer.loadSkin(createDefaultSkin(), { model })
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

  return (
    <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing">
      <canvas ref={canvasRef} />
    </div>
  )
}

export default SkinViewer3D
