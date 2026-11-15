/** Heart-rate agreement metrics. Pure functions, no network. */

export type ComparisonPair = {
  estimate: number
  reference: number
}

export type AgreementPoint = {
  average: number
  difference: number
}

export type ComparisonSummary = {
  n: number
  mae: number | null
  rmse: number | null
  pearson: number | null
  bias: number | null
  sd: number | null
  loaLow: number | null
  loaHigh: number | null
  points: AgreementPoint[]
  snrCount: number
  snrMean: number | null
  /** 10 log10 of the mean power ratio, when that ratio is positive. */
  snrDb: number | null
}

function finite(value: number): boolean {
  return Number.isFinite(value)
}

export function meanOf(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Sample standard deviation (n − 1). One value has no spread. */
export function sampleSd(values: number[]): number | null {
  if (values.length < 2) return null
  const center = meanOf(values)
  if (center == null) return null
  const sum = values.reduce((total, value) => total + (value - center) ** 2, 0)
  return Math.sqrt(sum / (values.length - 1))
}

/**
 * Pearson r. Null when fewer than two pairs, or when either series does not vary.
 * A perfect line is 1 or −1. A high r can still hide a steady offset.
 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const ax = xs.slice(0, n)
  const ay = ys.slice(0, n)
  const mx = meanOf(ax)!
  const my = meanOf(ay)!
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const xa = ax[i]! - mx
    const ya = ay[i]! - my
    num += xa * ya
    dx += xa * xa
    dy += ya * ya
  }
  const den = Math.sqrt(dx * dy)
  if (den < 1e-12) return null
  return num / den
}

export type ClipAgreement = {
  mae: number | null
  rmse: number | null
  pearson: number | null
  bias: number | null
  snr: number | null
  snrDb: number | null
}

/** One clip. RMSE equals the absolute gap. Correlation needs two clips. */
export function clipAgreement(
  estimate: number | null,
  reference: number | null,
  snr: number | null,
): ClipAgreement {
  const paired =
    estimate != null &&
    reference != null &&
    finite(estimate) &&
    finite(reference)
  const gap = paired ? Math.abs(estimate - reference) : null
  const ratio = snr != null && finite(snr) && snr >= 0 ? snr : null
  return {
    mae: gap,
    rmse: gap,
    pearson: null,
    bias: paired ? estimate - reference : null,
    snr: ratio,
    snrDb: ratio != null && ratio > 0 ? 10 * Math.log10(ratio) : null,
  }
}

export function comparisonSummary(
  pairs: ComparisonPair[],
  snrValues: number[] = [],
): ComparisonSummary {
  const usable = pairs.filter(
    (pair) => finite(pair.estimate) && finite(pair.reference),
  )
  const differences = usable.map((pair) => pair.estimate - pair.reference)
  const mae = meanOf(differences.map((diff) => Math.abs(diff)))
  const rmse =
    differences.length === 0
      ? null
      : Math.sqrt(
          differences.reduce((sum, diff) => sum + diff * diff, 0) / differences.length,
        )
  const bias = meanOf(differences)
  const sd = sampleSd(differences)
  const snrs = snrValues.filter((value) => finite(value) && value >= 0)
  const snrMean = meanOf(snrs)
  return {
    n: usable.length,
    mae,
    rmse,
    pearson: pearson(
      usable.map((pair) => pair.estimate),
      usable.map((pair) => pair.reference),
    ),
    bias,
    sd,
    loaLow: bias == null || sd == null ? null : bias - 1.96 * sd,
    loaHigh: bias == null || sd == null ? null : bias + 1.96 * sd,
    points: usable.map((pair) => ({
      average: (pair.estimate + pair.reference) / 2,
      difference: pair.estimate - pair.reference,
    })),
    snrCount: snrs.length,
    snrMean,
    snrDb: snrMean != null && snrMean > 0 ? 10 * Math.log10(snrMean) : null,
  }
}
