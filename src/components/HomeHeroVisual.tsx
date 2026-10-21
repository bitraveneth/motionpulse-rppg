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

/** Marketing hero: still from bundled sample data (landmark + ROI preview, not camera pixels). */
export function HomeHeroVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState<NormBox | null>(null)
  const [usedAbstract, setUsedAbstract] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = W
    canvas.height = H

    const { frames, roiRgb } = BUNDLED_SAMPLE
    if (!frames.length) {
      setUsedAbstract(true)
      setBox(null)
      ctx.fillStyle = '#e8f0f2'
      ctx.fillRect(0, 0, W, H)
      return
    }

    const frameIdx = firstClearFaceFrameIndex(frames)
    const lm = frames[frameIdx] ?? null
    const faceBox = lm ? faceBoxFromLandmarks(lm) : null

    if (!lm || !faceBox) {
      setUsedAbstract(true)
      setBox(null)
      ctx.fillStyle = '#e8f0f2'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = 'rgba(26, 127, 114, 0.08)'
      ctx.fillRect(W * 0.2, H * 0.18, W * 0.6, H * 0.55)
      return
    }

    setUsedAbstract(false)
    setBox(faceBox)
    paintSyntheticPreview(ctx, W, H, lm, frameIdx, roiRgb)
  }, [])

  return (
    <div className="home-hero-visual">
      <div className="home-hero-frame">
        <canvas ref={canvasRef} className="home-hero-canvas" />
        {box && !usedAbstract ? (
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
            <span className="home-hero-roi-label">Face ROI</span>
          </div>
        ) : null}
      </div>
      <p className="home-hero-visual-caption">
        {usedAbstract
          ? 'No face frame in the bundled sample — run a scan for a live preview'
          : 'Still from the bundled sample clip (ROI preview)'}
      </p>
    </div>
  )
}
