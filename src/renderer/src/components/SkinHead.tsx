import { useEffect, useRef } from 'react'
import { createDefaultSkin } from '../utils/defaultSkin'

interface SkinHeadProps {
  /** 皮肤 data URL，为空时使用默认皮肤 */
  skin: string
  /** 显示尺寸（像素） */
  size?: number
}

/** 从皮肤中截取头像（脸 + 帽子层），像素风格放大 */
function SkinHead({ skin, size = 40 }: SkinHeadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const draw = (source: CanvasImageSource): void => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, 8, 8)
      ctx.drawImage(source, 8, 8, 8, 8, 0, 0, 8, 8)
      ctx.drawImage(source, 40, 8, 8, 8, 0, 0, 8, 8)
    }
    if (!skin) {
      draw(createDefaultSkin())
      return
    }
    // 皮肤快速切换时，先开始加载、后加载完的旧图片不能覆盖新头像
    let alive = true
    const img = new Image()
    img.onload = () => alive && draw(img)
    img.onerror = () => alive && draw(createDefaultSkin())
    img.src = skin
    return () => {
      alive = false
    }
  }, [skin])

  return (
    <canvas
      ref={canvasRef}
      width={8}
      height={8}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className="shrink-0 rounded-lg"
    />
  )
}

export default SkinHead
