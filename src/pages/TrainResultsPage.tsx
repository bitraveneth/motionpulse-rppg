import { LabTabs } from '../components/LabTabs'
import { SiteNav } from '../components/SiteNav'
import { TrainHistory } from '../components/TrainHistory'

export function TrainResultsPage() {
  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="lab-page">
        <header className="lab-intro">
          <LabTabs />
          <h1>Saved PhysNet runs</h1>
          <p className="lab-status">
            Each row is one finished training. The time is Asia/Shanghai. The face videos stay on
            the machine that trained them.
          </p>
        </header>
        <TrainHistory detail />
      </main>
    </>
  )
}
