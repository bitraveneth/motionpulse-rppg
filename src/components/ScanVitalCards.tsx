import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'
import { ReliabilityBadge } from './ReliabilityBadge'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  liveEstimating?: boolean
}

/** Three vital cards for scan session row beside the monitor. */
export function ScanVitalCards({
  result,
  respiratory,
  liveEstimating = false,
}: Props) {
  const remark = result
    ? reliabilityFromConflict(result.conflict.combined)
    : null
  const risk = result ? conflictRiskLabel(result.conflict.combined) : null

  return (
    <div className="scan-vitals-strip" role="list" aria-label="Session vitals">
      <article
        className="vitals-scan-card vitals-scan-card-primary"
        role="listitem"
      >
        <span className="vitals-label">Heart rate</span>
        <span
          className={`vitals-scan-value ${liveEstimating ? 'is-live' : ''}`}
        >
          {result ? result.gatedBpm.toFixed(0) : '—'}
        </span>
        <span className="vitals-unit">BPM</span>
        {result ? (
          <span className="vitals-note">
            {liveEstimating
              ? `Rolling · ${result.windowSamples} frames`
              : `Settled · raw ${result.estimatedBpm.toFixed(0)}`}
          </span>
        ) : null}
      </article>

      <article
        className="vitals-scan-card vitals-scan-card-breath"
        role="listitem"
      >
        <span className="vitals-label">Respiratory rate</span>
        <span className="vitals-scan-value">
          {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
        </span>
        <span className="vitals-unit">breaths/min</span>
        <span className="vitals-note">
          {respiratory
            ? respiratory.snr < 1.8
              ? 'Rough estimate — not clinical'
              : 'Experimental — not clinical'
            : 'Not enough of a breath cycle in this clip'}
        </span>
      </article>

      <article className="vitals-scan-card vitals-scan-card-signal" role="listitem">
        <span className="vitals-label">Signal</span>
        {result && remark ? (
          <>
            <ReliabilityBadge remark={remark} className="vitals-scan-badge" />
            <span className="vitals-note">
              {risk?.label} · {result.conflict.combined.toFixed(2)} overlap
            </span>
          </>
        ) : (
          <>
            <span className="vitals-scan-value vitals-scan-value-sm">—</span>
            <span className="vitals-note">Trust appears after enough frames</span>
          </>
        )}
      </article>
    </div>
  )
}
