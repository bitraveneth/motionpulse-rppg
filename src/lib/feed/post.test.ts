import { describe, expect, it } from 'vitest'
import { parseFeedPostInput } from './post'

const valid = {
  settledHeartRate: 72.44,
  respiratoryRate: 15.2,
  signalLabel: 'Low risk',
  risk: 'low',
  nickname: '  Mira  ',
  thumb: 'data:image/jpeg;base64,aaaa',
}

describe('parseFeedPostInput', () => {
  it('keeps settled numbers, label, risk, nickname, and a tiny image', () => {
    const parsed = parseFeedPostInput(valid)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.settledHeartRate).toBe(72.4)
    expect(parsed.data.respiratoryRate).toBe(15.2)
    expect(parsed.data.signalLabel).toBe('Low risk')
    expect(parsed.data.risk).toBe('low')
    expect(parsed.data.nickname).toBe('Mira')
    expect(parsed.data.thumb).toBe(valid.thumb)
  })

  it('allows a missing respiratory rate and nickname', () => {
    const parsed = parseFeedPostInput({
      settledHeartRate: 68,
      signalLabel: 'Moderate risk',
      risk: 'moderate',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.respiratoryRate).toBeNull()
    expect(parsed.data.nickname).toBeNull()
    expect(parsed.data.thumb).toBeNull()
  })

  it('rejects video payloads', () => {
    const parsed = parseFeedPostInput({
      ...valid,
      thumb: 'data:video/webm;base64,AAAA',
    })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/video/i)
  })

  it('rejects an oversized thumb and a heart rate outside range', () => {
    const huge = parseFeedPostInput({
      ...valid,
      thumb: `data:image/png;base64,${'a'.repeat(130_000)}`,
    })
    expect(huge.ok).toBe(false)

    const hr = parseFeedPostInput({ ...valid, settledHeartRate: 12 })
    expect(hr.ok).toBe(false)
  })
})