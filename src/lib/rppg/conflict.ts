/**
 * Temporal + spectral conflict scores and bounded soft suppression
 * (thesis §3.1.3). Conflict is graded risk — not causality.
 */

import {
  clamp01,
  detrend,
  maxLagAbsCorr,
  periodogram,
  spectralOverlap,
  standardize,
} from './dsp'
import type { ConflictScores, SuppressionResult } from './types'

export type ConflictOptions = {
  sampleRateHz: number
  physBandHz: [number, number]
  alpha: number
  beta: number
  /** Max lag (seconds) for temporal correlation search. */
  maxLagSec?: number
}

/**
 * C_temp: max |corr| between detrended/standardized motion and candidate
 * over a small lag window (motion may lead/lag photometry).
 */
export function temporalConflict(
  motion: number[],
  candidate: number[],
  sampleRateHz: number,
  maxLagSec = 0.5,
): number {
  const n = Math.min(motion.length, candidate.length)
  if (n < 8) return 0
  const m = standardize(detrend(motion.slice(0, n)))
  const c = standardize(detrend(candidate.slice(0, n)))
  const maxLag = Math.max(1, Math.round(maxLagSec * sampleRateHz))
  return clamp01(maxLagAbsCorr(m, c, maxLag))
}

/**
 * C_spec: cosine similarity of power spectra inside the physiological band.
 */
export function spectralConflict(
  motion: number[],
  candidate: number[],
  sampleRateHz: number,
  physBandHz: [number, number],
): number {
  const n = Math.min(motion.length, candidate.length)
  if (n < 8) return 0
  const m = motion.slice(0, n)
  const c = candidate.slice(0, n)
  const sm = periodogram(m, sampleRateHz)
  const sc = periodogram(c, sampleRateHz)
  return clamp01(spectralOverlap(sm, sc, physBandHz[0], physBandHz[1]))
}

/**
 * Combined conflict C = α C_temp + β C_spec (weights renormalized if needed).
 */
export function combinedConflict(
  cTemp: number,
  cSpec: number,
  alpha: number,
  beta: number,
): ConflictScores {
  const w = Math.max(1e-9, alpha + beta)
  const a = alpha / w
  const b = beta / w
  return {
    cTemp: clamp01(cTemp),
    cSpec: clamp01(cSpec),
    combined: clamp01(a * cTemp + b * cSpec),
  }
}

export function computeConflict(
  motion: number[],
  candidate: number[],
  options: ConflictOptions,
): ConflictScores {
  const cTemp = temporalConflict(
    motion,
    candidate,
    options.sampleRateHz,
    options.maxLagSec,
  )
  const cSpec = spectralConflict(
    motion,
    candidate,
    options.sampleRateHz,
    options.physBandHz,
  )
  return combinedConflict(cTemp, cSpec, options.alpha, options.beta)
}

/**
 * Soft gate with residual path: gain = (1 − C)·(1 − floor) + floor.
 * Pulse is never fully wiped (hard floor on residual energy).
 */
export function softSuppress(
  candidate: number[],
  conflict: number,
  residualFloor: number,
): SuppressionResult {
  const floor = clamp01(residualFloor)
  const c = clamp01(conflict)
  const gain = (1 - c) * (1 - floor) + floor
  return {
    gated: candidate.map((x) => x * gain),
    gain,
    residualFloor: floor,
  }
}

/** Human-readable risk band — never claims causality. */
export function conflictRiskLabel(c: number): {
  level: 'low' | 'moderate' | 'elevated' | 'high'
  label: string
  blurb: string
} {
  if (c < 0.25) {
    return {
      level: 'low',
      label: 'Low risk',
      blurb:
        'Face motion and the pulse estimate barely line up. That is a good sign — not a guarantee the pulse is perfect.',
    }
  }
  if (c < 0.5) {
    return {
      level: 'moderate',
      label: 'Moderate risk',
      blurb:
        'Some overlap between motion and the pulse estimate. Treat the BPM with a bit more caution.',
    }
  }
  if (c < 0.75) {
    return {
      level: 'elevated',
      label: 'Elevated risk',
      blurb:
        'Motion and pulse look closely related. Cleanup dials the estimate down but keeps a recoverable floor.',
    }
  }
  return {
    level: 'high',
    label: 'High risk',
    blurb:
      'Motion and the pulse estimate move together a lot. High risk score only — not proof that motion caused the error.',
  }
}
