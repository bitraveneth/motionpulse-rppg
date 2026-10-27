import type { BeatReading, HrvReading } from '../lib/rppg/beatIntervals'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'

type Props = {
  heartBpm: number | null
  beats: BeatReading | null
  hrv: HrvReading | null
  respiratory: RespiratoryEstimate | null
  liveEstimating?: boolean
}

/** Heart rate, breath, and short HRV beside the camera. */
export function DesktopPulseRail({
  heartBpm,
  beats,
  hrv,
  respiratory,
  liveEstimating = false,
}: Props) {
  const breathNote = respiratory
    ? `${respiratory.breathsInClip.toFixed(1)} in ${Math.round(respiratory.durationSec)}s`
    : 'Waiting for a clear spacing'
  const heartNote =
    beats && heartBpm != null && Math.abs(beats.perMinute - heartBpm) < 0.6
      ? `${beats.beats} beats in ${beats.seconds.toFixed(0)}s`
      : 'From the pulse wave'

  return (
    <aside className="desktop-pulse-rail" aria-label="Vitals">
      <section className="pulse-section">
        <p className="pulse-section-title">Vitals</p>

        <article className="pulse-row pulse-row-heart">
          <div className="pulse-row-copy">
            <p className="premium-kicker">Heart rate</p>
            <p className={`premium-value ${liveEstimating ? 'is-live' : ''}`}>
              {heartBpm != null ? heartBpm.toFixed(0) : '—'}
              <span>bpm</span>
            </p>
          </div>
          <p className="premium-note">{heartNote}</p>
        </article>

        <article className="pulse-row pulse-row-breath">
          <div className="pulse-row-copy">
            <p className="premium-kicker">Respiratory rate</p>
            <p className="premium-value">
              {respiratory ? respiratory.breathsPerMin.toFixed(0) : '—'}
              <span>/min</span>
            </p>
          </div>
          <p className="premium-note">{breathNote}</p>
        </article>

        <article className="pulse-row pulse-row-hrv">
          <div className="pulse-row-copy">
            <p className="premium-kicker">HRV</p>
            <p className="premium-value">
              {hrv ? hrv.rmssdMs.toFixed(0) : '—'}
              <span>ms</span>
            </p>
          </div>
          <p className="premium-note">
            {hrv ? 'Short reading' : 'Needs 8 beats'}
          </p>
        </article>
      </section>
    </aside>
  )
}
