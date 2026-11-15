import { describe, expect, it } from 'vitest'
import {
  absoluteError,
  rq1Summary,
  rq2Modes,
  rq3Summary,
  rq4Summary,
  type EvalClip,
} from './metrics'

function clip(partial: Partial<EvalClip>): EvalClip {
  return {
    settledBpm: null,
    conflictScore: null,
    risk: null,
    regionWeights: [],
    groundTruth: null,
    ...partial,
  }
}

describe('research metrics', () => {
  it('waits when no clip has a labeled heart rate', () => {
    const clips = [clip({ settledBpm: 52.9, conflictScore: 0.5, risk: 'elevated' })]
    expect(rq1Summary(clips).mae).toBeNull()
    expect(rq1Summary(clips).pairCount).toBe(0)
    expect(rq2Modes(clips).find((mode) => mode.id === 'uniform')?.kind).toBe('waiting')
    expect(rq3Summary(clips).labeledCount).toBe(0)
    expect(rq4Summary(clips).ready).toBe(false)
  })

  it('pairs conflict with absolute error and averages the labeled rows', () => {
    const clips = [
      clip({
        settledBpm: 90,
        conflictScore: 0.2,
        risk: 'low',
        regionWeights: [0.4, 0.3, 0.2, 0.1],
        groundTruth: { heartRate: 100, source: 'device', datasetName: 'UBFC' },
      }),
      clip({
        settledBpm: 70,
        conflictScore: 0.8,
        risk: 'high',
        regionWeights: [0.2, 0.2, 0.2, 0.4],
        groundTruth: { heartRate: 90, source: 'dataset', datasetName: 'PURE' },
      }),
    ]
    expect(absoluteError(90, 100)).toBe(10)
    const rq1 = rq1Summary(clips)
    expect(rq1.pairCount).toBe(2)
    expect(rq1.mae).toBe(15)
    expect(rq1.pairs[1]).toEqual({ conflict: 0.8, error: 20 })

    const modes = rq2Modes(clips)
    expect(modes.find((mode) => mode.id === 'uniform')?.kind).toBe('aggregate')
    expect(modes.find((mode) => mode.id === 'motion')?.kind).toBe('placeholder')
    expect(modes.find((mode) => mode.id === 'joint')?.detail).toContain('Forehead 30%')

    const rq3 = rq3Summary(clips)
    expect(rq3.calmMae).toBe(10)
    expect(rq3.motionMae).toBe(20)

    const rq4 = rq4Summary(clips)
    expect(rq4.ready).toBe(true)
    expect(rq4.datasets.map((set) => set.name)).toEqual(['PURE', 'UBFC'])
  })

  it('keeps a cross-dataset summary empty until two named sets exist', () => {
    const clips = [
      clip({
        settledBpm: 80,
        groundTruth: { heartRate: 82, source: 'dataset', datasetName: 'UBFC' },
      }),
      clip({
        settledBpm: 80,
        groundTruth: { heartRate: 90, source: 'device', datasetName: null },
      }),
    ]
    expect(rq4Summary(clips).ready).toBe(false)
    expect(rq4Summary(clips).datasets).toHaveLength(1)
  })
})
