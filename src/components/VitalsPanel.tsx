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
}

/** Vital signs + heart-beat chart — honest about what rPPG can and cannot do. */
export function VitalsPanel({
  result,
  respiratory,
  sparkline,
  scrub,
}: Props) {
  if (!result) {
    return (
      <section className="vitals-panel vitals-empty" aria-label="Vital signs">
        <header>
          <h2>Vital signs</h2>
          <p>Run a clip to see heart rate and signal quality.</p>
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
          rPPG reads tiny skin-color changes from blood volume under the face —
          then estimates pulse. Blood pressure needs more than a face video.
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
    <section className="vitals-panel" aria-label="Vital signs">
      <div className="vitals-grid">
        <div className="vitals-chart-col">
          <header className="vitals-chart-head">
            <h2>Heart beat chart</h2>
            <ReliabilityBadge remark={remark} showHeadline />
          </header>
          <div className="chart-frame vitals-chart">
            <SignalChart
              height={140}
              cursorFraction={scrub}
              series={[
                {
                  values: wave,
                  color: '#C45C3E',
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
          <TrustDots weights={weights} variant="dots" className="vitals-trust" />
        </div>

        <div className="vitals-readout">
          <header>
            <h2>Vital signs</h2>
            <p className={`risk-chip risk-${risk.level}`}>
              {risk.label} · {result.conflict.combined.toFixed(2)}
            </p>
          </header>

          <div className="vitals-metrics">
            <div className="vital-metric vital-metric-primary">
              <span className="vitals-label">Heart rate</span>
              <span className="vitals-value" data-animate="bpm">
                {result.gatedBpm.toFixed(0)}
              </span>
              <span className="vitals-unit">BPM</span>
              <span className="vitals-note">
                From cleaned rPPG · raw {result.estimatedBpm.toFixed(0)}
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
                    Experimental — low-band residual, not clinical
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
                Not estimated from rPPG alone — research only, no fake BP
              </span>
            </div>
          </div>

          <p className="vitals-edu">
            <strong>What is rPPG?</strong> Remote photoplethysmography senses
            subtle color shifts in facial skin as blood volume pulses — face →
            skin ROI → pulse signal → heart rate. Educational demo, not a
            medical device.
          </p>
        </div>
      </div>
    </section>
  )
}
