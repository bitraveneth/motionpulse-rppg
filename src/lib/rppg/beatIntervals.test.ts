import { describe, expect, it } from 'vitest'
import { heartRateFromPeaks, hrvFromBeats, shownHeartRate } from './beatIntervals'

function pulse(bpm: number, sampleRateHz: number, durationSec: number) {
  const n = Math.round(sampleRateHz * durationSec)
  const hz = bpm / 60
  return Array.from({ length: n }, (_, i) =>
    Math.sin((2 * Math.PI * hz * i) / sampleRateHz),
  )
}

describe('heartRateFromPeaks', () => {
  it('scales 80 beats per minute from the intervals in the window', () => {
    const est = heartRateFromPeaks(pulse(80, 30, 8), 30)
    expect(est).not.toBeNull()
    expect(est!.perMinute).toBeGreaterThan(74)
    expect(est!.perMinute).toBeLessThan(86)
    expect(est!.beats).toBeGreaterThanOrEqual(8)
  })

  it('returns null when the trace is flat', () => {
    expect(heartRateFromPeaks(Array.from({ length: 240 }, () => 0.01), 30)).toBeNull()
  })
})

describe('hrvFromBeats', () => {
  it('reports a short-window RMSSD when the peaks match the spectrum', () => {
    const beats = heartRateFromPeaks(pulse(72, 30, 10), 30)
    expect(beats).not.toBeNull()
    const hrv = hrvFromBeats(beats!, 72)
    expect(hrv).not.toBeNull()
    expect(hrv!.shortWindow).toBe(true)
    expect(hrv!.rmssdMs).toBeGreaterThanOrEqual(0)
    expect(hrv!.rmssdMs).toBeLessThan(80)
    expect(hrv!.beats).toBeGreaterThanOrEqual(8)
  })

  it('hides HRV when the peak rate disagrees with the spectrum', () => {
    const beats = heartRateFromPeaks(pulse(72, 30, 10), 30)
    expect(hrvFromBeats(beats!, 120)).toBeNull()
  })
})

describe('shownHeartRate', () => {
  it('uses the peak scaling when it agrees', () => {
    expect(shownHeartRate(78, {
      perMinute: 80,
      beats: 9,
      seconds: 6,
      intervalsSec: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75],
    })).toBe(80)
  })

  it('keeps the spectrum when the peaks drift', () => {
    expect(shownHeartRate(78, {
      perMinute: 110,
      beats: 9,
      seconds: 6,
      intervalsSec: [],
    })).toBe(78)
  })
})
