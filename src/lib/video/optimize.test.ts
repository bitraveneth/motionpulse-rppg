import { describe, expect, it } from 'vitest'
import { computeClipDuration, computeFitSize } from './optimize'

describe('computeFitSize', () => {
  it('keeps small frames unchanged', () => {
    expect(computeFitSize(640, 480)).toEqual({
      width: 640,
      height: 480,
      downscaled: false,
    })
  })

  it('caps 1080p to ~720p while preserving aspect', () => {
    const r = computeFitSize(1920, 1080)
    expect(r.downscaled).toBe(true)
    expect(r.height).toBeLessThanOrEqual(720)
    expect(r.width).toBeLessThanOrEqual(1280)
    expect(r.width % 2).toBe(0)
    expect(r.height % 2).toBe(0)
  })
})

describe('computeClipDuration', () => {
  it('truncates long clips to 15s', () => {
    expect(computeClipDuration(42)).toEqual({
      durationSec: 15,
      truncated: true,
    })
  })

  it('leaves short clips alone', () => {
    expect(computeClipDuration(8)).toEqual({
      durationSec: 8,
      truncated: false,
    })
  })
})
