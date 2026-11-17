import { pearson } from './comparison'

export type ResearchRow = {
  cameraBpm: number
  plainBpm: number | null
  weightedBpm: number | null
  referenceBpm: number | null
  conflict: number
  risk: string
  /** Heart rate averaged from windows below the elevated conflict band. */
  cleanedBpm?: number | null
}

export type DatasetScore = {
  name: string
  mae: number | null
  count: number
}

/** One saved method on one dataset. Rows are empty when only the summary miss is known. */
export type MethodRun = {
  dataset: string
  method: string
  rows: ResearchRow[]
  mae?: number | null
  count?: number
}

/** A PhysNet miss in BPM, on people held out of training or on another dataset. */
export type TrainedMiss = {
  trainedOn: string
  testedOn: string
  mae: number
  count: number
  kind: 'held out' | 'other camera'
}

export type ResearchVerdict = 'yes' | 'no' | 'partial' | 'wait'

/** Two misses, in BPM, for one run. Left is the baseline and right is the method under test. */
export type ComparePair = {
  name: string
  left: number
  right: number
  detail: string
}

export type ResearchReport = {
  rq1: {
    verdict: ResearchVerdict
    sentence: string
    lines: string[]
    r: number | null
    plotLabel: string
    points: { conflict: number; error: number }[]
  }
  rq2: {
    verdict: ResearchVerdict
    sentence: string
    lines: string[]
    equalMae: number | null
    weightedMae: number | null
    pairs: ComparePair[]
  }
  rq3: {
    verdict: ResearchVerdict
    sentence: string
    lines: string[]
    plainMae: number | null
    awareMae: number | null
    hardCount: number
    pairs: ComparePair[]
    leftLabel: string
    rightLabel: string
  }
  rq4: { verdict: ResearchVerdict; sentence: string; lines: string[]; sets: DatasetScore[] }
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function mae(estimates: number[], references: number[]): number | null {
  const gaps: number[] = []
  for (let i = 0; i < estimates.length; i++) {
    const estimate = estimates[i]
    const reference = references[i]
    if (!finite(estimate) || !finite(reference)) continue
    gaps.push(Math.abs(estimate - reference))
  }
  return mean(gaps)
}

function bpm(value: number | null): string {
  return value == null ? '—' : value.toFixed(1)
}

function rtext(value: number | null): string {
  return value == null ? '—' : value.toFixed(2)
}

function hardMotion(risk: string): boolean {
  return risk === 'elevated' || risk === 'high'
}

function labeled(rows: ResearchRow[]): ResearchRow[] {
  return rows.filter((row) => finite(row.referenceBpm) && finite(row.cameraBpm))
}

/** "UBFC · POS" is the dataset and the method. A bare name is treated as CHROM. */
export function runIdentity(name: string): { dataset: string; method: string } {
  const parts = name
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2 && (parts[1] === 'POS' || parts[1] === 'CHROM')) {
    return { dataset: parts[0]!, method: parts[1]! }
  }
  return { dataset: parts[0] || 'Dataset', method: 'CHROM' }
}

function runKey(run: MethodRun): string {
  return `${run.dataset} ${run.method}`
}

function runCount(run: MethodRun): number {
  const fromRows = labeled(run.rows).length
  if (fromRows > 0) return fromRows
  return run.count ?? 0
}

function hasCleaned(run: MethodRun): boolean {
  return labeled(run.rows).some((row) => finite(row.cleanedBpm))
}

/** The fullest run of each dataset and method. A same-size run that stored calm windows wins a tie. */
export function fullestRuns(runs: MethodRun[]): MethodRun[] {
  const best = new Map<string, MethodRun>()
  for (const run of runs) {
    const key = runKey(run)
    const current = best.get(key)
    if (!current) {
      best.set(key, run)
      continue
    }
    const nextCount = runCount(run)
    const currentCount = runCount(current)
    if (nextCount > currentCount || (nextCount === currentCount && hasCleaned(run) && !hasCleaned(current))) {
      best.set(key, run)
    }
  }
  return [...best.values()].sort((a, b) => {
    const bySet = a.dataset.localeCompare(b.dataset)
    if (bySet !== 0) return bySet
    return a.method.localeCompare(b.method)
  })
}

function title(run: MethodRun): string {
  return `${run.dataset} ${run.method}`
}

function conflictLink(rows: ResearchRow[]): { r: number | null; points: { conflict: number; error: number }[]; n: number } {
  const points = labeled(rows)
    .filter((row) => finite(row.conflict))
    .map((row) => ({ conflict: row.conflict, error: Math.abs(row.cameraBpm - row.referenceBpm!) }))
  const link =
    points.length < 2
      ? null
      : pearson(
          points.map((point) => point.conflict),
          points.map((point) => point.error),
        )
  return { r: link, points, n: points.length }
}

