/**
 * Respiratory rate from a short face clip.
 *
 * A resting breath is about 3–5 seconds apart. This measures that spacing
 * in the clip, then scales it to a minute: 60 / seconds-per-breath.
 * Ten seconds with a breath every 4 seconds is 2.5 breaths, which is 15
 * per minute. It does not use the slowest spectrum bin (that bin is about
 * 8 per minute on a short clip, whether or not anyone breathed that slowly).
 */

import { pearsonCorr, standardize, std } from './dsp'
import type { RoiId, RoiRgbTrace } from './types'

/** Breaths per minute we will report. Stays above the fake ~8/min short-clip floor. */
const MIN_BPM = 10
const MAX_BPM = 30

export type RespiratoryEstimate = {
  breathsPerMin: number
  /** How many breaths fit in this clip at the measured spacing. */
  breathsInClip: number
  durationSec: number
  /** Autocorrelation at the chosen spacing, 0–1. */
  snr: number
  experimental: true
  reason?: string
}

/** Mean green channel across the face. Green carries the slow breath swell. */
export function faceGreenSeries(
  roiRgb: RoiRgbTrace | null | undefined,
): number[] {
  if (!roiRgb) return []
  const traces = [
    roiRgb.forehead,
    roiRgb.leftCheek,
    roiRgb.rightCheek,
    roiRgb.lowerFace,
  ]
  const len = Math.min(...traces.map((trace) => trace?.length ?? 0))
  if (!Number.isFinite(len) || len < 24) return []
  const out = new Array<number>(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    let n = 0
    for (const trace of traces) {
      const g = trace[i]?.g
      if (typeof g === 'number' && Number.isFinite(g)) {
        sum += g
        n += 1
      }
    }
    out[i] = n > 0 ? sum / n : 0
  }
  return out
}

function centeredSmooth(
  xs: number[],
  winSec: number,
  sampleRateHz: number,
): number[] {
  const win = Math.max(1, Math.round(winSec * sampleRateHz))
  const half = Math.floor(win / 2)
  const pref = new Array<number>(xs.length + 1)
  pref[0] = 0
  for (let i = 0; i < xs.length; i++) pref[i + 1] = pref[i]! + xs[i]!
  const out = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(xs.length - 1, i + half)
    out[i] = (pref[b + 1]! - pref[a]!) / (b - a + 1)
  }
  return out
}

/**
 * Keep waves about 2–5 seconds long. Faster than that is the heartbeat.
 * Slower than that is the drift that used to print as ~8 per minute.
 */
function breathBand(series: number[], sampleRateHz: number): number[] {
  const slow = centeredSmooth(series, 6, sampleRateHz)
  const residual = series.map((value, i) => value - slow[i]!)
  return centeredSmooth(residual, 1.35, sampleRateHz)
}

/** Strength of each heartbeat, so a breath shows up as a slow rise and fall. */
function pulseEnvelope(pulse: number[], sampleRateHz: number): number[] {
  const rect = pulse.map((value) => Math.abs(value))
  return centeredSmooth(rect, 0.85, sampleRateHz)
}

/**
 * An 8 second window loses one sample when it is aligned to motion, so
 * 95 samples at 12 Hz is 7.9s and used to be thrown out every time.
 */
function coversMinDuration(
  length: number,
  sampleRateHz: number,
  minDurationSec: number,
): boolean {
  if (length < 24) return false
  const rate = Math.max(1e-6, sampleRateHz)
  const durationSec = length / rate
  return durationSec + 1 / rate >= minDurationSec - 1e-3
}

