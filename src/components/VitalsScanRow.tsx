import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { reliabilityFromConflict } from '../lib/feed/reliability'
import { ReliabilityBadge } from './ReliabilityBadge'
import { SignalChart } from './SignalChart'

type Props = {
  result: PipelineResult | null
  respiratory: RespiratoryEstimate | null
  scrub: number
  emptyHint?: string
  liveEstimating?: boolean
}

/** Scan page: horizontal vital cards + waveform beneath. */
export function VitalsScanRow({
  result,
  respiratory,
  scrub,
  emptyHint,
  liveEstimating = false,
}: Props) {
  const wave =
    result && result.suppression.gated.length > 8
      ? result.suppression.gated
      : result?.candidate

  const remark = result
    ? reliabilityFromConflict(result.conflict.combined)
    : null
  const risk = result ? conflictRiskLabel(result.conflict.combined) : null
  return (
    <section
      className={`vitals-scan ${liveEstimating ? 'is-live' : ''}`}
      aria-label="Session vitals"
      aria-busy={liveEstimating}
    >
      {!result ? (
        <p className="vitals-scan-hint">
          {emptyHint ?? 'Start a clip to see heart rate and signal quality.'}
        </p>
      ) : null}

      <div className="vitals-scan-row" role="list">
        <article className="vitals-scan-card vitals-scan-card-primary" role="listitem">
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

        <article className="vitals-scan-card" role="listitem">
          <span className="vitals-label">Respiratory rate</span>
          <span className="vitals-scan-value">
            {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
          </span>
          <span className="vitals-unit">/min</span>
          <span className="vitals-note">Experimental — not clinical</span>
        </article>

        <article className="vitals-scan-card" role="listitem">
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

      {result && wave && wave.length > 8 ? (
        <div className="vitals-scan-wave">
          <div className="vitals-scan-wave-head">
            <h2>Pulse waveform</h2>
            {liveEstimating ? (
              <span className="vitals-live-pill">Updating…</span>
            ) : null}
          </div>
          <div className="chart-frame vitals-chart">
            <SignalChart
              height={120}
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
        </div>
      ) : null}
    </section>
  )
}
