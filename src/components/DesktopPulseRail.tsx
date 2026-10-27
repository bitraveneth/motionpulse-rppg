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
      <article className="premium-card">
        <header className="premium-card-head">
          <span className="premium-icon" aria-hidden>
            ♥
          </span>
          <div>
            <p className="premium-kicker">Heart rate</p>
            <p className={`premium-value ${liveEstimating ? 'is-live' : ''}`}>
              {result ? result.gatedBpm.toFixed(0) : '—'}
              <span>bpm</span>
            </p>
          </div>
        </header>
        <div className="premium-spark">
          {pulseWave && pulseWave.length > 8 ? (
            <SignalChart
              height={56}
              cursorFraction={scrub}
              series={[{ values: pulseWave, color: '#0f9f8f', label: 'Pulse' }]}
            />
          ) : (
            <p className="premium-empty">Waiting for a face</p>
          )}
        </div>
        <p className="premium-status">{remark ? remark.badge : 'Signal pending'}</p>
      </article>

      <article className="premium-card">
        <header className="premium-card-head">
          <span className="premium-icon premium-icon-breath" aria-hidden>
            ≈
          </span>
          <div>
            <p className="premium-kicker">Respiratory rate</p>
            <p className="premium-value">
              {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
              <span>/min</span>
            </p>
          </div>
        </header>
        <p className="premium-note">{breathNote}</p>
      </article>

      <article className="premium-card">
        <header className="premium-card-head">
          <span className="premium-icon premium-icon-wave" aria-hidden>
            ～
          </span>
          <div>
            <p className="premium-kicker">Pulse graph</p>
            <p className="premium-status premium-status-inline">
              {motion ? motion.label : 'Motion overlap'}
            </p>
          </div>
        </header>
        <div className="premium-spark premium-spark-tall">
          {pulseWave && pulseWave.length > 8 ? (
            <SignalChart
              height={96}
              cursorFraction={scrub}
              series={[{ values: pulseWave, color: '#14968a', label: 'Pulse graph' }]}
            />
          ) : (
            <p className="premium-empty">The trace fills in as frames arrive.</p>
          )}
        </div>
      </article>
    </aside>
  )
}
