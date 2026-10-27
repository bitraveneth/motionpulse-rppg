import type { HrvReading } from '../lib/rppg/beatIntervals'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'

type Props = {
  heartBpm: number | null
  hrv: HrvReading | null
  respiratory: RespiratoryEstimate | null
  liveEstimating?: boolean
}

/** Readings under the camera on a narrow screen. */
export function PhoneVitals({
  heartBpm,
  hrv,
  respiratory,
  liveEstimating = false,
}: Props) {
  return (
    <div className="phone-vitals" role="list" aria-label="Scan readings">
      <article className="phone-vital" role="listitem">
        <span className="phone-vital-label">Heart rate</span>
        <span className={`phone-vital-value ${liveEstimating ? 'is-live' : ''}`}>
          {heartBpm != null ? heartBpm.toFixed(0) : '—'}
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
        <span className="phone-vital-label">HRV</span>
        <span className="phone-vital-value">
          {hrv ? hrv.rmssdMs.toFixed(0) : '—'}
        </span>
        <span className="phone-vital-unit">{hrv ? 'ms · short' : 'ms'}</span>
      </article>
    </div>
  )
}
