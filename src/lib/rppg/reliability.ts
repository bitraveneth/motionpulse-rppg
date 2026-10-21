/**
 * Motion-adaptive regional reliability (thesis §3.1.4).
 * R_i = σ(λ (Q_i − M_i)); soft weights w_i sum to 1.
 */

import {
  clamp01,
  dominantFrequency,
  periodogram,
  sigmoid,
  spectralSnr,
  standardize,
} from './dsp'
import type { ReliabilityResult, RoiId, RgbSample } from './types'
import { ROI_IDS } from './types'
import { extractCandidate, type CandidateOptions } from './candidate'

export type ReliabilityOptions = CandidateOptions & {
  /** Steepness of sigmoid(λ (Q − M)). */
  lambda: number
  /** Per-ROI motion magnitude series (aligned length). */
  localMotion: Record<RoiId, number[]>
  /** Optional RGB traces per ROI for quality. */
  roiRgb: Record<RoiId, RgbSample[]>
}

function normalizeMagnitudes(values: Record<RoiId, number>): Record<RoiId, number> {
  const arr = ROI_IDS.map((id) => values[id] ?? 0)
  const max = Math.max(...arr, 1e-9)
  const out = {} as Record<RoiId, number>
  for (const id of ROI_IDS) {
    out[id] = clamp01((values[id] ?? 0) / max)
  }
  return out
}

/**
 * Physiological quality Q_i ∈ [0,1] from spectral SNR + dominant-peak strength
 * of a local CHROM/POS candidate in the phys band.
 */
export function roiQuality(
  rgb: RgbSample[],
  options: CandidateOptions,
): number {
  if (rgb.length < 16) return 0
  const cand = extractCandidate(rgb, options)
  const spec = periodogram(cand, options.sampleRateHz)
  const [fLo, fHi] = options.physBandHz
  const snr = spectralSnr(spec, fLo, fHi)
  const { power } = dominantFrequency(spec, fLo, fHi)
  // Map SNR to [0,1] with soft saturation; blend with peak energy.
  const snrScore = clamp01(Math.log1p(snr) / Math.log1p(40))
  const peakScore = clamp01(Math.sqrt(power) * 8)
  return clamp01(0.7 * snrScore + 0.3 * peakScore)
}

export function motionMagnitude(series: number[]): number {
  if (series.length === 0) return 0
  let s = 0
  for (const x of series) s += Math.abs(x)
  return s / series.length
}

/**
 * Softmax-style normalized weights from reliability scores.
 * Entropy of the weight distribution (nats → bits) for UI.
 */
export function softWeights(
  reliability: Record<RoiId, number>,
): { weights: Record<RoiId, number>; entropy: number } {
  const scores = ROI_IDS.map((id) => Math.max(1e-9, reliability[id] ?? 0))
  const sum = scores.reduce((a, b) => a + b, 0)
  const weights = {} as Record<RoiId, number>
  ROI_IDS.forEach((id, i) => {
    weights[id] = scores[i]! / sum
  })
  let entropy = 0
  for (const id of ROI_IDS) {
    const w = weights[id]!
    if (w > 0) entropy -= w * Math.log2(w)
  }
  return { weights, entropy }
}

/**
 * R_i = σ(λ (Q_i − M_i)) with Q, M normalized to comparable [0,1] scales.
 */
export function computeReliability(
  options: ReliabilityOptions,
): ReliabilityResult {
  const rawQ = {} as Record<RoiId, number>
  const rawM = {} as Record<RoiId, number>

  for (const id of ROI_IDS) {
    rawQ[id] = roiQuality(options.roiRgb[id] ?? [], options)
    rawM[id] = motionMagnitude(options.localMotion[id] ?? [])
  }

  const quality = rawQ
  const motion = normalizeMagnitudes(rawM)
  const reliability = {} as Record<RoiId, number>

  for (const id of ROI_IDS) {
    const q = quality[id]!
    const m = motion[id]!
    reliability[id] = sigmoid(options.lambda * (q - m))
  }

  const { weights, entropy } = softWeights(reliability)
  return { quality, motion, reliability, weights, entropy }
}

/** Weighted aggregate of per-ROI candidates. */
export function weightedAggregate(
  roiSignals: Record<RoiId, number[]>,
  weights: Record<RoiId, number>,
): number[] {
  const lens = ROI_IDS.map((id) => roiSignals[id]?.length ?? 0).filter(
    (n) => n > 0,
  )
  if (lens.length === 0) return []
  const n = Math.min(...lens)
  const out = new Array<number>(n).fill(0)
  for (let t = 0; t < n; t++) {
    let s = 0
    for (const id of ROI_IDS) {
      s += (weights[id] ?? 0) * (roiSignals[id]?.[t] ?? 0)
    }
    out[t] = s
  }
  return standardize(out)
}