function gateIsFlat(rows: ResearchRow[]): boolean {
  const pairs = labeled(rows).filter((row) => finite(row.plainBpm))
  if (pairs.length === 0) return true
  const gap = mean(pairs.map((row) => Math.abs(row.cameraBpm - row.plainBpm!)))
  return gap != null && gap < 0.05
}

function plainAwareOnHard(runs: MethodRun[]): { name: string; hard: number; plain: number; aware: number }[] {
  return runs.flatMap((run) => {
    const hard = labeled(run.rows).filter((row) => hardMotion(row.risk) && finite(row.plainBpm))
    if (hard.length === 0) return []
    const plain = mae(
      hard.map((row) => row.plainBpm!),
      hard.map((row) => row.referenceBpm!),
    )
    const aware = mae(
      hard.map((row) => row.cameraBpm),
      hard.map((row) => row.referenceBpm!),
    )
    if (plain == null || aware == null) return []
    return [{ name: title(run), hard: hard.length, plain, aware }]
  })
}

function runMae(run: MethodRun): { mae: number | null; count: number } {
  const rows = labeled(run.rows)
  if (rows.length > 0) {
    return {
      mae: mae(
        rows.map((row) => row.cameraBpm),
        rows.map((row) => row.referenceBpm!),
      ),
      count: rows.length,
    }
  }
  return { mae: finite(run.mae) ? run.mae : null, count: run.count ?? 0 }
}

