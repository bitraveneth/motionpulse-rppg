import { describe, expect, it } from 'vitest'
import { fullestRuns, researchReport, runIdentity, type MethodRun, type ResearchRow } from './answers'

function row(partial: Partial<ResearchRow> & Pick<ResearchRow, 'cameraBpm' | 'referenceBpm' | 'conflict' | 'risk'>): ResearchRow {
  return { plainBpm: partial.cameraBpm, weightedBpm: partial.cameraBpm, ...partial }
}

function run(dataset: string, method: string, rows: ResearchRow[], count?: number, mae?: number): MethodRun {
  return { dataset, method, rows, count, mae }
}

describe('researchReport', () => {
  it('uses the fuller run when a later slice is smaller', () => {
    const full = [
      row({ cameraBpm: 80, referenceBpm: 90, conflict: 0.2, risk: 'low', plainBpm: 80 }),
      row({ cameraBpm: 70, referenceBpm: 90, conflict: 0.8, risk: 'high', plainBpm: 70 }),
      row({ cameraBpm: 100, referenceBpm: 88, conflict: 0.4, risk: 'moderate', plainBpm: 100 }),
    ]
    const slice = [full[0]!, full[1]!]
    const chosen = fullestRuns([
      run('UBFC', 'POS', slice),
      run('UBFC', 'POS', full),
    ])
    expect(chosen).toHaveLength(1)
    expect(chosen[0]!.rows).toHaveLength(3)
  })

  it('keeps a same-size run that stored calm windows', () => {
    const plain = [
      row({ cameraBpm: 80, referenceBpm: 90, conflict: 0.2, risk: 'low' }),
      row({ cameraBpm: 70, referenceBpm: 90, conflict: 0.8, risk: 'high' }),
    ]
    const cleaned = plain.map((item) => ({ ...item, cleanedBpm: item.cameraBpm - 5 }))
    const chosen = fullestRuns([
      run('UBFC', 'POS', plain),
      run('UBFC', 'POS', cleaned),
    ])
    expect(chosen[0]!.rows[0]!.cleanedBpm).toBe(75)
  })

  it('says the full runs do not all agree, and names each method', () => {
    const report = researchReport([
      run('UBFC', 'POS', [
        row({ cameraBpm: 80, referenceBpm: 90, conflict: 0.2, risk: 'low', weightedBpm: 95, plainBpm: 80 }),
        row({ cameraBpm: 70, referenceBpm: 72, conflict: 0.8, risk: 'high', weightedBpm: 90, plainBpm: 70 }),
        row({ cameraBpm: 100, referenceBpm: 88, conflict: 0.5, risk: 'elevated', weightedBpm: 110, plainBpm: 100 }),
      ]),
      run('UBFC', 'CHROM', [
        row({ cameraBpm: 60, referenceBpm: 90, conflict: 0.2, risk: 'moderate', weightedBpm: 70, plainBpm: 60 }),
        row({ cameraBpm: 110, referenceBpm: 100, conflict: 0.7, risk: 'high', weightedBpm: 120, plainBpm: 110 }),
      ]),
      run('PURE', 'POS', [], 39, 8.6),
      run('PURE', 'CHROM', [], 39, 26.9),
    ])
    expect(report.rq1.verdict).not.toBe('yes')
    expect(report.rq1.lines.some((line) => line.startsWith('UBFC POS'))).toBe(true)
    expect(report.rq1.lines.some((line) => line.startsWith('UBFC CHROM'))).toBe(true)
    expect(report.rq1.plotLabel).toBe('UBFC POS')
    expect(report.rq2.lines.some((line) => line.includes('trust weight'))).toBe(true)
    expect(report.rq2.pairs).toHaveLength(2)
    expect(report.rq2.pairs.some((pair) => pair.left !== pair.right)).toBe(true)
    expect(report.rq3.verdict).toBe('no')
    expect(report.rq3.sentence).toMatch(/matches the plain rate/)
    expect(report.rq3.pairs.length).toBeGreaterThan(0)
    expect(report.rq3.leftLabel).toBe('Plain')
    expect(report.rq3.rightLabel).toBe('Motion-aware')
    expect(report.rq3.pairs.every((pair) => pair.left === pair.right)).toBe(true)
    expect(report.rq4.verdict).toBe('partial')
    expect(report.rq4.lines.some((line) => line.startsWith('POS ·'))).toBe(true)
    expect(report.rq4.lines.some((line) => line.includes('PURE'))).toBe(true)
    expect(report.rq4.lines.some((line) => line.includes('UBFC'))).toBe(true)
  })

  it('scores calm windows against every window on hard videos', () => {
    const report = researchReport([
      run('UBFC', 'POS', [
        row({ cameraBpm: 70, referenceBpm: 90, conflict: 0.8, risk: 'high', cleanedBpm: 88, plainBpm: 70 }),
        row({ cameraBpm: 60, referenceBpm: 90, conflict: 0.7, risk: 'elevated', cleanedBpm: 86, plainBpm: 60 }),
      ]),
    ])
    expect(report.rq3.verdict).toBe('yes')
    expect(report.rq3.lines[0]).toMatch(/calm windows/)
    expect(report.rq3.hardCount).toBe(2)
    expect(report.rq3.leftLabel).toBe('Every window')
    expect(report.rq3.rightLabel).toBe('Calm windows')
    expect(report.rq3.pairs[0]!.right).toBeLessThan(report.rq3.pairs[0]!.left)
  })

  it('adds a PhysNet miss beside the cameras', () => {
    const report = researchReport(
      [
        run('PURE', 'POS', [], 39, 8.6),
        run('UBFC', 'POS', [], 42, 22.1),
      ],
      [{ trainedOn: 'UBFC', testedOn: 'PURE', mae: 19.4, count: 8, kind: 'other camera' }],
    )
    expect(report.rq4.lines.some((line) => line.includes('PhysNet trained on UBFC'))).toBe(true)
    expect(report.rq4.sets.map((set) => set.name)).toEqual(['POS · PURE', 'POS · UBFC'])
  })

  it('waits when nothing has been saved', () => {
    const report = researchReport([])
    expect(report.rq1.verdict).toBe('wait')
    expect(report.rq4.verdict).toBe('wait')
  })

  it('reads the method from a saved test name', () => {
    expect(runIdentity('UBFC · POS')).toEqual({ dataset: 'UBFC', method: 'POS' })
    expect(runIdentity('UBFC')).toEqual({ dataset: 'UBFC', method: 'CHROM' })
  })
})
