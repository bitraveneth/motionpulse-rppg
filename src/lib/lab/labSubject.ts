import { parseFeedDetail, type FeedDetail } from '../feed/detail'
import type { CandidateMethod } from '../rppg/types'

const RISKS = new Set(['low', 'moderate', 'elevated', 'high'])

export type LabSubjectInput = {
  subject: string
  bpm: number
  plainBpm: number | null
  weightedBpm: number | null
  cleanedBpm: number | null
  referenceBpm: number | null
  snr: number | null
  durationSec: number
  respiratoryRate: number | null
  breathsInClip: number | null
  risk: 'low' | 'moderate' | 'elevated' | 'high'
  conflict: number
  windows: number
  frames: number
  method: CandidateMethod
  thumb: string | null
  detail: FeedDetail
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optional(value: unknown, lo: number, hi: number): number | null {
  if (value == null) return null
  const n = finite(value)
  if (n == null || n < lo || n > hi) return null
  return n
}

const THUMB_MAX = 120_000

/** A face still, or null. A bad image does not reject the rest of the card. */
export function parseThumb(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const thumb = value.trim()
  if (!thumb.startsWith('data:image/')) return null
  if (thumb.length > THUMB_MAX) return null
  return thumb
}

export function parseMethod(value: unknown): CandidateMethod | null {
  if (value == null || value === '') return 'CHROM'
  if (value === 'CHROM' || value === 'POS') return value
  return null
}

/** Folder name only. A full disk path is not stored. */
export function datasetLabel(path: string): string {
  const parts = path.split(/[/\\]/).filter((part) => part && part !== '.' && part !== '..')
  return (parts.at(-1) || 'Dataset').slice(0, 80)
}

export function parseLabSubject(value: unknown): LabSubjectInput | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 80) : ''
  const bpm = finite(body.bpm)
  const durationSec = finite(body.durationSec)
  const conflict = finite(body.conflict)
  const windows = finite(body.windows)
  const frames = finite(body.frames)
  const risk = typeof body.risk === 'string' ? body.risk : ''
  const detail = parseFeedDetail(body.detail)
  const method = parseMethod(body.method)
  if (!subject || subject.includes('/') || subject.includes('\\')) return null
  if (bpm == null || bpm <= 0 || bpm > 400) return null
  if (durationSec == null || durationSec <= 0 || durationSec > 600) return null
  if (conflict == null || conflict < 0 || conflict > 1) return null
  if (windows == null || windows < 1 || windows > 500) return null
  if (frames == null || frames < 16 || frames > 20000) return null
  if (!RISKS.has(risk) || !detail || !method) return null
  const referenceBpm = optional(body.referenceBpm, 20, 240)
  if (body.referenceBpm != null && referenceBpm == null) return null
  const plainBpm = optional(body.plainBpm, 0, 400)
  if (body.plainBpm != null && (plainBpm == null || plainBpm <= 0)) return null
  const weightedBpm = optional(body.weightedBpm, 0, 400)
  if (body.weightedBpm != null && (weightedBpm == null || weightedBpm <= 0)) return null
  const cleanedBpm = optional(body.cleanedBpm, 0, 400)
  if (body.cleanedBpm != null && (cleanedBpm == null || cleanedBpm <= 0)) return null
  const snr = optional(body.snr, 0, 1e12)
  if (body.snr != null && snr == null) return null
  const respiratoryRate = optional(body.respiratoryRate, 2, 80)
  if (body.respiratoryRate != null && respiratoryRate == null) return null
  const breathsInClip = optional(body.breathsInClip, 0, 80)
  if (body.breathsInClip != null && breathsInClip == null) return null
  return {
    subject,
    bpm,
    plainBpm,
    weightedBpm,
    cleanedBpm,
    referenceBpm,
    snr,
    durationSec,
    respiratoryRate,
    breathsInClip,
    risk: risk as LabSubjectInput['risk'],
    conflict,
    windows: Math.round(windows),
    frames: Math.round(frames),
    method,
    thumb: parseThumb(body.thumb),
    detail,
  }
}
