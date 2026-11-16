import { describe, expect, it } from 'vitest'
import { parseTrainLog } from './trainRecord'

describe('parseTrainLog', () => {
  it('reads the record line, the losses, and who was held out', () => {
    const parsed = parseTrainLog([
      'train  /data/UBFC',
      'epoch 1/2  loss=1.500000',
      'record {"windows":4,"learned":[{"name":"subject1","windows":4}],"heldOut":["subject2"],"history":[{"epoch":1,"loss":1.5},{"epoch":2,"loss":0.8}],"checkpoint":"research/out/physnet_local.pt"}',
      'saved checkpoint → research/out/physnet_local.pt',
    ])
    expect(parsed.windows).toBe(4)
    expect(parsed.finalLoss).toBe(0.8)
    expect(parsed.bestLoss).toBe(0.8)
    expect(parsed.checkpoint).toBe('research/out/physnet_local.pt')
    expect(parsed.people).toEqual([
      { subject: 'subject1', role: 'learned', windows: 4, bpm: null, referenceBpm: null },
      { subject: 'subject2', role: 'held out', windows: 0, bpm: null, referenceBpm: null },
    ])
    expect(parsed.heldMae).toBeNull()
    expect(parsed.history).toEqual([
      { epoch: 1, loss: 1.5 },
      { epoch: 2, loss: 0.8 },
    ])
  })

  it('falls back to epoch lines when the record is missing', () => {
    const parsed = parseTrainLog(['epoch 1/1  loss=2.25', 'stop  1'])
    expect(parsed.finalLoss).toBe(2.25)
    expect(parsed.people).toEqual([])
    expect(parsed.note).toBe('stop  1')
  })

  it('keeps the held-out miss and the other-camera miss', () => {
    const parsed = parseTrainLog([
      'record {"windows":12,"learned":[{"name":"subject1","windows":4}],"heldOut":[{"name":"subject9","windows":2,"bpm":88.2,"reference":96.4}],"heldMae":8.2,"heldCount":1,"crossName":"PURE","crossMae":14.5,"crossCount":10,"history":[{"epoch":1,"loss":1.2}],"checkpoint":"research/out/physnet_local.pt"}',
    ])
    expect(parsed.heldMae).toBe(8.2)
    expect(parsed.heldCount).toBe(1)
    expect(parsed.crossName).toBe('PURE')
    expect(parsed.crossMae).toBe(14.5)
    expect(parsed.crossCount).toBe(10)
    expect(parsed.people[1]).toEqual({
      subject: 'subject9',
      role: 'held out',
      windows: 2,
      bpm: 88.2,
      referenceBpm: 96.4,
    })
  })
})
