import { detrend, std } from './dsp'

export type BeatReading = {
  /** Intervals in the window, scaled to a minute: intervals × (60 ÷ seconds they cover). */
  perMinute: number
  /** Beats those intervals connect. */
  beats: number
  /** Seconds from the first accepted beat to the last. */
  seconds: number
  intervalsSec: number[]
}

export type HrvReading = {
  /** Root mean square of successive interval differences, in milliseconds. */
  rmssdMs: number
  /** Average gap between beats, in milliseconds. */
  meanNnMs: number
  beats: number
  seconds: number
  shortWindow: true
}

function peakIndices(series: number[], minGap: number): number[] {
  const peaks: number[] = []
  for (let i = 1; i < series.length - 1; i++) {
    const value = series[i]!
    if (value <= series[i - 1]! || value < series[i + 1]!) continue
    if (value <= 0.35) continue
    const previous = peaks[peaks.length - 1]
    if (previous != null && i - previous < minGap) {
      if (value > series[previous]!) peaks[peaks.length - 1] = i
      continue
    }
    peaks.push(i)
  }
  return peaks
}

/**
 * Heart rate from pulse peaks.
 * Eight intervals covering 6 seconds is 8 × (60 / 6) = 80 per minute.
 */
export function heartRateFromPeaks(
  series: number[],
  sampleRateHz: number,
): BeatReading | null {
  if (series.length < 24 || sampleRateHz < 2) return null
  const wave = detrend(series)
  const scale = std(wave)
  if (scale < 1e-8) return null
  const norm = wave.map((value) => value / scale)
  const minGap = Math.max(2, Math.round((sampleRateHz * 60) / 180))
  const maxGap = Math.max(minGap + 1, Math.round((sampleRateHz * 60) / 40))
  const peaks = peakIndices(norm, minGap)
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    const gap = peaks[i]! - peaks[i - 1]!
    if (gap < minGap || gap > maxGap) continue
    intervals.push(gap / sampleRateHz)
  }
  if (intervals.length < 3) return null
  const seconds = intervals.reduce((sum, value) => sum + value, 0)
  if (seconds < 1) return null
  const perMinute = (intervals.length * 60) / seconds
  if (perMinute < 40 || perMinute > 180) return null
  return {
    perMinute,
    beats: intervals.length + 1,
    seconds,
    intervalsSec: intervals,
  }
}

/**
 * Short-window HRV. Needs 8 beats, and the peak rate has to sit near the
 * spectrum rate so a noisy peak train is not reported as variability.
 */
export function hrvFromBeats(
  reading: BeatReading,
  spectralBpm?: number | null,
): HrvReading | null {
  if (reading.beats < 8 || reading.intervalsSec.length < 7) return null
  if (spectralBpm != null && Number.isFinite(spectralBpm)) {
    if (Math.abs(reading.perMinute - spectralBpm) > 12) return null
  }
  const gaps = reading.intervalsSec
  let diffSq = 0
  for (let i = 1; i < gaps.length; i++) {
    const delta = gaps[i]! - gaps[i - 1]!
    diffSq += delta * delta
  }
  const rmssdMs = Math.sqrt(diffSq / (gaps.length - 1)) * 1000
  const meanNnMs = (reading.seconds / gaps.length) * 1000
  if (!Number.isFinite(rmssdMs) || rmssdMs > 200) return null
  return {
    rmssdMs,
    meanNnMs,
    beats: reading.beats,
    seconds: reading.seconds,
    shortWindow: true,
  }
}

/** Prefer the peak count when it agrees with the spectrum. Otherwise keep the spectrum. */
export function shownHeartRate(
  spectralBpm: number | null | undefined,
  beats: BeatReading | null,
): number | null {
  if (beats && spectralBpm != null && Number.isFinite(spectralBpm)) {
    if (Math.abs(beats.perMinute - spectralBpm) <= 12) return beats.perMinute
    return spectralBpm
  }
  if (spectralBpm != null && Number.isFinite(spectralBpm)) return spectralBpm
  return beats?.perMinute ?? null
}
