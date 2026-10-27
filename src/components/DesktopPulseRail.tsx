import type { BeatReading, HrvReading } from '../lib/rppg/beatIntervals'
import type { PipelineResult } from '../lib/rppg/pipeline'
import type { RespiratoryEstimate } from '../lib/rppg/respiratory'
import { SignalChart } from './SignalChart'

type Props = {
  result: PipelineResult | null
  heartBpm: number | null
  beats: BeatReading | null
  hrv: HrvReading | null
  respiratory: RespiratoryEstimate | null
  scrub: number
  liveEstimating?: boolean
}

/** One vitals card beside the camera: heart rate, breath, HRV, and pulse. */
export function DesktopPulseRail({
  result,
  heartBpm,
  beats,
  hrv,
  respiratory,
  scrub,
  liveEstimating = false,
}: Props) {
  const pulseWave =
    result && result.suppression.gated.length > 8
      ? result.suppression.gated
      : result?.candidate
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

        <article className="pulse-row pulse-row-graph">
          <p className="premium-kicker">Pulse</p>
          {pulseWave && pulseWave.length > 8 ? (
            <SignalChart
              height={88}
              cursorFraction={scrub}
              className="pulse-wave"
              series={[{ values: pulseWave, color: '#1a7f72' }]}
            />
          ) : (
            <p className="premium-empty">The trace appears as the face is read.</p>
          )}
        </article>
      </section>
    </aside>
  )
}
