/**
 * Global / local facial motion from landmarks (thesis §3.1.2).
 * Scale-normalized displacement; rigid vs residual local motion.
 */

import { mean } from './dsp'
import type { FrameLandmarks, Landmark, RoiId } from './types'
import { ROI_IDS } from './types'

/** Approximate MediaPipe Face Mesh indices for interpretable ROIs. */
export const ROI_LANDMARK_INDICES: Record<RoiId, number[]> = {
  forehead: [10, 67, 69, 104, 108, 151, 337, 299, 333, 298],
  leftCheek: [50, 101, 118, 205, 36, 137, 123, 147],
  rightCheek: [280, 330, 347, 425, 266, 366, 352, 376],
  lowerFace: [152, 176, 148, 152, 377, 400, 378, 17, 18, 200],
}

/** Inter-ocular distance as face scale (MediaPipe: left/right eye outer). */
export function faceScale(landmarks: FrameLandmarks): number {
  const left = landmarks[33]
  const right = landmarks[263]
  if (left && right) {
    const d = Math.hypot(left.x - right.x, left.y - right.y)
    if (d > 1e-6) return d
  }
  // Fallback: bounding-box diagonal for sparse sets.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of landmarks) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const dx = maxX - minX
  const dy = maxY - minY
  return Math.max(1e-6, Math.hypot(dx, dy))
}

function landmarkDelta(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Signed scale-normalized centroid translation (mean Δx + mean Δy) / scale.
 * Preserves oscillation frequency — used for conflict overlays vs candidate rPPG.
 * Returns length T−1 (first frame has no delta).
 */
export function globalMotionSeries(frames: FrameLandmarks[]): number[] {
  if (frames.length < 2) return []
  const out: number[] = []
  for (let t = 1; t < frames.length; t++) {
    const prev = frames[t - 1]!
    const cur = frames[t]!
    const scale = 0.5 * (faceScale(prev) + faceScale(cur))
    const n = Math.min(prev.length, cur.length)
    let dx = 0
    let dy = 0
    for (let i = 0; i < n; i++) {
      dx += cur[i]!.x - prev[i]!.x
      dy += cur[i]!.y - prev[i]!.y
    }
    out.push(n === 0 ? 0 : (dx + dy) / (n * scale))
  }
  return out
}

/**
 * Unsigned scale-normalized mean landmark speed (magnitude). Used for
 * reliability / “how much motion” summaries — not for spectral conflict.
 */
export function globalMotionMagnitudeSeries(frames: FrameLandmarks[]): number[] {
  if (frames.length < 2) return []
  const out: number[] = []
  for (let t = 1; t < frames.length; t++) {
    const prev = frames[t - 1]!
    const cur = frames[t]!
    const scale = 0.5 * (faceScale(prev) + faceScale(cur))
    const n = Math.min(prev.length, cur.length)
    let sum = 0
    for (let i = 0; i < n; i++) {
      sum += landmarkDelta(prev[i]!, cur[i]!)
    }
    out.push(n === 0 ? 0 : sum / (n * scale))
  }
  return out
}

/**
 * Local ROI motion magnitude: mean scale-normalized displacement of ROI landmarks.
 */
export function localMotionSeries(
  frames: FrameLandmarks[],
  roi: RoiId,
  indices?: number[],
): number[] {
  if (frames.length < 2) return []
  const idx = indices ?? ROI_LANDMARK_INDICES[roi]
  const out: number[] = []
  for (let t = 1; t < frames.length; t++) {
    const prev = frames[t - 1]!
    const cur = frames[t]!
    const scale = 0.5 * (faceScale(prev) + faceScale(cur))
    let sum = 0
    let count = 0
    for (const i of idx) {
      if (i >= prev.length || i >= cur.length) continue
      sum += landmarkDelta(prev[i]!, cur[i]!)
      count++
    }
    out.push(count === 0 ? 0 : sum / (count * scale))
  }
  return out
}

/**
 * Residual local motion ≈ local − global (non-rigid / expression component).
 * Clamped at 0 so residual is non-negative magnitude excess.
 */
export function residualLocalMotion(
  local: number[],
  global: number[],
): number[] {
  const n = Math.min(local.length, global.length)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    out[i] = Math.max(0, local[i]! - global[i]!)
  }
  return out
}

export type MotionBundle = {
  /** Signed centroid translation — conflict / overlay. */
  global: number[]
  /** Unsigned speed — reliability magnitude summaries. */
  globalMagnitude: number[]
  local: Record<RoiId, number[]>
  residual: Record<RoiId, number[]>
  /** Scalar summaries over the window (mean |signed| / magnitude). */
  globalMean: number
  localMean: Record<RoiId, number>
  residualMean: Record<RoiId, number>
}

export function computeMotionBundle(frames: FrameLandmarks[]): MotionBundle {
  const global = globalMotionSeries(frames)
  const globalMagnitude = globalMotionMagnitudeSeries(frames)
  const local = {} as Record<RoiId, number[]>
  const residual = {} as Record<RoiId, number[]>
  const localMean = {} as Record<RoiId, number>
  const residualMean = {} as Record<RoiId, number>

  for (const roi of ROI_IDS) {
    const loc = localMotionSeries(frames, roi)
    const res = residualLocalMotion(loc, globalMagnitude)
    local[roi] = loc
    residual[roi] = res
    localMean[roi] = mean(loc)
    residualMean[roi] = mean(res)
  }

  return {
    global,
    globalMagnitude,
    local,
    residual,
    globalMean: mean(globalMagnitude),
    localMean,
    residualMean,
  }
}
