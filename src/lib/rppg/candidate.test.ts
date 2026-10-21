import { describe, expect, it } from 'vitest'
import { chromSignal, extractCandidate, posSignal } from './candidate'
import type { RgbSample } from './types'

function synthRgb(n: number, bpm: number, sr = 30): RgbSample[] {
  const hz = bpm / 60
  const out: RgbSample[] = []
  for (let t = 0; t < n; t++) {
    const pulse = Math.sin((2 * Math.PI * hz * t) / sr)
    out.push({
      r: 0.7 + 0.004 * pulse,
      g: 0.5 + 0.012 * pulse,
      b: 0.4 + 0.003 * pulse,
    })
  }
  return out
}

describe('candidate CHROM/POS', () => {
  it('CHROM produces finite non-zero series on pulsed RGB', () => {
    const rgb = synthRgb(180, 72)
    const s = chromSignal(rgb)
    expect(s.length).toBe(180)
    expect(s.every((x) => Number.isFinite(x))).toBe(true)
    const energy = s.reduce((a, b) => a + b * b, 0)
    expect(energy).toBeGreaterThan(0)
  })

  it('POS produces finite series', () => {
    const s = posSignal(synthRgb(120, 80))
    expect(s.length).toBe(120)
    expect(s.every((x) => Number.isFinite(x))).toBe(true)
  })

  it('extractCandidate bandpass keeps length', () => {
    const c = extractCandidate(synthRgb(150, 72), {
      sampleRateHz: 30,
      physBandHz: [0.7, 4],
      method: 'CHROM',
    })
    expect(c.length).toBe(150)
  })
})
