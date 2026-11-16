import { describe, expect, it } from 'vitest'
import { datasetLabel, parseLabSubject, parseThumb } from './labSubject'

const detail = {
  motion: { overall: 0.023, forehead: 0.026, cheeks: 0.022, lowerFace: 0.001 },
  spectrum: { timeSync: 0.31, freqOverlap: 0.77, combined: 0.54 },
  trust: { forehead: 0.17, leftCheek: 0.15, rightCheek: 0.39, lowerFace: 0.29 },
}

describe('lab subject records', () => {
  it('keeps the folder name and drops the disk path', () => {
    expect(datasetLabel('/Volumes/Seagate/UBFC/UBFC')).toBe('UBFC')
  })

  it('accepts a result card and rejects a path used as the subject', () => {
    const row = parseLabSubject({
      subject: 'subject1',
      bpm: 86.1,
      plainBpm: 90,
      weightedBpm: 88,
      referenceBpm: 97,
      snr: 4.2,
      durationSec: 60,
      respiratoryRate: 15,
      breathsInClip: 15,
      risk: 'elevated',
      conflict: 0.54,
      windows: 52,
      frames: 900,
      detail,
    })
    expect(row?.subject).toBe('subject1')
    expect(row?.method).toBe('CHROM')
    expect(row?.cleanedBpm).toBeNull()
    expect(parseLabSubject({ ...row, method: 'POS' })?.method).toBe('POS')
    expect(parseLabSubject({ ...row, method: 'ICA' })).toBeNull()
    expect(row?.thumb).toBeNull()
    expect(row?.detail.trust.rightCheek).toBe(0.39)
    const thumb = 'data:image/jpeg;base64,aGVsbG8='
    expect(parseLabSubject({ ...row, thumb })?.thumb).toBe(thumb)
    expect(parseThumb('https://example.com/face.jpg')).toBeNull()
    expect(parseThumb(`data:image/jpeg;base64,${'a'.repeat(130_000)}`)).toBeNull()
    expect(parseLabSubject({ ...row, subject: '/Users/alex/secret' })).toBeNull()
    expect(parseLabSubject({ ...row, bpm: 900 })).toBeNull()
  })
})
