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
    expect(parsed).toMatchObject({
      bpm: 72.4,
      source: 'webcam',
      video: null,
      detail: null,
    })
  })

  it('keeps motion, spectrum, and trust on a share', () => {
    const detail = {
      motion: { overall: 0.01, forehead: 0.02, cheeks: 0.03, lowerFace: 0.04 },
      spectrum: { timeSync: 0.2, freqOverlap: 0.4, combined: 0.3 },
      trust: { forehead: 0.5, leftCheek: 0.2, rightCheek: 0.2, lowerFace: 0.1 },
    }
    const parsed = parseFeedPost({ ...base, respiratoryRate: 16, detail })
    expect(parsed).toMatchObject({ respiratoryRate: 16, detail })
  })

  it('rejects a share with no heart rate', () => {
    expect(parseFeedPost({ ...base, bpm: 0 })).toEqual({
      error: 'A heart-rate number is required.',
    })
  })
})
