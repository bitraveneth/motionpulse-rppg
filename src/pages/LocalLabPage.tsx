import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'

export function LocalLabPage() {
  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Dataset runs on this machine</h1>
        </header>
        <div id="lab-slot" />
      </main>
    </>
  )
}
