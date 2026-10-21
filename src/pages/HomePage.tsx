import { Link } from 'react-router-dom'
import { EducationSection } from '../components/EducationSection'
import { HomeHeroVisual } from '../components/HomeHeroVisual'
import { LocalLab } from '../components/LocalLab'
import { RecentRuns } from '../components/RecentRuns'
import { SiteNav } from '../components/SiteNav'
import {
  HowItWorksSection,
  VitalsExplainerSection,
} from '../components/SiteSections'
import { isLocalLabEnabled } from '../lib/lab/enabled'
import { useState } from 'react'

export function HomePage() {
  const labEnabled = isLocalLabEnabled()
  const [feedTick, setFeedTick] = useState(0)

  return (
    <>
      <SiteNav primaryCta={{ label: 'Scan yourself', to: '/scan' }} />

      <main className="home-page" id="top">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-inner">
            <div className="home-hero-copy">
              <h1 id="home-hero-title">
                Pulse from a face video, with clear signal quality
              </h1>
              <p className="home-hero-lead">
                MotionPulse estimates heart rate in your browser from ordinary
                camera footage. It flags when motion may affect the reading —
                for learning and research, not clinical use.
              </p>
              <div className="home-hero-actions">
                <Link to="/scan" className="cta cta-primary">
                  Scan yourself
                </Link>
                <Link to="/scan?action=upload" className="cta cta-secondary">
                  Upload clip
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
          id="demo-tools"
          className="site-section lower-section demo-tools-section"
          aria-labelledby="demo-tools-title"
        >
          <div className="site-section-inner">
            <h2 id="demo-tools-title">Demo tools</h2>
            <p className="site-section-lead">
              Browse recent metric cards, read tips, and open the local batch lab
              when you are testing datasets on this machine.
            </p>
            <RecentRuns refreshToken={feedTick} />
            <EducationSection variant="tips" />
            <EducationSection variant="guide" />
          </div>
        </section>

        {labEnabled ? (
          <section id="local-lab" className="site-section site-section-alt">
            <div className="site-section-inner">
              <LocalLab onPublished={() => setFeedTick((t) => t + 1)} />
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-foot">
        <p className="site-foot-research">
          MotionPulse — motion-aware rPPG demo for education and research. Not a
          medical device.
        </p>
      </footer>
    </>
  )
}
