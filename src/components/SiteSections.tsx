/** Marketing sections below the hero — factual, not medical claims. */

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="site-section home-section"
      aria-labelledby="how-it-works-title"
    >
      <div className="site-section-inner">
        <h2 id="how-it-works-title">How a session works</h2>
        <ol className="home-steps">
          <li className="home-card">
            <h3>1. Add a face clip</h3>
            <p>
              Open the scan page, then use your webcam, upload a short video, or
              run the built-in sample. Video stays on this device.
            </p>
          </li>
          <li className="home-card">
            <h3>2. Track the face</h3>
            <p>
              The app finds your face and samples color from forehead and cheek
              regions while you scrub the timeline.
            </p>
          </li>
          <li className="home-card">
            <h3>3. Read the vitals</h3>
            <p>
              Heart rate updates as frames arrive. Signal trust shows when motion
              may have affected the estimate.
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
      className="site-section site-section-alt home-section"
      aria-labelledby="vitals-title"
    >
      <div className="site-section-inner">
        <h2 id="vitals-title">What this camera reports</h2>
        <div className="home-report-grid">
          <article className="home-card">
            <span className="home-card-label">Heart rate</span>
            <p className="home-card-body">
              Beats per minute from the pulse waveform while the clip plays, then
              a settled value when enough frames are in.
            </p>
          </article>
          <article className="home-card">
            <span className="home-card-label">Respiratory rate</span>
            <p className="home-card-body">
              <strong>Experimental.</strong> A breaths-per-minute hint from slow
              modulation — for exploration, not clinical use.
            </p>
          </article>
          <article className="home-card">
            <span className="home-card-label">Signal trust</span>
            <p className="home-card-body">
              Region weights and motion overlap show when movement may have
              muddied the reading.
            </p>
          </article>
        </div>
        <p className="home-not-measured">
          Blood oxygen and blood pressure are not measured here.
        </p>
      </div>
    </section>
  )
}
