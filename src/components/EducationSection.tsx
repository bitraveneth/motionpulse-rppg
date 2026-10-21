type Props = {
  /** Compact tips before a run vs fuller guide after */
  variant?: 'tips' | 'guide'
}

/** Plain-English “How to read your results” — educational, not medical. */
export function EducationSection({ variant = 'guide' }: Props) {
  if (variant === 'tips') {
    return (
      <section className="edu-section edu-tips" aria-label="Tips before you start">
        <h2>Before you upload</h2>
        <ul>
          <li>
            <strong>Face in frame</strong> — one clear face, front-facing.
          </li>
          <li>
            <strong>Even light</strong> — avoid harsh shadows or backlight.
          </li>
          <li>
            <strong>Stay fairly still</strong> — small motion is fine; talking
            and big head turns muddy the signal.
          </li>
          <li>
            <strong>~5–15 seconds</strong> — short clips work best (we also
            cap longer ones in-browser).
          </li>
        </ul>
        <p className="edu-disclaimer">
          Educational demo — not for medical use.
        </p>
      </section>
    )
  }

  return (
    <section className="edu-section edu-guide" aria-label="How to read your results">
      <header className="panel-head">
        <h2>How to read your results</h2>
        <p>
          MotionPulse estimates pulse from tiny color changes in a face video,
          then checks whether face motion may have muddied that estimate.
        </p>
      </header>

      <dl className="edu-glossary">
        <div>
          <dt>BPM</dt>
          <dd>
            Estimated beats per minute from the cleaned pulse waveform — an
            educational reading, not a clinical heart-rate measurement.
          </dd>
        </div>
        <div>
          <dt>Motion risk</dt>
          <dd>
            How much face motion lines up with the pulse estimate. High risk
            means motion may have affected the number — not that anything is
            wrong with your health.
          </dd>
        </div>
        <div>
          <dt>Cleaned pulse</dt>
          <dd>
            When risk is high, the waveform is gently dialed down so motion
            influence is softer, without wiping the signal out completely.
          </dd>
        </div>
        <div>
          <dt>Trusted face areas</dt>
          <dd>
            Forehead and cheeks often look stabler than a talking mouth. Trust
            dots show which skin regions carried more weight.
          </dd>
        </div>
        <div>
          <dt>Stable / Mixed / Unreliable</dt>
          <dd>
            Signal-quality badges from motion–pulse overlap. “Unreliable”
            means the estimate may be motion-affected — never a health grade.
          </dd>
        </div>
      </dl>

      <p className="edu-callout">
        High motion risk ≠ a health problem. It only flags that motion may have
        affected the pulse estimate.
      </p>
      <p className="edu-disclaimer">
        Not for medical use — educational demo only. Face video stays on your
        device; the optional feed stores metrics and a tiny thumbnail, never
        the video.
      </p>
    </section>
  )
}
