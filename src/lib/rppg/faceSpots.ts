/**
 * Four measured face spots: forehead, cheeks, lower face.
 * Heat is how much pulse quality beats motion at that spot.
 */

import type { FrameLandmarks, RoiId } from './types'
import { ROI_IDS } from './types'

export type SpotGlow = {
  quality: number
  motion: number
  weight: number
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Mean of the landmark indices that define one measured face area. */
export function landmarkCentroid(
  landmarks: FrameLandmarks,
  indices: number[],
): { x: number; y: number } | null {
  let x = 0
  let y = 0
  let n = 0
  const seen = new Set<number>()
  for (const index of indices) {
    if (seen.has(index)) continue
    seen.add(index)
    const point = landmarks[index]
    if (!point) continue
    x += point.x
    y += point.y
    n += 1
  }
  if (n === 0) return null
  return { x: x / n, y: y / n }
}

/**
 * 0 = face found, no pulse yet (draw white).
 * 1 = this spot's pulse quality clearly beats its motion (draw red).
 */
export function spotHeat(spot: SpotGlow): number {
  return clamp01(spot.quality - spot.motion)
}

/** The measured area the pipeline trusts most. */
export function strongestSpot(
  spots: Record<RoiId, SpotGlow>,
): RoiId | null {
  let best: RoiId | null = null
  let weight = -1
  for (const id of ROI_IDS) {
    const w = spots[id]?.weight ?? 0
    if (w > weight) {
      weight = w
      best = id
    }
  }
  return best
}
