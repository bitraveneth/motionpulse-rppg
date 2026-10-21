import type { FrameLandmarks } from './types'

export type NormBox = {
  /** Normalized [0,1] relative to frame */
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned face box from MediaPipe-style landmarks, with padding. */
export function faceBoxFromLandmarks(
  landmarks: FrameLandmarks | null | undefined,
  pad = 0.06,
): NormBox | null {
  if (!landmarks || landmarks.length < 8) return null
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (maxX <= minX || maxY <= minY) return null
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const w = Math.min(1 - x, maxX - minX + pad * 2)
  const h = Math.min(1 - y, maxY - minY + pad * 2)
  return { x, y, w, h }
}
