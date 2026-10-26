/** Marketing sections below the hero — factual, not medical claims. */

import { useContent } from '../lib/content'

export function HowItWorksSection() {
  const c = useContent()
  return (
    <section
      id="how-it-works"
      className="site-section home-section"
      aria-labelledby="how-it-works-title"
    >
      <div className="site-section-inner">
        <h2 id="how-it-works-title">{c('home.how.title')}</h2>
        <ol className="home-steps">
          <li className="home-card">
            <h3>{c('home.how.step1.heading')}</h3>
            <p>{c('home.how.step1.body')}</p>
          </li>
          <li className="home-card">
            <h3>{c('home.how.step2.heading')}</h3>
            <p>{c('home.how.step2.body')}</p>
          </li>
          <li className="home-card">
            <h3>{c('home.how.step3.heading')}</h3>
            <p>{c('home.how.step3.body')}</p>
          </li>
        </ol>
      </div>
    </section>
  )
}

export function VitalsExplainerSection() {
  const c = useContent()
  return (
    <section
      id="vitals"
      className="site-section site-section-alt home-section"
      aria-labelledby="vitals-title"
    >
      <div className="site-section-inner">
        <h2 id="vitals-title">{c('home.vitals.title')}</h2>
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
        <p className="home-not-measured">{c('home.vitals.note')}</p>
      </div>
    </section>
  )
}
