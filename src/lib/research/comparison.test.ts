import { describe, expect, it } from 'vitest'
import { clipAgreement, comparisonSummary } from './comparison'

describe('comparisonSummary', () => {
  it('stays empty until a reference heart rate exists', () => {
    const summary = comparisonSummary([])
    expect(summary.n).toBe(0)
    expect(summary.mae).toBeNull()
    expect(summary.rmse).toBeNull()
    expect(summary.pearson).toBeNull()
    expect(summary.bias).toBeNull()
    expect(summary.snrMean).toBeNull()
  })

  it('reports MAE, RMSE, bias, limits, and correlation', () => {
    const summary = comparisonSummary([
      { estimate: 73, reference: 70 },
      { estimate: 80, reference: 80 },
      { estimate: 96, reference: 90 },
    ])
    expect(summary.n).toBe(3)
    expect(summary.mae).toBeCloseTo(3)
    expect(summary.rmse).toBeCloseTo(Math.sqrt(15))
    expect(summary.bias).toBeCloseTo(3)
    expect(summary.sd).toBeCloseTo(3)
    expect(summary.loaLow).toBeCloseTo(3 - 1.96 * 3)
    expect(summary.loaHigh).toBeCloseTo(3 + 1.96 * 3)
    expect(summary.pearson).toBeGreaterThan(0.95)
    expect(summary.rmse).toBeGreaterThanOrEqual(summary.mae!)
  })

  it('withholds correlation and limits when only one pair exists', () => {
    const summary = comparisonSummary([{ estimate: 80, reference: 77 }])
    expect(summary.mae).toBeCloseTo(3)
    expect(summary.rmse).toBeCloseTo(3)
    expect(summary.bias).toBeCloseTo(3)
    expect(summary.pearson).toBeNull()
    expect(summary.sd).toBeNull()
    expect(summary.loaLow).toBeNull()
  })

  it('puts SNR on one clip and withholds the gap until a known BPM exists', () => {
    const open = clipAgreement(72, null, 11.35)
    expect(open.snr).toBeCloseTo(11.35)
    expect(open.snrDb).toBeCloseTo(10 * Math.log10(11.35))
    expect(open.mae).toBeNull()
    expect(open.rmse).toBeNull()
    expect(open.bias).toBeNull()
    expect(open.pearson).toBeNull()

    const labeled = clipAgreement(80, 77, 11.35)
    expect(labeled.mae).toBeCloseTo(3)
    expect(labeled.rmse).toBeCloseTo(3)
    expect(labeled.bias).toBeCloseTo(3)
    expect(labeled.pearson).toBeNull()
  })

  it('averages the pulse-band signal-to-noise ratio without a reference', () => {
    const summary = comparisonSummary([], [10, 100])
    expect(summary.n).toBe(0)
    expect(summary.snrCount).toBe(2)
    expect(summary.snrMean).toBeCloseTo(55)
    expect(summary.snrDb).toBeCloseTo(10 * Math.log10(55))
  })
})