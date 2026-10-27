import { describe, expect, it } from 'vitest'
import { landmarkCentroid, spotHeat, strongestSpot } from './faceSpots'
import type { RoiId } from './types'

describe('face spots', () => {
  it('averages the landmarks of one face area', () => {
    const landmarks = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.5 },
      { x: 0.75, y: 1 },
    ]
    expect(landmarkCentroid(landmarks, [1, 2, 1])).toEqual({ x: 0.5, y: 0.75 })
  })

  it('stays dark when motion outweighs pulse quality', () => {
    expect(spotHeat({ quality: 0.2, motion: 0.9, weight: 0.5 })).toBe(0)
  })

  it('heats up when the spot catches a pulse', () => {
    expect(spotHeat({ quality: 0.8, motion: 0.1, weight: 0.4 })).toBeCloseTo(0.7)
  })

  it('picks the area with the highest trust weight', () => {
    const spots = {
      forehead: { quality: 0.2, motion: 0, weight: 0.1 },
      leftCheek: { quality: 0.9, motion: 0, weight: 0.5 },
      rightCheek: { quality: 0.4, motion: 0, weight: 0.2 },
      lowerFace: { quality: 0.3, motion: 0, weight: 0.2 },
    } satisfies Record<RoiId, { quality: number; motion: number; weight: number }>
    expect(strongestSpot(spots)).toBe('leftCheek')
  })
})
