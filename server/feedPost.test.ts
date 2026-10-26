import { describe, expect, it } from 'vitest'
import { MAX_FEED_VIDEO_BYTES, parseFeedPost, parseFeedVideo } from './feedPost'

const base = {
  bpm: 72.4,
  conflictScore: 0.2,
  riskLevel: 'low',
  durationSec: 10,
  source: 'webcam',
}

describe('parseFeedVideo', () => {
  it('accepts a short webm data URL', () => {
    const parsed = parseFeedVideo('data:video/webm;codecs=vp8;base64,aGVsbG8=')
    expect(parsed).toMatchObject({ mime: 'video/webm' })
    if (parsed && !('error' in parsed)) {
      expect(Buffer.from(parsed.bytes).toString()).toBe('hello')
    }
  })

  it('rejects images and oversized clips', () => {
    expect(parseFeedVideo('data:image/jpeg;base64,aGVsbG8=')).toEqual({
      error: 'Video must be a webm or mp4 data URL.',
    })
    const huge = Buffer.alloc(MAX_FEED_VIDEO_BYTES + 1, 1).toString('base64')
    expect(parseFeedVideo(`data:video/webm;base64,${huge}`)).toEqual({
      error: 'video_too_large',
    })
  })
})

describe('parseFeedPost', () => {
  it('keeps a webcam share with no video', () => {
    const parsed = parseFeedPost(base)
    expect(parsed).toMatchObject({ bpm: 72.4, source: 'webcam', video: null })
  })

  it('rejects a share with no heart rate', () => {
    expect(parseFeedPost({ ...base, bpm: 0 })).toEqual({
      error: 'A heart-rate number is required.',
    })
  })
})
