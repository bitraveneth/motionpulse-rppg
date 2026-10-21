import { ROI_LANDMARK_INDICES } from './motion'
import type { FrameLandmarks, RgbSample, RoiId, RoiRgbTrace } from './types'
import { ROI_IDS } from './types'
import { faceBoxFromLandmarks } from './faceBox'

function roiCentroid(
  landmarks: FrameLandmarks,
  roi: RoiId,
): { x: number; y: number } | null {
  const indices = ROI_LANDMARK_INDICES[roi]
  let sx = 0
  let sy = 0
  let n = 0
  for (const idx of indices) {
    const p = landmarks[idx]
    if (!p) continue
    sx += p.x
    sy += p.y
    n++
  }
  if (!n) return null
  return { x: sx / n, y: sy / n }
}

function rgbaCss({ r, g, b }: RgbSample, alpha: number): string {
  const R = Math.round(Math.min(1, Math.max(0, r)) * 255)
  const G = Math.round(Math.min(1, Math.max(0, g)) * 255)
  const B = Math.round(Math.min(1, Math.max(0, b)) * 255)
  return `rgba(${R},${G},${B},${alpha})`
}

/** First frame index with a usable face box (bundled sample has landmarks only, no pixels). */
export function firstClearFaceFrameIndex(frames: FrameLandmarks[]): number {
  for (let i = 0; i < frames.length; i++) {
    if (faceBoxFromLandmarks(frames[i])) return i
  }
  return Math.min(frames.length - 1, Math.floor(frames.length * 0.45))
}

/**
 * Soft ROI-colored preview — same data as the bundled sample clip, not a photo frame.
 */
export function paintSyntheticPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: FrameLandmarks,
  frameIdx: number,
  roiRgb: RoiRgbTrace,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, '#d5e6ef')
  g.addColorStop(1, '#e8f0f2')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  const faceBox = faceBoxFromLandmarks(landmarks)
  if (faceBox) {
    const cx = (faceBox.x + faceBox.w / 2) * width
    const cy = (faceBox.y + faceBox.h / 2) * height
    const rx = (faceBox.w * width) / 2
    const ry = (faceBox.h * height) / 2
    ctx.fillStyle = 'rgba(198, 178, 168, 0.22)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx * 0.95, ry * 0.98, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const roi of ROI_IDS) {
    const c = roiCentroid(landmarks, roi)
    const sample = roiRgb[roi][frameIdx]
    if (!c || !sample) continue
    const px = c.x * width
    const py = c.y * height
    const radius = Math.min(width, height) * (roi === 'forehead' ? 0.14 : 0.11)
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius)
    grad.addColorStop(0, rgbaCss(sample, 0.55))
    grad.addColorStop(0.55, rgbaCss(sample, 0.28))
    grad.addColorStop(1, 'rgba(198, 178, 168, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}