function rateFromSpacing(
  series: number[],
  sampleRateHz: number,
  minCorr: number,
  minDurationSec: number,
): RespiratoryEstimate | null {
  const durationSec = series.length / Math.max(1e-6, sampleRateHz)
  if (!coversMinDuration(series.length, sampleRateHz, minDurationSec)) return null

  const wave = standardize(breathBand(series, sampleRateHz))
  if (std(wave) < 1e-8) return null

  // Search periods from about 10 to 34 breaths/min so a real 10/min peak is not stuck on the edge.
  const minLag = Math.max(2, Math.round((sampleRateHz * 60) / 34))
  const maxLag = Math.min(
    series.length - 8,
    Math.round((sampleRateHz * 60) / 10),
  )
  if (maxLag <= minLag + 2) return null

  const corr = new Array<number>(maxLag + 1).fill(Number.NaN)
  const corrAt = (lag: number) => {
    const cached = corr[lag]
    if (cached === cached) return cached!
    const value = pearsonCorr(wave.slice(0, wave.length - lag), wave.slice(lag))
    corr[lag] = value
    return value
  }

  let bestLag = -1
  let best = -Infinity
  for (let lag = minLag + 1; lag <= maxLag - 1; lag++) {
    const c = corrAt(lag)
    if (c < corrAt(lag - 1) || c < corrAt(lag + 1)) continue
    if (c > best) {
      best = c
      bestLag = lag
    }
  }
  if (bestLag < 0 || best < minCorr) return null

  const y0 = corrAt(bestLag - 1)
  const y1 = best
  const y2 = corrAt(bestLag + 1)
  const denom = y0 - 2 * y1 + y2
  let delta = Math.abs(denom) < 1e-9 ? 0 : (0.5 * (y0 - y2)) / denom
  delta = Math.max(-0.75, Math.min(0.75, delta))
  const periodSec = (bestLag + delta) / sampleRateHz
  if (periodSec <= 0.4) return null

  const breathsPerMin = 60 / periodSec
  if (breathsPerMin < MIN_BPM || breathsPerMin > MAX_BPM) return null

  return {
    breathsPerMin,
    breathsInClip: durationSec / periodSec,
    durationSec,
    snr: best,
    experimental: true,
  }
}

/**
 * Breaths/min from one series. `minSnr` above 1 is the old spectrum threshold
 * and is ignored; correlation uses its own 0–1 scale.
 */
export function estimateRespiratoryRate(
  series: number[],
  sampleRateHz: number,
  opts?: { minDurationSec?: number; minSnr?: number },
): RespiratoryEstimate | null {
  const minDurationSec = opts?.minDurationSec ?? 8
  if (!coversMinDuration(series.length, sampleRateHz, minDurationSec)) return null
  const minCorr =
    opts?.minSnr != null && opts.minSnr > 0 && opts.minSnr <= 1
      ? opts.minSnr
      : 0.25
  return rateFromSpacing(series, sampleRateHz, minCorr, minDurationSec)
}

/**
 * Rate to show after a scan.
 * Compares the face-color swell, head motion, and the rise and fall of
 * pulse strength, and keeps the spacing that repeats most clearly.
 * That spacing is already scaled to breaths per minute.
 */
const BREATH_ROIS: RoiId[] = ['forehead', 'leftCheek', 'rightCheek', 'lowerFace']

export function estimateShownBreath(
  pulse: number[],
  sampleRateHz: number,
  motion?: number[] | null,
  slowColor?: number[] | null,
  roiRgb?: RoiRgbTrace | null,
): RespiratoryEstimate | null {
  const found: RespiratoryEstimate[] = []
  const consider = (series: number[] | null | undefined) => {
    if (!series || series.length < 24) return
    const est = estimateRespiratoryRate(series, sampleRateHz)
    if (est) found.push(est)
  }
  consider(slowColor)
  if (roiRgb) {
    for (const id of BREATH_ROIS) {
      consider((roiRgb[id] ?? []).map((sample) => sample.g))
    }
  }
  consider(motion)
  consider(pulseEnvelope(pulse, sampleRateHz))
  if (found.length === 0) return null
  found.sort((a, b) => b.snr - a.snr)
  return found[0]!
}

/** Note under the number: breaths seen in the clip, and ×6 when the clip is 10s. */
export function breathScaleNote(est: RespiratoryEstimate): string {
  const secs = Math.max(1, Math.round(est.durationSec))
  const count = est.breathsInClip.toFixed(1)
  if (secs === 10) return `${count} breaths in 10s, × 6`
  return `${count} breaths in ${secs}s`
}
