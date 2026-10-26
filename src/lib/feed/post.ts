import { normalizeNickname } from './types'

/** Public feed row. Thumb is a tiny image data URL when present — never video. */
export type PublicFeedPost = {
  id: string
  createdAt: string
  nickname: string | null
  settledHeartRate: number
  respiratoryRate: number | null
  signalLabel: string | null
  risk: string | null
  thumb: string | null
}

export type FeedPostCreate = {
  nickname: string | null
  settledHeartRate: number
  respiratoryRate: number | null
  signalLabel: string
  risk: string
  thumb: string | null
}

const RISKS = new Set(['low', 'moderate', 'elevated', 'high'])
const THUMB_MAX_CHARS = 120_000
const THUMB_RE = /^data:image\/(jpeg|jpg|png|webp);base64,/i

export type ParseFeedResult =
  | { ok: true; data: FeedPostCreate }
  | { ok: false; error: string }

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Validate one share. Rejects video payloads and oversized thumbs so Postgres
 * never stores a video file or video bytes.
 */
export function parseFeedPostInput(body: Record<string, unknown>): ParseFeedResult {
  const heart = finite(body.settledHeartRate)
  if (heart === null || heart < 20 || heart > 260) {
    return { ok: false, error: 'Settled heart rate must be between 20 and 260.' }
  }

  let respiratoryRate: number | null = null
  if (body.respiratoryRate !== null && body.respiratoryRate !== undefined) {
    const breath = finite(body.respiratoryRate)
    if (breath === null || breath < 2 || breath > 80) {
      return {
        ok: false,
        error: 'Respiratory rate must be between 2 and 80, or omitted.',
      }
    }
    respiratoryRate = round1(breath)
  }

  if (typeof body.signalLabel !== 'string' || !body.signalLabel.trim()) {
    return { ok: false, error: 'Signal label is required.' }
  }
  const signalLabel = body.signalLabel.trim().slice(0, 80)

  if (typeof body.risk !== 'string' || !RISKS.has(body.risk)) {
    return { ok: false, error: 'Risk must be low, moderate, elevated, or high.' }
  }

  const thumb = parseThumb(body.thumb)
  if (!thumb.ok) return thumb

  return {
    ok: true,
    data: {
      nickname: normalizeNickname(
        typeof body.nickname === 'string' ? body.nickname : null,
      ),
      settledHeartRate: round1(heart),
      respiratoryRate,
      signalLabel,
      risk: body.risk,
      thumb: thumb.thumb,
    },
  }
}

function parseThumb(
  v: unknown,
): { ok: true; thumb: string | null } | { ok: false; error: string } {
  if (v == null || v === '') return { ok: true, thumb: null }
  if (typeof v !== 'string') {
    return { ok: false, error: 'Thumb must be a small image.' }
  }
  const t = v.trim()
  if (!t) return { ok: true, thumb: null }
  const head = t.slice(0, 40).toLowerCase()
  if (head.startsWith('data:video') || head.includes('video/')) {
    return { ok: false, error: 'Video is not stored.' }
  }
  if (!THUMB_RE.test(t)) {
    return { ok: false, error: 'Thumb must be a small JPEG, PNG, or WebP image.' }
  }
  if (t.length > THUMB_MAX_CHARS) {
    return { ok: false, error: 'Thumb is too large.' }
  }
  return { ok: true, thumb: t }
}
