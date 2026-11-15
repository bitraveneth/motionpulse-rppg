import { Link } from 'react-router-dom'
import { HomeHeroVisual } from '../components/HomeHeroVisual'
import { SiteNav } from '../components/SiteNav'
import { VitalsExplainerSection } from '../components/SiteSections'
import { useContent } from '../lib/content'

export function HomePage() {
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

        <VitalsExplainerSection />

        <p className="home-demo-note" id="demo-tools">
          A demo clip is an upload on the{' '}
          <Link to="/scan?action=upload">scan page</Link>. The video stays on
          this device.
        </p>
      </main>

      <footer className="site-foot">
        <p className="site-foot-research">{c('footer.line')}</p>
      </footer>
    </>
  )
}
