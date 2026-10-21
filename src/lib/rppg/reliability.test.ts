import { describe, expect, it } from 'vitest'
import { computeReliability, softWeights } from './reliability'
import { generateSyntheticSample } from './synthetic'
import type { RoiId } from './types'
import { ROI_IDS } from './types'
import { localMotionSeries } from './motion'

describe('reliability', () => {
  it('soft weights sum to 1', () => {
    const reliability = {
      forehead: 0.9,
      leftCheek: 0.4,
      rightCheek: 0.4,
      lowerFace: 0.1,
    } as Record<RoiId, number>
    const { weights, entropy } = softWeights(reliability)
    const sum = ROI_IDS.reduce((a, id) => a + weights[id]!, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(weights.forehead).toBeGreaterThan(weights.lowerFace)
    expect(entropy).toBeGreaterThan(0)
  })

  it('high lower-face motion lowers its weight vs forehead on synthetic', () => {
    const sample = generateSyntheticSample({
      durationSec: 10,
      motionArtifactAmp: 0.5,
      talkAmp: 0.02,
      pulseBpm: 72,
      seed: 3,
    })
    const localMotion = {} as Record<RoiId, number[]>
    for (const id of ROI_IDS) {
      localMotion[id] = localMotionSeries(sample.frames, id)
    }
    const result = computeReliability({
      sampleRateHz: sample.sampleRateHz,
      physBandHz: [0.7, 4],
      method: 'CHROM',
      lambda: 4,
      localMotion,
      roiRgb: sample.roiRgb,
    })
    expect(result.weights.forehead).toBeGreaterThan(result.weights.lowerFace)
    expect(
      ROI_IDS.reduce((a, id) => a + result.weights[id]!, 0),
    ).toBeCloseTo(1, 5)
  })
})
