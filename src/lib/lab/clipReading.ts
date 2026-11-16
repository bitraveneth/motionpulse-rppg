import type { FeedDetail } from '../feed/detail'
import { conflictRiskLabel } from '../rppg/conflict'
import { dominantFrequency, periodogram, spectralSnr } from '../rppg/dsp'
import { runPipeline } from '../rppg/pipeline'
import { estimateShownBreath, faceGreenSeries } from '../rppg/respiratory'
import { DEFAULT_CONTROLS, type CandidateMethod, type RoiId } from '../rppg/types'
import type { AnalysisBuffer } from '../video/streamAnalyze'

export type ClipReading = {
  bpm: number
  snr: number
  windows: number
  conflict: number
  risk: 'low' | 'moderate' | 'elevated' | 'high'
  weights: Record<RoiId, number>
  /** Equal-weight heart rate before motion suppression. */
  plainBpm: number | null
  /** Heart rate after trust-weighting the four face regions. */
  weightedBpm: number | null
  /** Mean heart rate of windows below the elevated conflict band. */
  cleanedBpm: number | null
  durationSec: number
  respiratoryRate: number | null
  breathsInClip: number | null
  detail: FeedDetail
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sliceBuffer(buffer: AnalysisBuffer, start: number, count: number): AnalysisBuffer {
  const end = start + count
  return {
    frames: buffer.frames.slice(start, end),
    roiRgb: {
      forehead: buffer.roiRgb.forehead.slice(start, end),
      leftCheek: buffer.roiRgb.leftCheek.slice(start, end),
      rightCheek: buffer.roiRgb.rightCheek.slice(start, end),
      lowerFace: buffer.roiRgb.lowerFace.slice(start, end),
    },
    sampleRateHz: buffer.sampleRateHz,
  }
}

/** Same 8-second face algorithm as Scan, averaged across the clip. */
export function readingsFromBuffer(buffer: AnalysisBuffer, method: CandidateMethod = 'CHROM'): ClipReading {
  const controls = { ...DEFAULT_CONTROLS, candidateMethod: method }
  const fps = buffer.sampleRateHz
  const windowFrames = Math.max(16, Math.round(controls.windowLengthSec * fps))
  const stepFrames = Math.max(1, Math.round(fps))
  const [fLo, fHi] = controls.physBandHz
  const starts: number[] = []
  if (buffer.frames.length <= windowFrames) starts.push(0)
  else {
    for (let start = 0; start + windowFrames <= buffer.frames.length; start += stepFrames) {
      starts.push(start)
    }
  }
  const bpms: number[] = []
  const plains: number[] = []
  const weighteds: number[] = []
  const calm: number[] = []
  const snrs: number[] = []
  let last: ReturnType<typeof runPipeline> | null = null
  for (const start of starts) {
    const count = Math.min(windowFrames, buffer.frames.length - start)
    const slice = sliceBuffer(buffer, start, count)
    const result = runPipeline({
      frames: slice.frames,
      roiRgb: slice.roiRgb,
      sampleRateHz: slice.sampleRateHz,
      controls,
    })
    if (Number.isFinite(result.gatedBpm) && result.gatedBpm > 0) {
      bpms.push(result.gatedBpm)
      if (result.conflict.combined < 0.5) calm.push(result.gatedBpm)
      snrs.push(spectralSnr(result.spectra.gated, fLo, fHi))
      if (Number.isFinite(result.estimatedBpm) && result.estimatedBpm > 0) plains.push(result.estimatedBpm)
      const weighted = dominantFrequency(periodogram(result.aggregated, slice.sampleRateHz), fLo, fHi).freqHz * 60
      if (Number.isFinite(weighted) && weighted > 0) weighteds.push(weighted)
      last = result
    }
  }
  if (!last || bpms.length === 0) {
    throw new Error('The face algorithm did not return a heart rate')
  }
  const pulse =
    last.suppression.gated.length > 24 ? last.suppression.gated : last.motion.global
  const breath = estimateShownBreath(
    pulse,
    fps,
    last.motion.global,
    faceGreenSeries(buffer.roiRgb),
  )
  const durationSec = buffer.frames.length / Math.max(fps, 1e-6)
  return {
    bpm: mean(bpms),
    snr: mean(snrs),
    windows: bpms.length,
    plainBpm: plains.length > 0 ? mean(plains) : null,
    weightedBpm: weighteds.length > 0 ? mean(weighteds) : null,
    cleanedBpm: calm.length > 0 ? mean(calm) : null,
    conflict: last.conflict.combined,
    risk: conflictRiskLabel(last.conflict.combined).level,
    weights: last.reliability.weights,
    durationSec,
    respiratoryRate: breath?.breathsPerMin ?? null,
    breathsInClip: breath?.breathsInClip ?? null,
    detail: {
      motion: {
        overall: last.motion.globalMean,
        forehead: last.motion.localMean.forehead,
        cheeks: (last.motion.localMean.leftCheek + last.motion.localMean.rightCheek) / 2,
        lowerFace: last.motion.residualMean.lowerFace,
      },
      spectrum: {
        timeSync: last.conflict.cTemp,
        freqOverlap: last.conflict.cSpec,
        combined: last.conflict.combined,
      },
      trust: {
        forehead: last.reliability.weights.forehead ?? 0,
        leftCheek: last.reliability.weights.leftCheek ?? 0,
        rightCheek: last.reliability.weights.rightCheek ?? 0,
        lowerFace: last.reliability.weights.lowerFace ?? 0,
      },
    },
  }
}
