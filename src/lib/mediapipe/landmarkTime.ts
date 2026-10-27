import type { FrameLandmarks } from '../rppg/types'

/** Keep the biggest face when two people are in frame. */
export function pickLargestFace<T extends { x: number; y: number }>(
  faces: readonly (readonly T[])[] | null | undefined,
): readonly T[] | null {
  let best: readonly T[] | null = null
  let bestArea = 0
  for (const face of faces ?? []) {
    if (!face || face.length < 8) continue
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const point of face) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
    if (area > bestArea) {
      best = face
      bestArea = area
    }
  }
  return best
}

/**
 * Landmark sample for the frame on screen.
 * Returns null when this moment was not measured, so an older face is not
 * left sitting in the middle of a later frame.
 */
export function nearestLandmarkFrame(
  frames: readonly FrameLandmarks[],
  timesMs: readonly number[],
  timeMs: number,
  maxGapMs = 160,
): FrameLandmarks | null {
  const n = Math.min(frames.length, timesMs.length)
  if (n === 0 || !Number.isFinite(timeMs)) return null
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timesMs[mid]! < timeMs) lo = mid + 1
    else hi = mid
  }
  let idx = lo
  if (
    idx > 0 &&
    Math.abs(timesMs[idx - 1]! - timeMs) < Math.abs(timesMs[idx]! - timeMs)
  ) {
    idx -= 1
  }
  if (Math.abs(timesMs[idx]! - timeMs) > maxGapMs) return null
  return frames[idx] ?? null
}
