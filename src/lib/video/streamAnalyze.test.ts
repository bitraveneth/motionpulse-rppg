import { describe, expect, it } from 'vitest'

/** Pure helpers mirrored from streamAnalyze for unit coverage without DOM. */
function estimateFps(timestampsMs: number[], fallback: number): number {
  if (timestampsMs.length < 2) return fallback
  const first = timestampsMs[0]!
  const last = timestampsMs[timestampsMs.length - 1]!
  const spanSec = (last - first) / 1000
  if (spanSec <= 0) return fallback
  const fps = (timestampsMs.length - 1) / spanSec
  return Number.isFinite(fps) && fps > 1 ? fps : fallback
}

describe('estimateFps (stream analyze)', () => {
  it('returns fallback for sparse timestamps', () => {
    expect(estimateFps([], 12)).toBe(12)
    expect(estimateFps([0], 12)).toBe(12)
  })

  it('estimates from evenly spaced samples', () => {
    const stamps = [0, 1000 / 12, 2000 / 12, 3000 / 12].map((t) =>
      Math.round(t),
    )
    expect(estimateFps(stamps, 12)).toBeCloseTo(12, 0)
  })
})
