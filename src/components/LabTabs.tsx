import { NavLink } from 'react-router-dom'
import { useContent } from '../lib/content'
import { LAB_DESTINATIONS } from '../lib/lab/destinations'

const TABS = LAB_DESTINATIONS

/** The two lab screens, as tabs. */
export function LabTabs() {
  const c = useContent()
  return (
    <div className="lab-tabs-wrap">
      <nav className="lab-tabs" aria-label="Lab">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'is-on' : undefined)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <p className="lab-tabs-note">{c('footer.line')}</p>
    </div>
  )
}
