import { useEffect, useRef, useState } from 'react'
import { faceBoxFromLandmarks } from '../lib/rppg/faceBox'
import {
  firstClearFaceFrameIndex,
  paintSyntheticPreview,
} from '../lib/rppg/syntheticPreview'
import { BUNDLED_SAMPLE } from '../lib/rppg/synthetic'
import type { NormBox } from '../lib/rppg/faceBox'

const W = 480
const H = 600

/** Hero still from the bundled sample (ROI preview, true 4:5 aspect). */
export function HomeHeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState<NormBox | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = W
    canvas.height = H

    const { frames, roiRgb } = BUNDLED_SAMPLE
    if (!frames.length) {
      setBox(null)
      ctx.fillStyle = '#e8f0f2'
      ctx.fillRect(0, 0, W, H)
      return
    }

    const frameIdx = firstClearFaceFrameIndex(frames)
    const lm = frames[frameIdx] ?? null
    const faceBox = lm ? faceBoxFromLandmarks(lm) : null

    if (!lm || !faceBox) {
      setBox(null)
      ctx.fillStyle = '#e8f0f2'
      ctx.fillRect(0, 0, W, H)
      return
    }

    setBox(faceBox)
    paintSyntheticPreview(ctx, W, H, lm, frameIdx, roiRgb)
  }, [])

  return (
    <div className="home-hero-visual">
      <div className="home-hero-frame">
        <canvas ref={canvasRef} className="home-hero-canvas" />
        {box ? (
          <div
            className="home-hero-roi"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            <span className="home-hero-corner home-hero-corner-tl" aria-hidden />
            <span className="home-hero-corner home-hero-corner-tr" aria-hidden />
            <span className="home-hero-corner home-hero-corner-bl" aria-hidden />
            <span className="home-hero-corner home-hero-corner-br" aria-hidden />
          </div>
        ) : null}
      </div>
    </div>
  )
}
