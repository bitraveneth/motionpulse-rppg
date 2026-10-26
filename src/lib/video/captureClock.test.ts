import { describe, expect, it } from 'vitest'
import {
  WEBCAM_CAPTURE_MS,
  captureRemainingMs,
  captureShouldStop,
  preferredRecorderMime,
  secondsLeft,
} from './captureClock'

describe('webcam capture clock', () => {
  const start = 1_000

  it('keeps recording until 10 seconds have passed', () => {
    expect(captureShouldStop(start, start + 9_999)).toBe(false)
    expect(captureRemainingMs(start, start + 9_999)).toBe(1)
    expect(secondsLeft(1)).toBe(1)
  })

  it('stops at 10 seconds', () => {
    expect(captureShouldStop(start, start + WEBCAM_CAPTURE_MS)).toBe(true)
    expect(captureRemainingMs(start, start + 12_000)).toBe(0)
    expect(secondsLeft(0)).toBe(0)
  })

  it('picks the first supported recorder mime', () => {
    expect(
      preferredRecorderMime((mime) => mime === 'video/mp4'),
    ).toBe('video/mp4')
    expect(preferredRecorderMime(() => false)).toBeNull()
  })

  it('prefers mp4 when the browser can record both', () => {
    expect(preferredRecorderMime(() => true)).toBe(
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    )
    expect(preferredRecorderMime((mime) => mime.startsWith('video/webm'))).toBe(
      'video/webm;codecs=vp8',
    )
  })
})
