import { describe, expect, it } from 'vitest'
import { estimateRespiratoryRate, estimateShownBreath } from './respiratory'

function sineSeries(hz: number, sampleRateHz: number, durationSec: number) {
  const n = Math.round(sampleRateHz * durationSec)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRateHz)
  }
  return out
}

describe('estimateRespiratoryRate', () => {
  it('returns null for short clips', () => {
    const s = sineSeries(0.25, 30, 3)
    expect(estimateRespiratoryRate(s, 30)).toBeNull()
  })

  it('recovers a clear ~15 bpm (0.25 Hz) tone on a long enough clip', () => {
    const s = sineSeries(0.25, 30, 12)
    const est = estimateRespiratoryRate(s, 30, { minSnr: 1.2 })
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(12)
    expect(est!.breathsPerMin).toBeLessThan(18)
    expect(est!.experimental).toBe(true)
  })

  it('returns null for flat / near-zero signal', () => {
    const s = Array.from({ length: 360 }, () => 0.001)
    expect(estimateRespiratoryRate(s, 30, { minSnr: 2 })).toBeNull()
  })
})

describe('estimateShownBreath', () => {
  it('uses face motion when the pulse series has no breath peak', () => {
    const flat = Array.from({ length: 360 }, () => 0)
    const motion = sineSeries(0.25, 30, 12)
    const est = estimateShownBreath(flat, 30, motion)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(12)
    expect(est!.breathsPerMin).toBeLessThan(18)
  })

  it('keeps the pulse estimate when that series already has a peak', () => {
    const pulse = sineSeries(0.2, 30, 12)
    const motion = sineSeries(0.4, 30, 12)
    const est = estimateShownBreath(pulse, 30, motion)
    expect(est!.breathsPerMin).toBeGreaterThan(8)
    expect(est!.breathsPerMin).toBeLessThan(16)
  })
})
