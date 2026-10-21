export type AnalysisStage =
  | 'idle'
  | 'optimizing'
  | 'finding_face'
  | 'estimating_pulse'
  | 'done'

const STAGES: { id: AnalysisStage; label: string }[] = [
  { id: 'optimizing', label: 'Optimizing' },
  { id: 'finding_face', label: 'Finding face' },
  { id: 'estimating_pulse', label: 'Estimating pulse' },
]

type Props = {
  stage: AnalysisStage
  detail?: string
}

export function AnalysisProgress({ stage, detail }: Props) {
  if (stage === 'idle' || stage === 'done') return null

  const order = STAGES.map((s) => s.id)
  const activeIdx = order.indexOf(stage)

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <ol className="analysis-steps">
        {STAGES.map((s, i) => {
          const state =
            i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo'
          return (
            <li key={s.id} className={`analysis-step is-${state}`}>
              <span className="analysis-step-dot" aria-hidden />
              <span>{s.label}</span>
            </li>
          )
        })}
      </ol>
      {detail && <p className="analysis-detail">{detail}</p>}
    </div>
  )
}
