import { NavLink } from 'react-router-dom'
import { useContent } from '../lib/content'
import { LAB_DESTINATIONS } from '../lib/lab/destinations'

/** Lab screens, the same on this Mac and on the live site. */
export function LabTabs() {
  const c = useContent()
  return (
    <div className="lab-tabs-wrap">
      <nav className="lab-tabs" aria-label="Lab">
        {LAB_DESTINATIONS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/train'}
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
