export type AnalysisStage =
  | 'idle'
  | 'optimizing'
  | 'finding_face'
  | 'estimating_pulse'
  | 'done'

const COPY: Record<Exclude<AnalysisStage, 'idle' | 'done'>, string> = {
  optimizing: 'Preparing the video',
  finding_face: 'Finding the face',
  estimating_pulse: 'Reading the pulse',
}

type Props = {
  stage: AnalysisStage
  detail?: string
  /** 0–1 fill of the track. */
  fraction?: number | null
}

/** One quiet line while a clip is being read. */
export function AnalysisProgress({ stage, detail, fraction }: Props) {
  if (stage === 'idle' || stage === 'done') return null
  const label = COPY[stage]
  const pct =
    fraction != null && Number.isFinite(fraction)
      ? Math.round(Math.min(1, Math.max(0, fraction)) * 100)
      : null

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="analysis-progress-top">
        <p className="analysis-progress-label">{label}</p>
        <p className="analysis-progress-pct">{pct != null ? `${pct}%` : ''}</p>
      </div>
      <div className="analysis-track" aria-hidden>
        <span style={{ width: `${pct ?? 12}%` }} />
      </div>
      {detail ? <p className="analysis-detail">{detail}</p> : null}
    </div>
  )
}
