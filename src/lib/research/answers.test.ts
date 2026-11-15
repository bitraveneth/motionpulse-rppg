import { describe, expect, it } from 'vitest'
import { researchReport, type ResearchRow } from './answers'

function row(partial: Partial<ResearchRow> & Pick<ResearchRow, 'cameraBpm' | 'referenceBpm' | 'conflict' | 'risk'>): ResearchRow {
  return { plainBpm: partial.cameraBpm, weightedBpm: partial.cameraBpm, ...partial }
}

describe('researchReport', () => {
  it('says conflict tracks the miss when the line is positive', () => {
    const rows = [
      row({ cameraBpm: 80, referenceBpm: 80, conflict: 0.1, risk: 'low', weightedBpm: 80, plainBpm: 90 }),
      row({ cameraBpm: 70, referenceBpm: 90, conflict: 0.8, risk: 'high', weightedBpm: 88, plainBpm: 60 }),
      row({ cameraBpm: 100, referenceBpm: 90, conflict: 0.55, risk: 'elevated', weightedBpm: 91, plainBpm: 70 }),
    ]
    const report = researchReport(rows, [
      { name: 'UBFC', mae: 8, count: 42 },
      { name: 'PURE', mae: 11, count: 10 },
    ])
    expect(report.rq1.verdict).toBe('yes')
    expect(report.rq1.sentence.startsWith('Yes.')).toBe(true)
    expect(report.rq1.r).toBeGreaterThan(0.3)
    expect(report.rq1.points).toHaveLength(3)
    expect(report.rq2.verdict).toBe('yes')
    expect(report.rq2.sentence.startsWith('Yes.')).toBe(true)
    expect(report.rq3.verdict).toBe('yes')
    expect(report.rq3.sentence.startsWith('Yes.')).toBe(true)
    expect(report.rq3.hardCount).toBe(2)
    expect(report.rq4.verdict).toBe('yes')
    expect(report.rq4.sentence).toContain('UBFC')
    expect(report.rq4.sentence).toContain('PURE')
  })

  it('waits when the folder has not been run', () => {
    const report = researchReport([], [])
    expect(report.rq1.verdict).toBe('wait')
    expect(report.rq1.sentence).toMatch(/No labeled video/)
    expect(report.rq4.verdict).toBe('wait')
    expect(report.rq4.sentence).toMatch(/No saved dataset/)
  })

  it('names the one dataset and says a second is not saved', () => {
    const report = researchReport(
      [row({ cameraBpm: 86, referenceBpm: 97, conflict: 0.4, risk: 'moderate' })],
      [{ name: 'UBFC', mae: 11, count: 1 }],
    )
    expect(report.rq4.verdict).toBe('partial')
    expect(report.rq4.sentence).toContain('UBFC')
    expect(report.rq4.sentence).toMatch(/second dataset/)
  })
})