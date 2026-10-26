import { describe, expect, it } from 'vitest'
import { videoByteResponse } from './videoRange'

const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

describe('videoByteResponse', () => {
  it('returns the whole file when the phone does not ask for a range', () => {
    const res = videoByteResponse(bytes, 'video/mp4', null)
    expect(res.status).toBe(200)
    expect(res.body).toEqual(bytes)
    expect(res.headers['Accept-Ranges']).toBe('bytes')
    expect(res.headers['Content-Length']).toBe('10')
    expect(res.headers['Content-Type']).toBe('video/mp4')
  })

  it('answers the first two bytes the way iPhone Safari probes a video', () => {
    const res = videoByteResponse(bytes, 'video/mp4', 'bytes=0-1')
    expect(res.status).toBe(206)
    expect(Array.from(res.body)).toEqual([0, 1])
    expect(res.headers['Content-Range']).toBe('bytes 0-1/10')
    expect(res.headers['Content-Length']).toBe('2')
  })

  it('serves an open-ended range and a suffix range', () => {
    const open = videoByteResponse(bytes, 'video/mp4', 'bytes=8-')
    expect(open.status).toBe(206)
    expect(Array.from(open.body)).toEqual([8, 9])
    const suffix = videoByteResponse(bytes, 'video/mp4', 'bytes=-3')
    expect(Array.from(suffix.body)).toEqual([7, 8, 9])
    expect(suffix.headers['Content-Range']).toBe('bytes 7-9/10')
  })

  it('rejects a range that starts past the end', () => {
    const res = videoByteResponse(bytes, 'video/mp4', 'bytes=40-50')
    expect(res.status).toBe(416)
    expect(res.headers['Content-Range']).toBe('bytes */10')
    expect(res.body.byteLength).toBe(0)
  })
})
