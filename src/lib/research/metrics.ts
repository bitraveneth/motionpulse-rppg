/** Pure summaries for the four research questions. No network, no UI. */

export type ResearchLabel = {
  heartRate: number
  source: string
  datasetName: string | null
}

export type EvalClip = {
  settledBpm: number | null
  conflictScore: number | null
  risk: string | null
  regionWeights: number[]
  groundTruth: ResearchLabel | null
}

export const ROI_LABELS = ['Forehead', 'Left cheek', 'Right cheek', 'Lower face'] as const

export function absoluteError(
  estimate: number | null,
  truth: number | null,
): number | null {
  if (estimate == null || truth == null) return null
  if (!Number.isFinite(estimate) || !Number.isFinite(truth)) return null
  return Math.abs(estimate - truth)
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function labeledErrors(clips: EvalClip[]): number[] {
  return clips
    .map((clip) => absoluteError(clip.settledBpm, clip.groundTruth?.heartRate ?? null))
    .filter((error): error is number => error != null)
}

export type Rq1Summary = {
  labeledCount: number
  pairCount: number
  mae: number | null
  pairs: { conflict: number; error: number }[]
}

/** Conflict against absolute pulse error. Pairs exist only when both numbers were saved. */
export function rq1Summary(clips: EvalClip[]): Rq1Summary {
  const labeled = clips.filter((clip) => clip.groundTruth)
  const pairs = labeled.flatMap((clip) => {
    const error = absoluteError(clip.settledBpm, clip.groundTruth!.heartRate)
    if (error == null || clip.conflictScore == null) return []
    return [{ conflict: clip.conflictScore, error }]
  })
  return {
    labeledCount: labeled.length,
    pairCount: pairs.length,
    mae: mean(labeledErrors(clips)),
    pairs,
  }
}

export type RqMode = {
  id: 'uniform' | 'motion' | 'quality' | 'joint'
  title: string
  /** aggregate = a number from saved rows. placeholder = the mix was not recorded. */
  kind: 'waiting' | 'aggregate' | 'placeholder'
  detail: string
}

function formatMae(mae: number | null, count: number): string {
  if (mae == null || count === 0) return 'Waiting for a labeled heart rate.'
  return `Mean absolute error ${mae.toFixed(1)} BPM on ${count} labeled ${count === 1 ? 'clip' : 'clips'}.`
}

/** The saved BPM is the equal-weight mix. The other three mixes were not stored as their own BPM. */
export function rq2Modes(clips: EvalClip[]): RqMode[] {
  const errors = labeledErrors(clips)
  const weightRows = clips
    .map((clip) => clip.regionWeights)
    .filter((weights) => weights.length === 4)
  const average =
    weightRows.length === 0
      ? null
      : ROI_LABELS.map((_, index) => mean(weightRows.map((row) => row[index] ?? 0))!)
  const mix = average
    ? average
        .map((share, index) => `${ROI_LABELS[index]} ${Math.round(share * 100)}%`)
        .join(', ')
    : null

  return [
    {
      id: 'uniform',
      title: 'Uniform',
      kind: errors.length > 0 ? 'aggregate' : 'waiting',
      detail:
        errors.length > 0
          ? `Equal mix of the four patches. ${formatMae(mean(errors), errors.length)}`
          : 'Waiting for a labeled heart rate. The saved BPM already uses an equal mix of the four patches.',
    },
    {
      id: 'motion',
      title: 'Motion',
      kind: 'placeholder',
      detail: 'A motion-only BPM was not saved, so this mode has no error yet.',
    },
    {
      id: 'quality',
      title: 'Quality',
      kind: 'placeholder',
      detail: 'A signal-quality-only BPM was not saved, so this mode has no error yet.',
    },
    {
      id: 'joint',
      title: 'Joint',
      kind: mix ? 'aggregate' : 'waiting',
      detail: mix
        ? `Recorded trust mix averages ${mix}. Those shares were not used to compute the BPM, so there is no joint-mode error yet.`
        : 'Waiting for clips that stored a trust mix for the four patches.',
    },
  ]
}

export type Rq3Summary = {
  calmCount: number
  calmMae: number | null
  motionCount: number
  motionMae: number | null
  labeledCount: number
}

function isCalm(risk: string | null): boolean {
  return risk === 'low' || risk === 'moderate'
}

function isMotion(risk: string | null): boolean {
  return risk === 'elevated' || risk === 'high'
}

/** Still-versus-motion uses the saved risk band as a stand-in. A second method is not in the rows. */
export function rq3Summary(clips: EvalClip[]): Rq3Summary {
  const labeled = clips.filter((clip) => clip.groundTruth)
  const errorsFor = (pick: (risk: string | null) => boolean) =>
    labeled
      .filter((clip) => pick(clip.risk))
      .map((clip) => absoluteError(clip.settledBpm, clip.groundTruth!.heartRate))
      .filter((error): error is number => error != null)
  const calm = errorsFor(isCalm)
  const motion = errorsFor(isMotion)
  return {
    labeledCount: labeled.length,
    calmCount: calm.length,
    calmMae: mean(calm),
    motionCount: motion.length,
    motionMae: mean(motion),
  }
}

export type DatasetSummary = {
  name: string
  count: number
  mae: number | null
}

export type Rq4Summary = {
  datasets: DatasetSummary[]
  ready: boolean
}

/** Two different dataset names on labeled clips are the minimum for a cross-set summary. */
export function rq4Summary(clips: EvalClip[]): Rq4Summary {
  const byName = new Map<string, number[]>()
  for (const clip of clips) {
    const name = clip.groundTruth?.datasetName?.trim()
    const error = absoluteError(clip.settledBpm, clip.groundTruth?.heartRate ?? null)
    if (!name || error == null) continue
    const list = byName.get(name) ?? []
    list.push(error)
    byName.set(name, list)
  }
  const datasets = [...byName.entries()]
    .map(([name, errors]) => ({ name, count: errors.length, mae: mean(errors) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { datasets, ready: datasets.length >= 2 }
}
