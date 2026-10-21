import { describe, expect, it } from 'vitest'
import { buildSparklinePath, resolveThumbnail } from './cardMedia'
import {
  clampThumbnailData,
  normalizeSparkline,
} from './types'
import {
  reliabilityFromConflict,
  reliabilityFromRisk,
} from './reliability'

describe('buildSparklinePath', () => {
  it('returns empty for empty series', () => {
    expect(buildSparklinePath([])).toBe('')
  })

  it('starts with M and contains L for multi-point series', () => {
    const d = buildSparklinePath([0, 1, 0.5, 1.2, 0.2], 40, 20, 5)
    expect(d.startsWith('M')).toBe(true)
    expect(d.includes('L')).toBe(true)
  })

  it('downsamples long series', () => {
    const long = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10))
    const d = buildSparklinePath(long, 96, 28, 48)
    const points = d.split(/[ML]/).filter(Boolean)
    expect(points.length).toBeLessThanOrEqual(48)
  })
})

describe('thumbnail / sparkline helpers', () => {
  it('rejects non-image data', () => {
    expect(clampThumbnailData('hello')).toBeNull()
    expect(clampThumbnailData('data:image/jpeg;base64,abc')).toMatch(
      /^data:image/,
    )
  })

  it('normalizes SVG paths', () => {
    expect(normalizeSparkline('M0,1L2,3')).toBe('M0,1L2,3')
    expect(normalizeSparkline('  ')).toBeNull()
    expect(normalizeSparkline('not-a-path')).toBeNull()
  })

  it('prefers thumbnail_url over data', () => {
    expect(
      resolveThumbnail({
        thumbnail_url: 'https://example.com/t.webp',
        thumbnail_data: 'data:image/jpeg;base64,xx',
      }),
    ).toBe('https://example.com/t.webp')
  })
})

describe('reliability remarks', () => {
  it('maps risk levels to Stable / Mixed / Unreliable', () => {
    expect(reliabilityFromRisk('low').badge).toBe('Stable')
    expect(reliabilityFromRisk('moderate').badge).toBe('Mixed')
    expect(reliabilityFromRisk('elevated').badge).toBe('Unreliable')
    expect(reliabilityFromRisk('high').badge).toBe('Unreliable')
  })

  it('uses signal-quality copy, not health grades', () => {
    const u = reliabilityFromConflict(0.9)
    expect(u.headline.toLowerCase()).toContain('motion')
    expect(u.detail.toLowerCase()).not.toMatch(/good heart|bad heart|healthy/)
  })
})
