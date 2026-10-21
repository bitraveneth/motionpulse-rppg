/**
 * Parse / validate out/batch-results.json for the Local lab UI.
 * Metrics only — never expects video payloads.
 */

import type { RiskLevel, RoiWeightsSummary, RunSource } from '../feed/types'

export type BatchResultRow = {
  id: string
  path: string
  subject?: string
  source?: RunSource | string
  analysis?: string
  bpm: number
  conflict_score: number
  risk_level: RiskLevel | string
  roi_weights: RoiWeightsSummary
  sample_rate_hz?: number
  frames?: number
  sparkline?: string | null
  thumbnail_data?: string | null
  thumbnail_url?: string | null
}

export type BatchResultsFile = {
  generated_at?: string
  root?: string
  count?: number
  companion_json?: number
  synthetic_proxy?: number
  note?: string
  privacy?: string
  results: BatchResultRow[]
}

export function parseBatchResultsJson(raw: unknown): BatchResultsFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid batch file: expected a JSON object')
  }
  const obj = raw as Record<string, unknown>
  const results = obj.results
  if (!Array.isArray(results)) {
    throw new Error('Invalid batch file: missing results array')
  }

  const rows: BatchResultRow[] = results.map((r, i) => {
    if (!r || typeof r !== 'object') {
      throw new Error(`Invalid row at index ${i}`)
    }
    const row = r as Record<string, unknown>
    const bpm = Number(row.bpm)
    const conflict_score = Number(row.conflict_score)
    if (!Number.isFinite(bpm) || !Number.isFinite(conflict_score)) {
      throw new Error(`Row ${i}: bpm / conflict_score required`)
    }
    return {
      id: String(row.id ?? `row_${i}`),
      path: String(row.path ?? ''),
      subject: row.subject != null ? String(row.subject) : undefined,
      source: (row.source as string) ?? 'batch',
      analysis: row.analysis != null ? String(row.analysis) : undefined,
      bpm,
      conflict_score,
      risk_level: String(row.risk_level ?? 'moderate'),
      roi_weights: (row.roi_weights as RoiWeightsSummary) ?? {},
      sample_rate_hz:
        row.sample_rate_hz != null ? Number(row.sample_rate_hz) : undefined,
      frames: row.frames != null ? Number(row.frames) : undefined,
      sparkline: (row.sparkline as string | null) ?? null,
      thumbnail_data: (row.thumbnail_data as string | null) ?? null,
      thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    }
  })

  return {
    generated_at:
      obj.generated_at != null ? String(obj.generated_at) : undefined,
    root: obj.root != null ? String(obj.root) : undefined,
    count: obj.count != null ? Number(obj.count) : rows.length,
    companion_json:
      obj.companion_json != null ? Number(obj.companion_json) : undefined,
    synthetic_proxy:
      obj.synthetic_proxy != null ? Number(obj.synthetic_proxy) : undefined,
    note: obj.note != null ? String(obj.note) : undefined,
    privacy: obj.privacy != null ? String(obj.privacy) : undefined,
    results: rows,
  }
}

/** Build CLI helper lines for a dataset folder path. */
export function batchCliCommands(datasetPath: string): {
  batch: string
  publish: string
  normalized: string
} {
  const trimmed = datasetPath.trim() || './data/UBFC'
  const normalized = trimmed.replace(/\\/g, '/')
  return {
    normalized,
    batch: `npm run batch -- ${quotePath(normalized)}`,
    publish: 'npm run publish-results',
  }
}

function quotePath(p: string): string {
  if (/[\s"'`$]/.test(p)) {
    return `"${p.replace(/"/g, '\\"')}"`
  }
  return p
}

const RISK: RiskLevel[] = ['low', 'moderate', 'elevated', 'high']

export function asRiskLevel(v: string): RiskLevel {
  return RISK.includes(v as RiskLevel) ? (v as RiskLevel) : 'moderate'
}
