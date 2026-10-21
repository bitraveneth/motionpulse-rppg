import type { RoiId } from '../rppg/types'

/** Metric-only public run — never includes video blobs. */
export type RunSource = 'upload' | 'webcam' | 'sample' | 'batch'

export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high'

export type RoiWeightsSummary = Partial<Record<RoiId, number>>

/**
 * Public feed row: metrics + optional tiny face thumb + pulse sparkline.
 * Videos / face GIFs are never stored.
 */
export type RunRecord = {
  id: string
  created_at: string
  nickname: string | null
  bpm: number
  conflict_score: number
  risk_level: RiskLevel
  roi_weights: RoiWeightsSummary
  source: RunSource
  client_id?: string | null
  /** Public Storage URL when thumb uploaded to `thumbs` bucket. */
  thumbnail_url?: string | null
  /** Compressed JPEG/WebP data URL (mock / small thumbs). */
  thumbnail_data?: string | null
  /** SVG path `d` for a tiny pulse sparkline (preferred) or image data URL. */
  sparkline?: string | null
}

export type NewRunInput = {
  nickname?: string | null
  bpm: number
  conflict_score: number
  risk_level: RiskLevel
  roi_weights: RoiWeightsSummary
  source: RunSource
  client_id?: string | null
  thumbnail_url?: string | null
  thumbnail_data?: string | null
  sparkline?: string | null
}

export function displayNickname(nickname: string | null | undefined): string {
  const t = (nickname ?? '').trim()
  return t.length > 0 ? t : 'Anonymous'
}

export function normalizeNickname(
  nickname: string | null | undefined,
): string | null {
  const t = (nickname ?? '').trim()
  return t.length > 0 ? t.slice(0, 40) : null
}

/** Cap inline thumb data so mock localStorage / row text stay small. */
export function clampThumbnailData(
  data: string | null | undefined,
  maxChars = 110_000,
): string | null {
  if (!data) return null
  const t = data.trim()
  if (!t.startsWith('data:image')) return null
  return t.length <= maxChars ? t : null
}

export function normalizeSparkline(
  sparkline: string | null | undefined,
): string | null {
  if (!sparkline) return null
  const t = sparkline.trim()
  if (!t) return null
  // SVG path or tiny data URL
  if (t.startsWith('M') || t.startsWith('m') || t.startsWith('data:image')) {
    return t.slice(0, 8_000)
  }
  return null
}
