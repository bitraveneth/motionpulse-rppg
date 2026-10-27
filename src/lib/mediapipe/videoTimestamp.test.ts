import { describe, expect, it } from 'vitest'
import { createVideoTimestampClock } from './videoTimestamp'

describe('video timestamp clock', () => {
  it('keeps the spacing of one clip', () => {
    const clock = createVideoTimestampClock()
    expect([0, 83, 166].map((t) => clock.next(t))).toEqual([0, 83, 166])
  })

  it('continues past the first clip when the next video starts at 0', () => {
    const clock = createVideoTimestampClock()
    clock.next(0)
    clock.next(9917)
    const second = [0, 83, 166].map((t) => clock.next(t))
    expect(second[0]).toBeGreaterThan(9917)
    expect(second[1]! - second[0]!).toBe(83)
    expect(second[2]! - second[1]!).toBe(83)
  })

  it('still moves forward when the same timestamp is sent twice', () => {
    const clock = createVideoTimestampClock()
    const first = clock.next(0)
    const second = clock.next(0)
    expect(second).toBeGreaterThan(first)
  })
})