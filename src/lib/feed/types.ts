import type { RoiId } from '../rppg/types'

/** Metric-only public run — never includes video blobs. */
export type RunSource = 'upload' | 'webcam' | 'sample' | 'batch'

export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high'

export type RoiWeightsSummary = Partial<Record<RoiId, number>>

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
}

export type NewRunInput = {
  nickname?: string | null
  bpm: number
  conflict_score: number
  risk_level: RiskLevel
  roi_weights: RoiWeightsSummary
  source: RunSource
  client_id?: string | null
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
