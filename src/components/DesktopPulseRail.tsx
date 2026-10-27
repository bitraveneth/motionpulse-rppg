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

/** Desktop-only: pulse and breath sit beside the face camera. */
export function DesktopPulseRail({
  result,
  respiratory,
  scrub,
  liveEstimating = false,
}: Props) {
  const remark = result
    ? reliabilityFromConflict(result.conflict.combined)
    : null
  const wave =
    result && result.suppression.gated.length > 8
      ? result.suppression.gated
      : result?.candidate

  return (
    <aside className="desktop-pulse-rail" aria-label="Pulse beside the scan">
      <p className="desktop-pulse-label">Pulse</p>
      <p className={`desktop-pulse-bpm ${liveEstimating ? 'is-live' : ''}`}>
        {result ? result.gatedBpm.toFixed(0) : '—'}
        <span>bpm</span>
      </p>
      {wave && wave.length > 8 ? (
        <div className="desktop-pulse-wave">
          <SignalChart
            height={72}
            cursorFraction={scrub}
            series={[
              {
                values: wave,
                color: '#7dd3fc',
                label: 'Pulse waveform',
              },
            ]}
          />
        </div>
      ) : (
        <p className="desktop-pulse-empty">Waveform appears after the face settles.</p>
      )}
      <dl className="desktop-pulse-meta">
        <div>
          <dt>Breath</dt>
          <dd>
            {respiratory ? `${respiratory.breathsPerMin.toFixed(0)} /min` : '—'}
          </dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd>{remark ? remark.badge : '—'}</dd>
        </div>
      </dl>
    </aside>
  )
}
