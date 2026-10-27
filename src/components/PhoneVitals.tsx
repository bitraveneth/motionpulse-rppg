import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  liveEstimating?: boolean
}

/** Four tiles this app can actually fill: pulse, breath, signal, motion. */
export function PhoneVitals({
  result,
  respiratory,
  liveEstimating = false,
}: Props) {
  const remark = result
    ? reliabilityFromConflict(result.conflict.combined)
    : null
  const motionPct = result
    ? Math.round(result.conflict.combined * 100)
    : null
  const motionLabel = result
    ? conflictRiskLabel(result.conflict.combined).label
    : null

  return (
    <div className="phone-vitals" role="list" aria-label="Scan readings">
      <article className="phone-vital" role="listitem">
        <span className="phone-vital-label">Pulse</span>
        <span className={`phone-vital-value ${liveEstimating ? 'is-live' : ''}`}>
          {result ? result.gatedBpm.toFixed(0) : '—'}
        </span>
        <span className="phone-vital-unit">bpm</span>
      </article>
      <article className="phone-vital" role="listitem">
        <span className="phone-vital-label">Breath</span>
        <span className="phone-vital-value">
          {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
        </span>
        <span className="phone-vital-unit">/min</span>
      </article>
      <article className="phone-vital" role="listitem">
        <span className="phone-vital-label">Signal</span>
        <span className="phone-vital-value phone-vital-value-word">
          {remark ? remark.badge : '—'}
        </span>
        <span className="phone-vital-unit">trust</span>
      </article>
      <article className="phone-vital" role="listitem">
        <span className="phone-vital-label">Motion</span>
        <span className="phone-vital-value">
          {motionPct != null ? motionPct : '—'}
        </span>
        <span className="phone-vital-unit">
          {motionLabel ? `${motionLabel.toLowerCase()} overlap` : 'overlap'}
        </span>
      </article>
    </div>
  )
}
