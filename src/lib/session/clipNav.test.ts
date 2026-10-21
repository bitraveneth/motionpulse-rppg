import { describe, expect, it } from 'vitest'
import { clampClipIndex, nextClipIndex } from './clipNav'

describe('clipNav', () => {
  it('clamps index into range', () => {
    expect(clampClipIndex(-1, 5)).toBe(0)
    expect(clampClipIndex(2, 5)).toBe(2)
    expect(clampClipIndex(99, 5)).toBe(4)
    expect(clampClipIndex(0, 0)).toBe(0)
  })

  it('steps prev/next without wrapping', () => {
    expect(nextClipIndex(0, 5, -1)).toBe(0)
    expect(nextClipIndex(0, 5, 1)).toBe(1)
    expect(nextClipIndex(4, 5, 1)).toBe(4)
    expect(nextClipIndex(3, 5, -1)).toBe(2)
  })
})
