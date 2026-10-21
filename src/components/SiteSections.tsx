/** Marketing sections below the hero — factual, not medical claims. */

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="site-section"
      aria-labelledby="how-it-works-title"
    >
      <div className="site-section-inner">
        <h2 id="how-it-works-title">How a session works</h2>
        <p className="site-section-lead">
          Everything runs in your browser. Video stays on your device unless you
          choose to share metric summaries.
        </p>
        <ol className="steps-list">
          <li>
            <h3>Choose a source</h3>
            <p>
              Upload a short face clip (about 5–15 seconds works well), use your
              webcam, or run the built-in sample to see the pipeline immediately.
            </p>
          </li>
          <li>
            <h3>Find the face</h3>
            <p>
              MediaPipe locates your face and samples color from forehead and
              cheek regions — the same skin areas clinicians use for contactless
              pulse research demos.
            </p>
          </li>
          <li>
            <h3>Estimate pulse</h3>
            <p>
              CHROM/POS-style rPPG extracts a pulse waveform. Heart rate updates
              progressively while frames accumulate, then settles when the clip
              finishes.
            </p>
          </li>
          <li>
            <h3>Check motion</h3>
            <p>
              Motion–pulse overlap becomes a signal-trust score. High overlap
              means movement may have affected the number — not a diagnosis.
            </p>
          </li>
        </ol>
      </div>
    </section>
  )
}

export function VitalsExplainerSection() {
  return (
    <section
      id="vitals"
      className="site-section site-section-alt"
      aria-labelledby="vitals-title"
    >
      <div className="site-section-inner">
        <h2 id="vitals-title">What this camera can report</h2>
        <p className="site-section-lead">
          MotionPulse is an educational remote-PPG demo. Numbers are estimates for
          learning, not clinical vitals.
        </p>
        <div className="report-grid">
          <article className="report-card">
            <h3>Heart rate</h3>
            <p>
              Beats per minute from the gated pulse waveform. Updates live during
              analysis, then shows a settled reading when enough frames are in.
            </p>
          </article>
          <article className="report-card">
            <h3>Respiratory rate</h3>
            <p>
              <strong>Experimental.</strong> A coarse breaths-per-minute hint from
              low-frequency modulation — useful to explore, not for care decisions.
            </p>
          </article>
          <article className="report-card">
            <h3>Signal trust</h3>
            <p>
              Region weights and motion–pulse risk show which face areas carried
              the estimate and when movement may have muddied it.
            </p>
          </article>
        </div>
        <p className="site-not-measured">
          Blood oxygen (SpO₂) and blood pressure are{' '}
          <strong>not measured</strong> here. This app does not estimate them from
          face video alone.
        </p>
      </div>
    </section>
  )
}
