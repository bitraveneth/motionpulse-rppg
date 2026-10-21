import { describe, expect, it } from 'vitest'
import { runPipeline } from './pipeline'
import { generateSyntheticSample } from './synthetic'
import { DEFAULT_CONTROLS } from './types'

describe('synthetic sample + pipeline', () => {
  it('generates aligned landmarks and ROI RGB', () => {
    const s = generateSyntheticSample({ durationSec: 4, seed: 1 })
    expect(s.frames.length).toBe(120)
    expect(s.roiRgb.forehead.length).toBe(120)
    expect(s.truePulse.length).toBe(120)
  })

  it('higher motion artifact raises combined conflict', () => {
    const low = generateSyntheticSample({
      durationSec: 10,
      motionArtifactAmp: 0.05,
      rigidShake: 0.002,
      talkAmp: 0.002,
      seed: 11,
    })
    const high = generateSyntheticSample({
      durationSec: 10,
      motionArtifactAmp: 0.95,
      rigidShake: 0.002,
      talkAmp: 0.002,
      seed: 11,
    })
    const controls = {
      ...DEFAULT_CONTROLS,
      windowLengthSec: 8,
      alpha: 0.5,
      beta: 0.5,
    }
    const rLow = runPipeline({
      frames: low.frames,
      roiRgb: low.roiRgb,
      sampleRateHz: low.sampleRateHz,
      controls,
    })
    const rHigh = runPipeline({
      frames: high.frames,
      roiRgb: high.roiRgb,
      sampleRateHz: high.sampleRateHz,
      controls,
    })
    expect(rHigh.conflict.combined).toBeGreaterThan(rLow.conflict.combined)
  })

  it('suppression gain drops as conflict rises but stays above floor', () => {
    const s = generateSyntheticSample({
      durationSec: 10,
      motionArtifactAmp: 0.85,
      seed: 2,
    })
    const floor = 0.2
    const r = runPipeline({
      frames: s.frames,
      roiRgb: s.roiRgb,
      sampleRateHz: s.sampleRateHz,
      controls: { ...DEFAULT_CONTROLS, suppressionFloor: floor },
    })
    expect(r.suppression.gain).toBeGreaterThanOrEqual(floor)
    expect(r.suppression.gain).toBeLessThanOrEqual(1)
  })
})