export function researchReport(runs: MethodRun[], trained: TrainedMiss[] = []): ResearchReport {
  const chosen = fullestRuns(runs)
  const withRows = chosen.filter((run) => labeled(run.rows).length > 0)
  const links = withRows
    .map((run) => ({ run, ...conflictLink(run.rows) }))
    .filter((item) => item.n >= 2 && item.r != null)
  const plotted = links.reduce<(typeof links)[number] | null>((best, item) => {
    if (!best || item.n > best.n) return item
    if (item.n === best.n && item.run.method === 'POS' && best.run.method !== 'POS') return item
    return best
  }, null)

  let rq1Verdict: ResearchVerdict
  let rq1Sentence: string
  if (links.length === 0) {
    rq1Verdict = 'wait'
    rq1Sentence = withRows.length === 0
      ? 'No labeled video yet. Conflict can be lined up with the miss after a full run.'
      : 'Conflict does not vary across the labeled videos, so it cannot be lined up with the miss.'
  } else if (links.every((item) => item.r! >= 0.3)) {
    rq1Verdict = 'yes'
    rq1Sentence = 'Yes. On every full run, higher conflict lines up with a larger miss.'
  } else if (links.every((item) => item.r! <= 0)) {
    rq1Verdict = 'no'
    rq1Sentence = 'No. On these full runs, higher conflict does not line up with a larger miss.'
  } else {
    rq1Verdict = 'partial'
    rq1Sentence = 'Only weakly, and not on every method. Each line is the fullest saved run.'
  }
  const rq1Lines = links.map(
    (item) => `${title(item.run)} · r = ${rtext(item.r)} on ${item.n} videos`,
  )

  const regionLines: string[] = []
  const regionPairs: ComparePair[] = []
  let regionWins = 0
  let regionLosses = 0
  let primaryEqual: number | null = null
  let primaryWeighted: number | null = null
  for (const run of withRows) {
    const rows = labeled(run.rows)
    const equalMae = mae(
      rows.map((row) => row.cameraBpm),
      rows.map((row) => row.referenceBpm!),
    )
    const weightedRows = rows.filter((row) => finite(row.weightedBpm))
    const weightedMae = mae(
      weightedRows.map((row) => row.weightedBpm!),
      weightedRows.map((row) => row.referenceBpm!),
    )
    if (primaryEqual == null) {
      primaryEqual = equalMae
      primaryWeighted = weightedMae
    }
    if (equalMae == null || weightedMae == null) continue
    regionLines.push(`${title(run)} · equal mix ${bpm(equalMae)} BPM, trust weight ${bpm(weightedMae)} BPM`)
    regionPairs.push({
      name: title(run),
      left: equalMae,
      right: weightedMae,
      detail: `${rows.length} videos`,
    })
    if (weightedMae + 0.5 < equalMae) regionWins += 1
    else if (equalMae + 0.5 < weightedMae) regionLosses += 1
  }
  let rq2Verdict: ResearchVerdict
  let rq2Sentence: string
  if (regionLines.length === 0) {
    rq2Verdict = 'wait'
    rq2Sentence = withRows.length === 0
      ? 'No labeled video yet, so region weighting has nothing to beat.'
      : 'A trust-weighted heart rate was not stored for these runs.'
  } else if (regionWins === regionLines.length) {
    rq2Verdict = 'yes'
    rq2Sentence = 'Yes. Trust-weighted regions are closer than an equal mix on every full run.'
  } else if (regionLosses === regionLines.length) {
    rq2Verdict = 'no'
    rq2Sentence = 'No. The equal mix is closer than trust weighting on every full run.'
  } else {
    rq2Verdict = 'partial'
    rq2Sentence = 'It depends on the dataset and the method. Trust weighting wins some runs and loses others.'
  }

  const cleanLines: string[] = []
  const rq3Pairs: ComparePair[] = []
  let rq3Left = 'Plain'
  let rq3Right = 'Motion-aware'
  let cleanWins = 0
  let cleanLosses = 0
  let primaryPlain: number | null = null
  let primaryAware: number | null = null
  let hardCount = 0
  for (const run of withRows) {
    const hard = labeled(run.rows).filter((row) => hardMotion(row.risk) && finite(row.cleanedBpm))
    if (hard.length === 0) continue
    const allMae = mae(
      hard.map((row) => row.cameraBpm),
      hard.map((row) => row.referenceBpm!),
    )
    const cleanedMae = mae(
      hard.map((row) => row.cleanedBpm!),
      hard.map((row) => row.referenceBpm!),
    )
    if (allMae == null || cleanedMae == null) continue
    if (primaryPlain == null) {
      primaryPlain = allMae
      primaryAware = cleanedMae
    }
    hardCount += hard.length
    rq3Left = 'Every window'
    rq3Right = 'Calm windows'
    cleanLines.push(
      `${title(run)} · on ${hard.length} hard videos, every window ${bpm(allMae)} BPM, calm windows ${bpm(cleanedMae)} BPM`,
    )
    rq3Pairs.push({
      name: title(run),
      left: allMae,
      right: cleanedMae,
      detail: `${hard.length} hard videos`,
    })
    if (cleanedMae + 0.5 < allMae) cleanWins += 1
    else if (allMae + 0.5 < cleanedMae) cleanLosses += 1
  }
  let rq3Verdict: ResearchVerdict
  let rq3Sentence: string
  if (cleanLines.length > 0) {
    if (cleanWins === cleanLines.length) {
      rq3Verdict = 'yes'
      rq3Sentence = 'Yes. Leaving out high-conflict windows is closer on the hard videos.'
    } else if (cleanLosses === cleanLines.length) {
      rq3Verdict = 'no'
      rq3Sentence = 'No. On the hard videos, averaging every window is closer than keeping only the calm ones.'
    } else {
      rq3Verdict = 'partial'
      rq3Sentence = 'Leaving out high-conflict windows helps on some runs and not on others.'
    }
  } else if (withRows.length > 0 && withRows.every((run) => gateIsFlat(run.rows))) {
    rq3Verdict = 'no'
    rq3Sentence =
      'No. On the hard videos the motion-aware rate matches the plain rate. The conflict gate does not move the heart rate.'
    const hard = withRows.reduce(
      (sum, run) => sum + labeled(run.rows).filter((row) => hardMotion(row.risk)).length,
      0,
    )
    hardCount = hard
    const comparable = plainAwareOnHard(withRows)
    primaryPlain = comparable[0]?.plain ?? null
    primaryAware = comparable[0]?.aware ?? null
    for (const item of comparable) {
      rq3Pairs.push({
        name: item.name,
        left: item.plain,
        right: item.aware,
        detail: `${item.hard} hard videos`,
      })
      cleanLines.push(
        `${item.name} · plain ${bpm(item.plain)} BPM, motion-aware ${bpm(item.aware)} BPM on ${item.hard} hard videos`,
      )
    }
  } else if (withRows.length === 0) {
    rq3Verdict = 'wait'
    rq3Sentence = 'No labeled video yet.'
  } else {
    const comparable = plainAwareOnHard(withRows)
    hardCount = comparable.reduce((sum, item) => sum + item.hard, 0)
    if (comparable.length === 0) {
      rq3Verdict = 'wait'
      rq3Sentence = 'No video in these runs was in the high-motion band.'
    } else if (comparable.every((item) => item.aware + 0.5 < item.plain)) {
      rq3Verdict = 'yes'
      rq3Sentence = 'Yes. On the hard videos the motion-aware rate is closer than the plain rate.'
    } else if (comparable.every((item) => item.plain + 0.5 < item.aware)) {
      rq3Verdict = 'no'
      rq3Sentence = 'No. On the hard videos the plain rate is closer than the motion-aware rate.'
    } else {
      rq3Verdict = 'partial'
      rq3Sentence = 'On the hard videos the plain rate and the motion-aware rate are about the same.'
    }
    primaryPlain = comparable[0]?.plain ?? null
    primaryAware = comparable[0]?.aware ?? null
    for (const item of comparable) {
      rq3Pairs.push({
        name: item.name,
        left: item.plain,
        right: item.aware,
        detail: `${item.hard} hard videos`,
      })
      cleanLines.push(
        `${item.name} · plain ${bpm(item.plain)} BPM, motion-aware ${bpm(item.aware)} BPM on ${item.hard} hard videos`,
      )
    }
  }

  const scoreByKey = new Map<string, { dataset: string; method: string; mae: number; count: number }>()
  for (const run of chosen) {
    const score = runMae(run)
    if (score.mae == null || score.count <= 0) continue
    scoreByKey.set(runKey(run), { dataset: run.dataset, method: run.method, mae: score.mae, count: score.count })
  }
  const methods = [...new Set([...scoreByKey.values()].map((score) => score.method))].sort()
  const rq4Lines: string[] = []
  const rq4Sets: DatasetScore[] = []
  const spread: number[] = []
  for (const method of methods) {
    const sets = [...scoreByKey.values()]
      .filter((score) => score.method === method)
      .sort((a, b) => a.dataset.localeCompare(b.dataset))
    if (sets.length === 0) continue
    rq4Lines.push(
      `${method} · ${sets.map((set) => `${set.dataset} ${bpm(set.mae)} BPM (${set.count})`).join(' · ')}`,
    )
    for (const set of sets) {
      rq4Sets.push({ name: `${method} · ${set.dataset}`, mae: set.mae, count: set.count })
      spread.push(set.mae)
    }
  }
  const trainedLines = trained
    .filter((miss) => finite(miss.mae) && miss.count > 0)
    .map((miss) =>
      miss.kind === 'held out'
        ? `PhysNet held out of ${miss.trainedOn} · ${bpm(miss.mae)} BPM (${miss.count})`
        : `PhysNet trained on ${miss.trainedOn}, tested on ${miss.testedOn} · ${bpm(miss.mae)} BPM (${miss.count})`,
    )
  let rq4Verdict: ResearchVerdict
  let rq4Sentence: string
  if (rq4Sets.length === 0 && trainedLines.length === 0) {
    rq4Verdict = 'wait'
    rq4Sentence = 'No saved dataset has a file heart rate yet.'
  } else if (spread.length === 0) {
    rq4Verdict = 'partial'
    rq4Sentence = 'PhysNet has a held-out miss. A classical run on two cameras is not in the saved tests yet.'
  } else if (new Set([...scoreByKey.values()].map((score) => score.dataset)).size < 2) {
    rq4Verdict = 'partial'
    const only = [...scoreByKey.values()][0]!
    rq4Sentence = `On ${only.dataset}, the miss is ${bpm(only.mae)} BPM across ${only.count} subjects. A second dataset is not in the saved tests yet.`
  } else if (spread.every((value) => value <= 10)) {
    rq4Verdict = 'yes'
    rq4Sentence = 'Yes. The same methods stay within 10 BPM on every saved camera.'
  } else if (spread.every((value) => value > 15)) {
    rq4Verdict = 'no'
    rq4Sentence = 'No. The miss stays above 15 BPM on every saved camera.'
  } else {
    rq4Verdict = 'partial'
    rq4Sentence = 'It is closer on one camera than the other. Each line is one method on the cameras that were saved.'
  }

  return {
    rq1: {
      verdict: rq1Verdict,
      sentence: rq1Sentence,
      lines: rq1Lines,
      r: plotted?.r ?? null,
      plotLabel: plotted ? title(plotted.run) : '',
      points: plotted?.points ?? [],
    },
    rq2: {
      verdict: rq2Verdict,
      sentence: rq2Sentence,
      lines: regionLines,
      equalMae: primaryEqual,
      weightedMae: primaryWeighted,
      pairs: regionPairs,
    },
    rq3: {
      verdict: rq3Verdict,
      sentence: rq3Sentence,
      lines: cleanLines,
      plainMae: primaryPlain,
      awareMae: primaryAware,
      hardCount,
      pairs: rq3Pairs,
      leftLabel: rq3Left,
      rightLabel: rq3Right,
    },
    rq4: {
      verdict: rq4Verdict,
      sentence: rq4Sentence,
      lines: [...rq4Lines, ...trainedLines],
      sets: rq4Sets,
    },
  }
}
