import { NavLink } from 'react-router-dom'
import { useContent } from '../lib/content'
import { LAB_DESTINATIONS } from '../lib/lab/destinations'
import { isLocalLabEnabled } from '../lib/lab/enabled'

/** Lab screens. On the public site only Test results is linked. */
export function LabTabs() {
  const c = useContent()
  const tabs = isLocalLabEnabled()
    ? LAB_DESTINATIONS
    : LAB_DESTINATIONS.filter((tab) => tab.to === '/results')
  return (
    <div className="lab-tabs-wrap">
      {tabs.length > 1 ? (
        <nav className="lab-tabs" aria-label="Lab">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => (isActive ? 'is-on' : undefined)}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <p className="lab-tabs-note">{c('footer.line')}</p>
    </div>
  )
}
