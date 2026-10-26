import { MAX_FEED_VIDEO_BYTES } from '../src/lib/feed/limits'

/** How many public posts to keep. Older ones are dropped. */
export const MAX_FEED_POSTS = 60

export { MAX_FEED_VIDEO_BYTES }

const SOURCES = new Set(['webcam', 'upload', 'sample'])

export type ParsedFeedVideo = {
  mime: string
  bytes: Uint8Array
}

export type FeedPostInput = {
  nickname: string | null
  bpm: number
  conflictScore: number
  riskLevel: string
  respiratoryRate: number | null
  durationSec: number
  source: string
  thumb: string | null
  video: ParsedFeedVideo | null
}

export function parseFeedVideo(
  dataUrl: unknown,
): ParsedFeedVideo | null | { error: string } {
  if (dataUrl == null || dataUrl === '') return null
  if (typeof dataUrl !== 'string') return { error: 'Video must be a data URL.' }
  const match =
    /^data:(video\/(?:webm|mp4))(?:;[^,]*)?;base64,([a-z0-9+/=\s]+)$/i.exec(
      dataUrl.trim(),
    )
  if (!match) return { error: 'Video must be a webm or mp4 data URL.' }
  const mime = match[1]!.toLowerCase()
  const bytes = new Uint8Array(Buffer.from(match[2]!.replace(/\s/g, ''), 'base64'))
  if (bytes.byteLength === 0) return { error: 'That video is empty.' }
  if (bytes.byteLength > MAX_FEED_VIDEO_BYTES) {
    return { error: 'video_too_large' }
  }
  return { mime, bytes }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Validate a public share. `video_too_large` is returned separately so the caller can retry without the file. */
export function parseFeedPost(
  body: Record<string, unknown>,
): FeedPostInput | { error: string } {
  const bpm = num(body.bpm)
  if (bpm == null || bpm < 1 || bpm > 300) {
    return { error: 'A heart-rate number is required.' }
  }
  const source = str(body.source, 40)
  if (!source || !SOURCES.has(source)) return { error: 'Unknown source.' }
  const riskLevel = str(body.riskLevel, 40)
  if (!riskLevel) return { error: 'A signal label is required.' }
  const durationSec = num(body.durationSec)
  if (durationSec == null || durationSec <= 0 || durationSec > 30) {
    return { error: 'Duration must be between 0 and 30 seconds.' }
  }
  const conflict = num(body.conflictScore)
  const breath = num(body.respiratoryRate)
  const thumb = str(body.thumb, 120_000)
  const video = parseFeedVideo(body.videoData)
  if (video && 'error' in video) return video
  return {
    nickname: str(body.nickname, 40),
    bpm: Math.round(bpm * 10) / 10,
    conflictScore: conflict == null ? 0 : Math.round(conflict * 1000) / 1000,
    riskLevel,
    respiratoryRate: breath == null ? null : Math.round(breath * 10) / 10,
    durationSec: Math.round(durationSec * 10) / 10,
    source,
    thumb: thumb && thumb.startsWith('data:image') ? thumb : null,
    video,
  }
}
