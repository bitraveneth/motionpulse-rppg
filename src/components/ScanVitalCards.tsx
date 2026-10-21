import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  liveEstimating?: boolean
}

/** Compact equal vital cards along the bottom of the scan session frame. */
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
      <article className="scan-vital-card" role="listitem">
        <span className="scan-vital-label">Heart rate</span>
        <div className="scan-vital-metric">
          <span
            className={`scan-vital-value tabular-nums ${liveEstimating ? 'is-live' : ''}`}
          >
            {result ? result.gatedBpm.toFixed(0) : '—'}
          </span>
          <span className="scan-vital-unit">BPM</span>
        </div>
        <p className="scan-vital-note">
          {result
            ? liveEstimating
              ? `Rolling · ${result.windowSamples} frames`
              : `Settled · raw ${result.estimatedBpm.toFixed(0)}`
            : ' '}
        </p>
      </article>

      <article className="scan-vital-card" role="listitem">
        <span className="scan-vital-label">Respiratory rate</span>
        <div className="scan-vital-metric">
          <span className="scan-vital-value tabular-nums">
            {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
          </span>
          <span className="scan-vital-unit">/min</span>
        </div>
        <p className="scan-vital-note">Experimental — not clinical</p>
      </article>

      <article className="scan-vital-card" role="listitem">
        <span className="scan-vital-label">Signal</span>
        <div className="scan-vital-metric">
          {result && remark ? (
            <span className="scan-vital-value scan-vital-value-word">
              {remark.badge}
            </span>
          ) : (
            <>
              <span className="scan-vital-value tabular-nums">—</span>
              <span className="scan-vital-unit" aria-hidden> </span>
            </>
          )}
        </div>
        <p className="scan-vital-note">
          {result && remark && risk
            ? `${risk.label} · ${result.conflict.combined.toFixed(2)} overlap`
            : 'Trust appears after enough frames'}
        </p>
      </article>
    </div>
  )
}
