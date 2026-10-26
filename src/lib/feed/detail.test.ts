import { describe, expect, it } from 'vitest'
import { parseFeedDetail } from './detail'

const valid = {
  motion: { overall: 0.0123, forehead: 0.004, cheeks: 0.008, lowerFace: 0.02 },
  spectrum: { timeSync: 0.21, freqOverlap: 0.44, combined: 0.33 },
  trust: { forehead: 0.4, leftCheek: 0.3, rightCheek: 0.2, lowerFace: 0.1 },
}

describe('parseFeedDetail', () => {
  it('keeps motion, spectrum, and trust numbers', () => {
    expect(parseFeedDetail(valid)).toEqual(valid)
  })

  it('drops a partial or empty detail', () => {
    expect(parseFeedDetail(null)).toBeNull()
    expect(parseFeedDetail({ motion: valid.motion })).toBeNull()
    expect(parseFeedDetail({ ...valid, trust: { forehead: 0.2 } })).toBeNull()
  })

  it('clamps trust and spectrum into 0–1', () => {
    const parsed = parseFeedDetail({
      ...valid,
      spectrum: { timeSync: 2, freqOverlap: -1, combined: 0.5 },
      trust: { ...valid.trust, forehead: 4 },
    })
    expect(parsed?.spectrum).toEqual({ timeSync: 1, freqOverlap: 0, combined: 0.5 })
    expect(parsed?.trust.forehead).toBe(1)
  })
})