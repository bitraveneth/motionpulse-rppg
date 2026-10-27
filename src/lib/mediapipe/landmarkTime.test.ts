import { describe, expect, it } from 'vitest'
import { nearestLandmarkFrame, pickLargestFace } from './landmarkTime'

const faceAt = (x: number): { x: number; y: number }[] =>
  Array.from({ length: 8 }, (_, i) => ({ x: x + i * 0.01, y: 0.2 + i * 0.02 }))

describe('pickLargestFace', () => {
  it('keeps the wider face when two people are in frame', () => {
    const small = faceAt(0.1)
    const large = [
      { x: 0.4, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.4, y: 0.7 },
      { x: 0.8, y: 0.7 },
      { x: 0.5, y: 0.3 },
      { x: 0.6, y: 0.4 },
      { x: 0.7, y: 0.5 },
      { x: 0.55, y: 0.6 },
    ]
    expect(pickLargestFace([small, large])).toBe(large)
  })
})

describe('nearestLandmarkFrame', () => {
  const frames = [
    [{ x: 0.2, y: 0.2 }],
    [{ x: 0.5, y: 0.5 }],
    [{ x: 0.8, y: 0.8 }],
  ]

  it('uses the sample at the video time, not a later face', () => {
    const times = [0, 1000, 2000]
    expect(nearestLandmarkFrame(frames, times, 1000)?.[0]?.x).toBe(0.5)
    expect(nearestLandmarkFrame(frames, times, 40)?.[0]?.x).toBe(0.2)
  })

  it('hides the mesh when this moment has no face sample', () => {
    const times = [0, 2000]
    expect(nearestLandmarkFrame([frames[0]!, frames[2]!], times, 1000)).toBeNull()
  })
})
