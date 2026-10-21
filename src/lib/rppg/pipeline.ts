/**
 * End-to-end analysis for one window of landmarks + ROI RGB.
 */

import { averageRgbTraces, extractCandidate } from './candidate'
import { computeConflict, softSuppress } from './conflict'
import {
  dominantFrequency,
  mean,
  periodogram,
} from './dsp'
import { computeMotionBundle } from './motion'
import {
  computeReliability,
  weightedAggregate,
} from './reliability'
import type {
  ConflictScores,
  DemoControls,
  FrameLandmarks,
  ReliabilityResult,
  RoiId,
  RoiRgbTrace,
  SuppressionResult,
} from './types'
import { ROI_IDS } from './types'

export type PipelineInput = {
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
  controls: DemoControls
}

export type PipelineResult = {
  motion: ReturnType<typeof computeMotionBundle>
  candidate: number[]
  roiCandidates: Record<RoiId, number[]>
  conflict: ConflictScores
  suppression: SuppressionResult
  reliability: ReliabilityResult
  aggregated: number[]
  spectra: {
    candidate: ReturnType<typeof periodogram>
    motion: ReturnType<typeof periodogram>
    gated: ReturnType<typeof periodogram>
  }
  estimatedBpm: number
  gatedBpm: number
  windowSamples: number
}

function alignLength(a: number[], b: number[]): [number[], number[]] {
  const n = Math.min(a.length, b.length)
  return [a.slice(0, n), b.slice(0, n)]
}

export function runPipeline(input: PipelineInput): PipelineResult {
  const { frames, roiRgb, sampleRateHz, controls } = input
  const maxSamples = Math.max(
    16,
    Math.round(controls.windowLengthSec * sampleRateHz),
  )

  const frameWindow = frames.slice(-maxSamples)
  const rgbWindow = {} as RoiRgbTrace
  for (const id of ROI_IDS) {
    rgbWindow[id] = (roiRgb[id] ?? []).slice(-maxSamples)
  }

  const motion = computeMotionBundle(frameWindow)
  // Motion series is T-1; trim RGB to match for conflict
  const avgRgb = averageRgbTraces(rgbWindow)
  const candidateOpts = {
    sampleRateHz,
    physBandHz: controls.physBandHz,
    method: controls.candidateMethod,
  }

  const fullCandidate = extractCandidate(avgRgb, candidateOpts)
  // Align: drop first candidate sample to match motion length when possible
  let candidate = fullCandidate
  let motionSeries = motion.global
  if (candidate.length === motionSeries.length + 1) {
    candidate = candidate.slice(1)
  } else {
    ;[candidate, motionSeries] = alignLength(candidate, motionSeries)
  }

  const conflict = computeConflict(motionSeries, candidate, {
    sampleRateHz,
    physBandHz: controls.physBandHz,
    alpha: controls.alpha,
    beta: controls.beta,
  })

  const suppression = softSuppress(
    candidate,
    conflict.combined,
    controls.suppressionFloor,
  )

  const localMotionAligned = {} as Record<RoiId, number[]>
  for (const id of ROI_IDS) {
    let loc = motion.local[id]
    if (loc.length === fullCandidate.length) loc = loc
    else if (loc.length === fullCandidate.length - 1) {
      // ok
    }
    localMotionAligned[id] = loc.slice(-candidate.length)
  }

  const reliability = computeReliability({
    ...candidateOpts,
    lambda: controls.reliabilityLambda,
    localMotion: localMotionAligned,
    roiRgb: rgbWindow,
  })

  const roiCandidates = {} as Record<RoiId, number[]>
  for (const id of ROI_IDS) {
    let c = extractCandidate(rgbWindow[id] ?? [], candidateOpts)
    if (c.length > candidate.length) c = c.slice(-candidate.length)
    roiCandidates[id] = c
  }

  const aggregated = weightedAggregate(roiCandidates, reliability.weights)

  const spectra = {
    candidate: periodogram(candidate, sampleRateHz),
    motion: periodogram(motionSeries, sampleRateHz),
    gated: periodogram(suppression.gated, sampleRateHz),
  }

  const [fLo, fHi] = controls.physBandHz
  const estimatedBpm =
    dominantFrequency(spectra.candidate, fLo, fHi).freqHz * 60
  const gatedBpm = dominantFrequency(spectra.gated, fLo, fHi).freqHz * 60

  return {
    motion,
    candidate,
    roiCandidates,
    conflict,
    suppression,
    reliability,
    aggregated,
    spectra,
    estimatedBpm,
    gatedBpm,
    windowSamples: candidate.length,
  }
}

export function summaryStats(result: PipelineResult): {
  globalMotion: number
  conflict: number
  gain: number
  topRoi: RoiId
} {
  let topRoi: RoiId = 'forehead'
  let topW = -1
  for (const id of ROI_IDS) {
    const w = result.reliability.weights[id] ?? 0
    if (w > topW) {
      topW = w
      topRoi = id
    }
  }
  return {
    globalMotion: result.motion.globalMean,
    conflict: result.conflict.combined,
    gain: result.suppression.gain,
    topRoi,
  }
}

export { mean }
