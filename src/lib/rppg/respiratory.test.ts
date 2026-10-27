import { describe, expect, it } from 'vitest'
import {
  breathScaleNote,
  estimateRespiratoryRate,
  estimateShownBreath,
} from './respiratory'

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

  it('keeps a breath on an 8 second window that lost one sample', () => {
    const sampleRateHz = 12
    const n = Math.round(8 * sampleRateHz) - 1
    const s = Array.from({ length: n }, (_, i) =>
      Math.sin((2 * Math.PI * 0.25 * i) / sampleRateHz),
    )
    const est = estimateRespiratoryRate(s, sampleRateHz)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(13)
    expect(est!.breathsPerMin).toBeLessThan(17)
  })

  it('scales a breath every 4 seconds in a 10 second clip to 15 per minute', () => {
    const s = sineSeries(0.25, 30, 10)
    const est = estimateRespiratoryRate(s, 30)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(13)
    expect(est!.breathsPerMin).toBeLessThan(17)
    expect(est!.breathsInClip).toBeGreaterThan(2)
    expect(est!.breathsInClip).toBeLessThan(3)
    expect(est!.durationSec).toBeCloseTo(10, 5)
  })

  it('recovers a clear ~15 bpm tone on a 12 second clip', () => {
    const s = sineSeries(0.25, 30, 12)
    const est = estimateRespiratoryRate(s, 30, { minSnr: 1.2 })
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(12)
    expect(est!.breathsPerMin).toBeLessThan(18)
    expect(est!.experimental).toBe(true)
  })

  it('does not print the short-clip floor of about 8 per minute', () => {
    const slow = sineSeries(0.13, 30, 10)
    const est = estimateRespiratoryRate(slow, 30)
    if (est) {
      expect(est.breathsPerMin).toBeGreaterThan(11)
      expect(est.breathsPerMin).toBeLessThan(29)
    }
  })

  it('returns null for flat / near-zero signal', () => {
    const s = Array.from({ length: 360 }, () => 0.001)
    expect(estimateRespiratoryRate(s, 30, { minSnr: 2 })).toBeNull()
  })
})

describe('breathScaleNote', () => {
  it('shows the 10 second count times 6', () => {
    expect(
      breathScaleNote({
        breathsPerMin: 15,
        breathsInClip: 2.5,
        durationSec: 10,
        snr: 0.9,
        experimental: true,
      }),
    ).toBe('2.5 breaths in 10s, × 6')
  })
})

describe('estimateShownBreath', () => {
  it('reads the breath from pulse strength instead of counting heartbeats', () => {
    const n = 300
    const sampleRateHz = 30
    const pulse = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const t = i / sampleRateHz
      const breath = 1 + 0.45 * Math.sin(2 * Math.PI * 0.25 * t)
      pulse[i] = breath * Math.sin(2 * Math.PI * 1.2 * t)
    }
    const est = estimateShownBreath(pulse, sampleRateHz)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(13)
    expect(est!.breathsPerMin).toBeLessThan(17)
  })

  it('uses head motion when that spacing is the clear one', () => {
    const pulse = sineSeries(1.2, 30, 10)
    const motion = sineSeries(0.3, 30, 10)
    const est = estimateShownBreath(pulse, 30, motion)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(16)
    expect(est!.breathsPerMin).toBeLessThan(20)
  })

  it('prefers a breath in the face color over a plain heartbeat', () => {
    const pulse = sineSeries(1.2, 30, 10)
    const color = sineSeries(0.22, 30, 10)
    const est = estimateShownBreath(pulse, 30, null, color)
    expect(est).not.toBeNull()
    expect(est!.breathsPerMin).toBeGreaterThan(11.5)
    expect(est!.breathsPerMin).toBeLessThan(15)
  })
})
