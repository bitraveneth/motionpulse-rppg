import { Link } from 'react-router-dom'
import { HomeHeroVisual } from '../components/HomeHeroVisual'
import { LocalLab } from '../components/LocalLab'
import { PublicFeed } from '../components/PublicFeed'
import { SiteNav } from '../components/SiteNav'
import {
  HowItWorksSection,
  VitalsExplainerSection,
} from '../components/SiteSections'
import { isLocalLabEnabled } from '../lib/lab/enabled'
import { useContent } from '../lib/content'
import { useState } from 'react'

export function HomePage() {
  const labEnabled = isLocalLabEnabled()
  const [, setFeedTick] = useState(0)
  const c = useContent()

  return (
    <>
      <SiteNav primaryCta={{ label: c('cta.scan'), to: '/scan' }} />

      <main className="home-page" id="top">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-inner">
            <div className="home-hero-copy">
              <h1 id="home-hero-title">{c('home.headline')}</h1>
              <p className="home-hero-lead">{c('home.lead')}</p>
              <div className="home-hero-actions">
                <Link to="/scan" className="cta cta-primary">
                  Scan yourself
                </Link>
                <Link to="/scan?action=sample" className="cta cta-secondary">
                  Try sample
                </Link>
              </div>
            </div>
            <HomeHeroVisual />
          </div>
        </section>

        <HowItWorksSection />
        <VitalsExplainerSection />

        <section
          id="feed"
          className="site-section home-section"
          aria-labelledby="feed-title"
        >
          <div className="site-section-inner">
            <PublicFeed />
          </div>
        </section>

        <section
          id="demo-tools"
          className="site-section home-section"
          aria-labelledby="demo-tools-title"
        >
          <div className="site-section-inner">
            <h2 id="demo-tools-title">{c('home.demo.title')}</h2>
            <div className="home-lab-grid">
              <article className="home-card">
                <h3 className="home-card-heading">Demo</h3>
                <p className="home-card-body">
                  Upload a face clip or queue several videos on the scan page.
                  Analysis runs locally; nothing is sent to a server by default.
                </p>
                <Link to="/scan?action=upload" className="home-card-link">
                  Open scan to upload
                </Link>
              </article>
              <article className="home-card" id="local-lab">
                <h3 className="home-card-heading">Local lab</h3>
                <p className="home-card-body">
                  Batch datasets on this machine when the lab is enabled. Only
                  metric summaries are shared if you publish cards — not raw
                  video.
                </p>
                {labEnabled ? (
                  <a href="#local-lab-panel" className="home-card-link">
                    Jump to local lab
                  </a>
                ) : (
                  <span className="home-card-muted">
                    Enable with VITE_ENABLE_LOCAL_LAB in production builds.
                  </span>
                )}
              </article>
            </div>
            {labEnabled ? (
              <div id="local-lab-panel" className="home-lab-panel">
                <LocalLab onPublished={() => setFeedTick((t) => t + 1)} />
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <p className="site-foot-research">{c('footer.line')}</p>
      </footer>
    </>
  )
}
