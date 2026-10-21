import { describe, expect, it } from 'vitest'
import { displayNickname, normalizeNickname } from './types'

describe('nickname helpers', () => {
  it('maps blank to Anonymous for display', () => {
    expect(displayNickname(null)).toBe('Anonymous')
    expect(displayNickname('')).toBe('Anonymous')
    expect(displayNickname('  ')).toBe('Anonymous')
  })

  it('stores blank as null', () => {
    expect(normalizeNickname('')).toBeNull()
    expect(normalizeNickname('  Mira  ')).toBe('Mira')
  })

  it('caps length', () => {
    const long = 'x'.repeat(80)
    expect(normalizeNickname(long)?.length).toBe(40)
  })
})
