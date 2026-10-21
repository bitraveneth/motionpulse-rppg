import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'
import { ROI_IDS } from '../lib/rppg/types'
import { PulseSparkline } from './PulseSparkline'
import { ReliabilityBadge } from './ReliabilityBadge'
import { SignalChart } from './SignalChart'
import { TrustDots } from './TrustDots'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  sparkline: string | null
  /** 0–1 scrub → highlight on heart chart */
  scrub: number
  /** When browsing a queued/analyzing clip with no result yet */
  emptyHint?: string
  /** True while frames are still accumulating — show live estimates */
  liveEstimating?: boolean
}

/** Vital signs + heart-beat chart — honest about what rPPG can and cannot do. */
export function VitalsPanel({
  result,
  respiratory,
  sparkline,
  scrub,
  emptyHint,
  liveEstimating = false,
}: Props) {
  if (!result) {
    return (
      <section className="vitals-panel vitals-empty" aria-label="Vital signs">
        <header>
          <h2>Vital signs</h2>
          <p>
            {emptyHint ??
              'Run a clip to see heart rate and signal quality.'}
          </p>
        </header>
        <div className="vitals-placeholder">
          <div>
            <span className="vitals-label">Heart rate</span>
            <span className="vitals-value">—</span>
            <span className="vitals-unit">BPM</span>
          </div>
          <div>
            <span className="vitals-label">Breathing</span>
            <span className="vitals-value">—</span>
            <span className="vitals-unit">/min</span>
          </div>
          <div>
            <span className="vitals-label">Blood pressure</span>
            <span className="vitals-value vitals-value-sm">N/A</span>
          </div>
        </div>
        <p className="vitals-edu">
          Pulse comes from tiny skin-color changes in the face video. Blood
          pressure is not estimated here.
        </p>
      </section>
    )
  }

  const risk = conflictRiskLabel(result.conflict.combined)
  const remark = reliabilityFromConflict(result.conflict.combined)
  const weights = Object.fromEntries(
    ROI_IDS.map((id) => [id, result.reliability.weights[id] ?? 0]),
  )
  const wave =
    result.suppression.gated.length > 8
      ? result.suppression.gated
      : result.candidate

  return (
    <section
      className={`vitals-panel ${liveEstimating ? 'vitals-live' : ''}`}
      aria-label="Vital signs"
      aria-busy={liveEstimating}
    >
      <div className="vitals-grid">
        <div className="vitals-chart-col">
          <header className="vitals-chart-head">
            <h2>Heart beat chart</h2>
            {liveEstimating ? (
              <span className="vitals-live-pill">Updating…</span>
            ) : (
              <ReliabilityBadge remark={remark} showHeadline />
            )}
          </header>
          <div className="chart-frame vitals-chart">
            <SignalChart
              height={140}
              cursorFraction={scrub}
              series={[
                {
                  values: wave,
                  color: '#E07A5F',
                  label: 'Pulse waveform',
                },
              ]}
            />
          </div>
          <PulseSparkline
            sparkline={sparkline}
            className="vitals-spark"
            label="Compact pulse"
          />
          <div className="vitals-trust-block">
            <h3 className="vitals-trust-title">Region trust</h3>
            <TrustDots
              weights={weights}
              variant="pct"
              className="vitals-trust"
            />
          </div>
        </div>

        <div className="vitals-readout">
          <header>
            <h2>Vital signs</h2>
            {liveEstimating ? (
              <p className="risk-chip risk-live">Live estimate · rolling window</p>
            ) : (
              <p className={`risk-chip risk-${risk.level}`}>
                {risk.label} · {result.conflict.combined.toFixed(2)}
              </p>
            )}
          </header>

          <div className="vitals-metrics">
            <div className="vital-metric vital-metric-primary">
              <span className="vitals-label">Heart rate</span>
              <span
                className={`vitals-value ${liveEstimating ? 'is-live' : ''}`}
                data-animate="bpm"
              >
                {result.gatedBpm.toFixed(0)}
              </span>
              <span className="vitals-unit">BPM</span>
              <span className="vitals-note">
                {liveEstimating
                  ? `Rolling · ${result.windowSamples} samples`
                  : `Settled · raw ${result.estimatedBpm.toFixed(0)}`}
              </span>
              <span className="result-pulse-ring" aria-hidden />
            </div>

            <div className="vital-metric">
              <span className="vitals-label">Respiratory rate</span>
              {respiratory ? (
                <>
                  <span className="vitals-value">
                    {respiratory.breathsPerMin.toFixed(0)}
                  </span>
                  <span className="vitals-unit">/min</span>
                  <span className="vitals-note">
                    Experimental — not clinical
                  </span>
                </>
              ) : (
                <>
                  <span className="vitals-value">—</span>
                  <span className="vitals-unit">/min</span>
                  <span className="vitals-note">
                    Experimental / needs a longer, calmer clip
                  </span>
                </>
              )}
            </div>

            <div className="vital-metric vital-metric-bp">
              <span className="vitals-label">Blood pressure</span>
              <span className="vitals-value vitals-value-sm">Not available</span>
              <span className="vitals-note">
                Not estimated from rPPG alone
              </span>
            </div>
          </div>

          {!liveEstimating && (
            <p className="vitals-motion-note" role="status">
              {remark.headline}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
