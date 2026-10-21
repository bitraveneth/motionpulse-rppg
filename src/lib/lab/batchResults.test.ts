import { describe, expect, it } from 'vitest'
import {
  asRiskLevel,
  batchCliCommands,
  parseBatchResultsJson,
} from './batchResults'

describe('parseBatchResultsJson', () => {
  it('parses a minimal batch file', () => {
    const file = parseBatchResultsJson({
      results: [
        {
          id: 'a1',
          path: 's1/clip.mp4',
          bpm: 72,
          conflict_score: 0.2,
          risk_level: 'low',
          roi_weights: { forehead: 0.4 },
        },
      ],
    })
    expect(file.results).toHaveLength(1)
    expect(file.results[0]!.bpm).toBe(72)
  })

  it('rejects missing results', () => {
    expect(() => parseBatchResultsJson({})).toThrow(/results/)
  })
})

describe('batchCliCommands', () => {
  it('quotes paths with spaces', () => {
    const c = batchCliCommands('./data/My Dataset')
    expect(c.batch).toContain('"./data/My Dataset"')
    expect(c.publish).toBe('npm run publish-results')
  })

  it('defaults empty path', () => {
    expect(batchCliCommands('').normalized).toBe('./data/UBFC')
  })
})

describe('asRiskLevel', () => {
  it('falls back to moderate', () => {
    expect(asRiskLevel('nope')).toBe('moderate')
    expect(asRiskLevel('high')).toBe('high')
  })
})
