import { describe, expect, it } from 'vitest'
import {
  combinedConflict,
  computeConflict,
  softSuppress,
  spectralConflict,
  temporalConflict,
} from './conflict'

function sine(n: number, hz: number, sr = 30, phase = 0): number[] {
  const out: number[] = []
  for (let t = 0; t < n; t++) {
    out.push(Math.sin((2 * Math.PI * hz * t) / sr + phase))
  }
  return out
}

describe('conflict scores', () => {
  it('identical signals → high temporal conflict', () => {
    const x = sine(180, 1.2)
    expect(temporalConflict(x, x, 30)).toBeGreaterThan(0.9)
  })

  it('orthogonal frequencies → lower spectral conflict than matched', () => {
    const pulse = sine(240, 1.2)
    const matched = sine(240, 1.2, 30, 0.3)
    const other = sine(240, 0.3)
    const cMatch = spectralConflict(matched, pulse, 30, [0.7, 4])
    const cOther = spectralConflict(other, pulse, 30, [0.7, 4])
    expect(cMatch).toBeGreaterThan(cOther)
  })

  it('combined respects alpha/beta mix', () => {
    const s = combinedConflict(1, 0, 1, 0)
    expect(s.combined).toBeCloseTo(1, 5)
    const s2 = combinedConflict(1, 0, 0, 1)
    expect(s2.combined).toBeCloseTo(0, 5)
  })

  it('softSuppress never drops below residual floor', () => {
    const cand = [1, -1, 0.5]
    const r = softSuppress(cand, 1, 0.2)
    expect(r.gain).toBeCloseTo(0.2, 5)
    expect(r.gated[0]).toBeCloseTo(0.2, 5)
  })

  it('computeConflict returns graded scores in [0,1]', () => {
    const m = sine(200, 1.2)
    const c = sine(200, 1.2, 30, 0.1)
    const scores = computeConflict(m, c, {
      sampleRateHz: 30,
      physBandHz: [0.7, 4],
      alpha: 0.5,
      beta: 0.5,
    })
    expect(scores.cTemp).toBeGreaterThanOrEqual(0)
    expect(scores.cTemp).toBeLessThanOrEqual(1)
    expect(scores.combined).toBeGreaterThan(0.5)
  })
})
