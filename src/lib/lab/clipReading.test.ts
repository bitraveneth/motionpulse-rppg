import { describe, expect, it } from 'vitest'
import { generateSyntheticSample } from '../rppg/synthetic'
import { comparisonSummary } from '../research/comparison'
import { readingsFromBuffer } from './clipReading'

describe('readingsFromBuffer', () => {
  it('uses the face algorithm on a known pulse and fills agreement', () => {
    const sample = generateSyntheticSample({
      durationSec: 20,
      sampleRateHz: 15,
      pulseBpm: 75,
      motionArtifactAmp: 0.05,
      rigidShake: 0.001,
      talkAmp: 0.001,
      seed: 3,
    })
    const reading = readingsFromBuffer({
      frames: sample.frames,
      roiRgb: sample.roiRgb,
      sampleRateHz: sample.sampleRateHz,
    })
    expect(reading.windows).toBeGreaterThan(1)
    expect(Math.abs(reading.bpm - 75)).toBeLessThan(8)
    expect(reading.snr).toBeGreaterThan(1)
    expect(reading.durationSec).toBeGreaterThan(8)
    expect(reading.plainBpm).not.toBeNull()
    expect(reading.weightedBpm).not.toBeNull()
    expect(reading.detail.spectrum.combined).toBeGreaterThanOrEqual(0)
    expect(reading.detail.trust.forehead).toBeGreaterThanOrEqual(0)
    expect(reading.detail.motion.overall).toBeGreaterThanOrEqual(0)
    const summary = comparisonSummary(
      [
        { estimate: reading.bpm, reference: 75 },
        { estimate: reading.bpm + 1, reference: 76 },
      ],
      [reading.snr, reading.snr],
    )
    expect(summary.mae).not.toBeNull()
    expect(summary.pearson).not.toBeNull()
    expect(summary.snrMean).toBeGreaterThan(0)
    expect(summary.loaLow).not.toBeNull()
    expect(summary.loaHigh).not.toBeNull()
  })
})
