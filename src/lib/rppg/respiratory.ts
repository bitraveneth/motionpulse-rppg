/**
 * Experimental respiratory-rate estimate from low-band pulse residual / motion.
 * Not a clinical measurement — short clips often lack enough cycles.
 */

import { dominantFrequency, periodogram, spectralSnr } from './dsp'

/** Typical resting breath band (breaths/sec). */
export const RESP_BAND_HZ: [number, number] = [0.12, 0.5]

export type RespiratoryEstimate = {
  breathsPerMin: number
  /** Peak power SNR proxy in the respiratory band */
  snr: number
  /** True when duration/SNR look too weak to show a number */
  experimental: true
  reason?: string
}

/**
 * Derive a plausible breaths/min from a slow-varying series (PPG residual or motion).
 * Returns null when the clip is too short or the band peak is weak.
 */
export function estimateRespiratoryRate(
  series: number[],
  sampleRateHz: number,
  opts?: { minDurationSec?: number; minSnr?: number },
): RespiratoryEstimate | null {
  const minDurationSec = opts?.minDurationSec ?? 6
  const minSnr = opts?.minSnr ?? 1.8
  const durationSec = series.length / Math.max(1e-6, sampleRateHz)

  if (series.length < 24 || durationSec < minDurationSec) {
    return null
  }

  const spectrum = periodogram(series, sampleRateHz)
  const [fLo, fHi] = RESP_BAND_HZ
  const peak = dominantFrequency(spectrum, fLo, fHi)
  if (peak.freqHz <= 0) return null

  const snr = spectralSnr(spectrum, fLo, fHi)
  if (snr < minSnr) return null

  const breathsPerMin = peak.freqHz * 60
  if (breathsPerMin < 6 || breathsPerMin > 40) return null

  return {
    breathsPerMin,
    snr,
    experimental: true,
  }
}
