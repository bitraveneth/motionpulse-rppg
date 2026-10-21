import { describe, expect, it } from 'vitest'
import {
  computeMotionBundle,
  faceScale,
  globalMotionSeries,
  residualLocalMotion,
} from './motion'
import type { FrameLandmarks } from './types'

function makeFrames(n: number, shake: number): FrameLandmarks[] {
  const frames: FrameLandmarks[] = []
  for (let t = 0; t < n; t++) {
    const pts = []
    for (let i = 0; i < 270; i++) {
      pts.push({
        x: 0.5 + shake * t + (i % 10) * 0.01,
        y: 0.5 + (i % 7) * 0.01,
      })
    }
    pts[33] = { x: 0.4 + shake * t, y: 0.4 }
    pts[263] = { x: 0.6 + shake * t, y: 0.4 }
    frames.push(pts)
  }
  return frames
}

describe('motion', () => {
  it('faceScale uses inter-ocular distance when available', () => {
    const frames = makeFrames(2, 0)
    expect(faceScale(frames[0]!)).toBeCloseTo(0.2, 5)
  })

  it('global motion rises with larger shake', () => {
    const still = globalMotionSeries(makeFrames(20, 0))
    const moving = globalMotionSeries(makeFrames(20, 0.002))
    const abs = (xs: number[]) => xs.reduce((a, b) => a + Math.abs(b), 0)
    expect(abs(moving)).toBeGreaterThan(abs(still))
  })

  it('residual local is non-negative excess over global', () => {
    const local = [0.1, 0.2, 0.05]
    const global = [0.08, 0.25, 0.05]
    const res = residualLocalMotion(local, global)
    expect(res[0]).toBeCloseTo(0.02, 10)
    expect(res[1]).toBe(0)
    expect(res[2]).toBe(0)
  })

  it('computeMotionBundle returns all ROIs', () => {
    const bundle = computeMotionBundle(makeFrames(30, 0.001))
    expect(bundle.global.length).toBe(29)
    expect(bundle.local.forehead.length).toBe(29)
    expect(bundle.local.lowerFace.length).toBe(29)
    expect(bundle.globalMean).toBeGreaterThan(0)
  })
})
