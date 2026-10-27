import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'
import { SignalChart } from './SignalChart'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  scrub: number
  liveEstimating?: boolean
}

/** Desktop: stacked pulse, breath, and waveform cards beside the face. */
export function DesktopPulseRail({
  result,
  respiratory,
  scrub,
  liveEstimating = false,
}: Props) {
  const remark = result
    ? reliabilityFromConflict(result.conflict.combined)
    : null
  const motion = result ? conflictRiskLabel(result.conflict.combined) : null
  const pulseWave =
    result && result.suppression.gated.length > 8
      ? result.suppression.gated
      : result?.candidate
  const breathNote = respiratory
    ? remark?.badge ?? 'Estimate'
    : 'Not clear in this clip'

  return (
    <aside className="desktop-pulse-rail" aria-label="Pulse and breath">
      <section className="pulse-section">
        <article className="pulse-row pulse-row-heart">
          <span className="premium-icon" aria-hidden>
            ♥
          </span>
          <div className="pulse-row-copy">
            <p className="premium-kicker">Heart rate</p>
            <p className={`premium-value ${liveEstimating ? 'is-live' : ''}`}>
              {result ? result.gatedBpm.toFixed(0) : '—'}
              <span>bpm</span>
            </p>
          </div>
          <p className="premium-status">{remark ? remark.badge : 'Pending'}</p>
        </article>

        <article className="pulse-row pulse-row-breath">
          <span className="premium-icon premium-icon-breath" aria-hidden>
            ≈
          </span>
          <div className="pulse-row-copy">
            <p className="premium-kicker">Respiratory rate</p>
            <p className="premium-value">
              {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
              <span>/min</span>
            </p>
          </div>
          <p className="premium-note">{breathNote}</p>
        </article>

        <article className="pulse-row pulse-row-graph">
          <header className="pulse-graph-head">
            <p className="premium-kicker">Pulse graph</p>
            <p className="premium-note">{motion ? motion.label : 'Motion overlap'}</p>
          </header>
          {pulseWave && pulseWave.length > 8 ? (
            <SignalChart
              height={72}
              cursorFraction={scrub}
              series={[{ values: pulseWave, color: '#6b4de0' }]}
            />
          ) : (
            <p className="premium-empty">Waiting for a face</p>
          )}
        </article>
      </section>
    </aside>
  )
}
