import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'
import { isLocalLabEnabled } from '../lib/lab/enabled'

export function LocalLabPage() {
  const enabled = isLocalLabEnabled()

  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Dataset runs on this machine</h1>
        </header>
        {enabled ? (
          <div id="lab-slot" />
        ) : (
          <p className="rq-wait">
            This lab is off in this build. Set VITE_ENABLE_LOCAL_LAB to show
            the path, the runs, and the research cards.
          </p>
        )}
      </main>
    </>
  )
}
