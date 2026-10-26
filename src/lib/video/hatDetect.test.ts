import { describe, expect, it } from 'vitest'
import {
  HAT_CLEAR_FRAMES,
  HAT_COVERED_FRAMES,
  HAT_NO_FACE_FRAMES,
  capLineLooksCovered,
  foreheadLooksCovered,
  nextHatGate,
  type HatGateState,
  type Rgb,
} from './hatDetect'

function fill(rgb: Rgb, n: number): Rgb[] {
  return Array.from({ length: n }, () => ({ ...rgb }))
}

const bare = {
  covered: null,
  coveredStreak: 0,
  clearStreak: 0,
  noFaceFrames: 0,
  prompt: false,
  reason: null,
  skip: false,
} satisfies HatGateState

describe('forehead cap check', () => {
  it('leaves a bare forehead alone across skin tones', () => {
    const tones: Rgb[] = [
      { r: 224, g: 172, b: 144 },
      { r: 160, g: 110, b: 80 },
      { r: 92, g: 62, b: 46 },
    ]
    for (const tone of tones) {
      expect(foreheadLooksCovered(fill(tone, 8), fill(tone, 8))).toBe(false)
    }
  })

  it('flags a cap that does not match the cheeks', () => {
    const cheek = { r: 180, g: 130, b: 100 }
    expect(foreheadLooksCovered(fill({ r: 30, g: 70, b: 180 }, 8), fill(cheek, 8))).toBe(true)
    expect(foreheadLooksCovered(fill({ r: 12, g: 12, b: 14 }, 8), fill(cheek, 8))).toBe(true)
    expect(foreheadLooksCovered(fill({ r: 236, g: 236, b: 236 }, 8), fill(cheek, 8))).toBe(true)
  })

  it('flags a brim along the hairline and leaves a skin-colored hairline', () => {
    const cheek = { r: 180, g: 130, b: 100 }
    expect(capLineLooksCovered(fill({ r: 20, g: 20, b: 24 }, 6), fill(cheek, 8))).toBe(true)
    expect(capLineLooksCovered(fill({ r: 24, g: 58, b: 150 }, 6), fill(cheek, 8))).toBe(true)
    expect(capLineLooksCovered(fill(cheek, 6), fill(cheek, 8))).toBe(false)
  })

  it('does not guess when the cheeks are not visible', () => {
    expect(foreheadLooksCovered(fill({ r: 20, g: 20, b: 20 }, 8), fill({ r: 10, g: 10, b: 10 }, 8))).toBeNull()
    expect(foreheadLooksCovered(fill({ r: 180, g: 130, b: 100 }, 2), fill({ r: 180, g: 130, b: 100 }, 8))).toBeNull()
  })
})

describe('hat gate', () => {
  it('asks only after several covered frames', () => {
    let state: HatGateState = bare
    for (let i = 0; i < HAT_COVERED_FRAMES - 1; i++) {
      const next = nextHatGate({ ...state, covered: true })
      expect(next.prompt).toBe(false)
      expect(next.start).toBe(false)
      state = next
    }
    const asked = nextHatGate({ ...state, covered: true })
    expect(asked.prompt).toBe(true)
    expect(asked.start).toBe(false)
  })

  it('starts on its own when the forehead stays clear', () => {
    let state: HatGateState = bare
    for (let i = 0; i < HAT_CLEAR_FRAMES - 1; i++) {
      const next = nextHatGate({ ...state, covered: false })
      expect(next.start).toBe(false)
      state = next
    }
    expect(nextHatGate({ ...state, covered: false }).start).toBe(true)
  })

  it('starts after the cap comes off', () => {
    const asked = nextHatGate({
      ...bare,
      covered: false,
      prompt: true,
      clearStreak: HAT_CLEAR_FRAMES - 1,
    })
    expect(asked.prompt).toBe(false)
    expect(asked.start).toBe(true)
  })

  it('asks to try again when no face appears, and does not start the clock', () => {
    const waiting = nextHatGate({
      ...bare,
      covered: null,
      noFaceFrames: HAT_NO_FACE_FRAMES - 1,
    })
    expect(waiting.start).toBe(false)
    expect(waiting.prompt).toBe(true)
    expect(waiting.reason).toBe('face')
    const asking = nextHatGate({
      ...waiting,
      covered: null,
    })
    expect(asking.start).toBe(false)
    expect(asking.prompt).toBe(true)
  })

  it('starts immediately when the person says there is no hat', () => {
    const next = nextHatGate({ ...bare, covered: true, prompt: true, skip: true })
    expect(next.start).toBe(true)
    expect(next.prompt).toBe(false)
  })
})
