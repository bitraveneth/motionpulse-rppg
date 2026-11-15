import { pearson } from './comparison'

export type ResearchRow = {
  cameraBpm: number
  plainBpm: number | null
  weightedBpm: number | null
  referenceBpm: number | null
  conflict: number
  risk: string
}

export type DatasetScore = {
  name: string
  mae: number | null
  count: number
}

export type ResearchVerdict = 'yes' | 'no' | 'partial' | 'wait'

export type ResearchReport = {
  rq1: {
    verdict: ResearchVerdict
    sentence: string
    r: number | null
    points: { conflict: number; error: number }[]
  }
  rq2: { verdict: ResearchVerdict; sentence: string; equalMae: number | null; weightedMae: number | null }
  rq3: {
    verdict: ResearchVerdict
    sentence: string
    plainMae: number | null
    awareMae: number | null
    hardCount: number
  }
  rq4: { verdict: ResearchVerdict; sentence: string; sets: DatasetScore[] }
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

export function researchReport(rows: ResearchRow[], datasets: DatasetScore[]): ResearchReport {
  const labeled = rows.filter((row) => finite(row.referenceBpm) && finite(row.cameraBpm))
  const points = labeled
    .filter((row) => finite(row.conflict))
    .map((row) => ({ conflict: row.conflict, error: Math.abs(row.cameraBpm - row.referenceBpm!) }))
  const link =
    points.length < 2
      ? null
      : pearson(
          points.map((point) => point.conflict),
          points.map((point) => point.error),
        )
  let rq1Sentence: string
  let rq1Verdict: ResearchVerdict
  if (points.length < 2) {
    rq1Verdict = 'wait'
    rq1Sentence =
      points.length === 1
        ? `One labeled video. The miss is ${bpm(points[0]!.error)} BPM at conflict ${points[0]!.conflict.toFixed(2)}. A line needs two videos.`
        : 'No labeled video yet. Conflict can be lined up with the miss after Run.'
  } else if (link == null) {
    rq1Verdict = 'wait'
    rq1Sentence = `Conflict does not vary across ${points.length} videos, so it cannot be lined up with the miss.`
  } else if (link >= 0.3) {
    rq1Verdict = 'yes'
    rq1Sentence = `Yes. Higher conflict lines up with a larger miss (r = ${rtext(link)} on ${points.length} videos).`
  } else if (link <= 0) {
    rq1Verdict = 'no'
    rq1Sentence = `No. Higher conflict does not line up with a larger miss (r = ${rtext(link)} on ${points.length} videos).`
  } else {
    rq1Verdict = 'partial'
    rq1Sentence = `Only weakly. Conflict and the miss line up at r = ${rtext(link)} on ${points.length} videos.`
  }

  const equalMae = mae(
    labeled.map((row) => row.cameraBpm),
    labeled.map((row) => row.referenceBpm!),
  )
  const weightedRows = labeled.filter((row) => finite(row.weightedBpm))
  const weightedMae = mae(
    weightedRows.map((row) => row.weightedBpm!),
    weightedRows.map((row) => row.referenceBpm!),
  )
  let rq2Sentence: string
  let rq2Verdict: ResearchVerdict
  if (equalMae == null) {
    rq2Verdict = 'wait'
    rq2Sentence = 'No labeled video yet, so region weighting has nothing to beat.'
  } else if (weightedMae == null) {
    rq2Verdict = 'wait'
    rq2Sentence = `The equal mix misses by ${bpm(equalMae)} BPM. A trust-weighted heart rate was not stored for this test.`
  } else if (weightedMae + 0.5 < equalMae) {
    rq2Verdict = 'yes'
    rq2Sentence = `Yes. Trust-weighted regions miss by ${bpm(weightedMae)} BPM. The equal mix misses by ${bpm(equalMae)} BPM.`
  } else if (equalMae + 0.5 < weightedMae) {
    rq2Verdict = 'no'
    rq2Sentence = `No. The equal mix is closer, ${bpm(equalMae)} BPM, than trust weighting at ${bpm(weightedMae)} BPM.`
  } else {
    rq2Verdict = 'partial'
    rq2Sentence = `About the same. Equal mix ${bpm(equalMae)} BPM, trust weighting ${bpm(weightedMae)} BPM.`
  }

  const hard = labeled.filter((row) => hardMotion(row.risk) && finite(row.plainBpm))
  const plainMae = mae(
    hard.map((row) => row.plainBpm!),
    hard.map((row) => row.referenceBpm!),
  )
  const awareMae = mae(
    hard.map((row) => row.cameraBpm),
    hard.map((row) => row.referenceBpm!),
  )
  let rq3Sentence: string
  let rq3Verdict: ResearchVerdict
  if (labeled.length === 0) {
    rq3Verdict = 'wait'
    rq3Sentence = 'No labeled video yet.'
  } else if (hard.length === 0) {
    rq3Verdict = 'wait'
    rq3Sentence = 'No video in this test was in the high-motion band.'
  } else if (plainMae == null || awareMae == null) {
    rq3Verdict = 'wait'
    rq3Sentence = `${hard.length} high-motion videos have no plain heart rate stored beside the file.`
  } else if (awareMae + 0.5 < plainMae) {
    rq3Verdict = 'yes'
    rq3Sentence = `Yes. On ${hard.length} high-motion videos the motion-aware rate misses by ${bpm(awareMae)} BPM. The plain rate misses by ${bpm(plainMae)} BPM.`
  } else if (plainMae + 0.5 < awareMae) {
    rq3Verdict = 'no'
    rq3Sentence = `No. On ${hard.length} high-motion videos the plain rate is closer, ${bpm(plainMae)} BPM, than the motion-aware rate at ${bpm(awareMae)} BPM.`
  } else {
    rq3Verdict = 'partial'
    rq3Sentence = `About the same on ${hard.length} high-motion videos. Plain ${bpm(plainMae)} BPM, motion-aware ${bpm(awareMae)} BPM.`
  }

  const sets = datasets.filter((set) => set.count > 0)
  const named = sets.filter((set) => finite(set.mae))
  let rq4Sentence: string
  let rq4Verdict: ResearchVerdict
  if (named.length === 0) {
    rq4Verdict = 'wait'
    rq4Sentence = 'No saved dataset has a file heart rate yet.'
  } else if (named.length === 1) {
    rq4Verdict = 'partial'
    const only = named[0]!
    rq4Sentence = `On ${only.name}, the miss is ${bpm(only.mae)} BPM across ${only.count} subjects. A second dataset is not in the saved tests yet.`
  } else {
    rq4Verdict = 'yes'
    const bits = named.map((set) => `${set.name} ${bpm(set.mae)} BPM (${set.count} subjects)`)
    rq4Sentence = `Yes. Each saved dataset has a miss: ${bits.join('. ')}.`
  }

  return {
    rq1: { verdict: rq1Verdict, sentence: rq1Sentence, r: link, points },
    rq2: { verdict: rq2Verdict, sentence: rq2Sentence, equalMae, weightedMae },
    rq3: { verdict: rq3Verdict, sentence: rq3Sentence, plainMae, awareMae, hardCount: hard.length },
    rq4: { verdict: rq4Verdict, sentence: rq4Sentence, sets: named },
  }
}
