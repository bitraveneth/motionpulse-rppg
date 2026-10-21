import type { PipelineResult } from '../lib/rppg/pipeline'
import { SignalChart } from './SignalChart'

type Props = {
  result: PipelineResult | null
  scrub: number
  liveEstimating?: boolean
}

/** Scan page: pulse waveform below monitor + vitals row. */
export function VitalsScanRow({
  result,
  scrub,
  liveEstimating = false,
}: Props) {
  const wave =
    result && result.suppression.gated.length > 8
      ? result.suppression.gated
      : result?.candidate

  if (!result || !wave || wave.length <= 8) return null

  return (
    <section
      className={`vitals-scan-wave-block ${liveEstimating ? 'is-live' : ''}`}
      aria-label="Pulse waveform"
      aria-busy={liveEstimating}
    >
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
    </section>
  )
}
