import { describe, expect, it } from 'vitest'
import { faceBoxFromLandmarks } from './faceBox'

describe('faceBoxFromLandmarks', () => {
  it('returns null for empty input', () => {
    expect(faceBoxFromLandmarks(null)).toBeNull()
    expect(faceBoxFromLandmarks([])).toBeNull()
  })

  it('pads a tight landmark cloud', () => {
    const pts = [
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.3 },
      { x: 0.4, y: 0.7 },
      { x: 0.6, y: 0.7 },
      { x: 0.5, y: 0.5 },
      { x: 0.45, y: 0.4 },
      { x: 0.55, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ]
    const box = faceBoxFromLandmarks(pts, 0.05)
    expect(box).not.toBeNull()
    expect(box!.x).toBeCloseTo(0.35, 5)
    expect(box!.y).toBeCloseTo(0.25, 5)
    expect(box!.w).toBeCloseTo(0.3, 5)
    expect(box!.h).toBeCloseTo(0.5, 5)
  })
})
