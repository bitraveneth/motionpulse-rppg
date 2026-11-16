import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useContent } from '../lib/content'
import { isLabPath, LAB_DESTINATIONS } from '../lib/lab/destinations'
type Props = {
  /** Primary pill CTA. Pass null to hide it. */
  primaryCta?: { label: string; to: string } | null
}

export function SiteNav({ primaryCta }: Props) {
  const [open, setOpen] = useState(false)
  const [labOpen, setLabOpen] = useState(false)
  const labRef = useRef<HTMLLIElement>(null)
  const { pathname } = useLocation()
  const c = useContent()
  const maintenance = c('site.maintenance_note', '').trim()
  const labOn = isLabPath(pathname)

  useEffect(() => {
    setOpen(false)
    setLabOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open && !labOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setLabOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, labOpen])

  useEffect(() => {
    if (!labOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!labRef.current?.contains(event.target)) setLabOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [labOpen])

  function close() {
    setOpen(false)
  }

  const links = [
    { to: '/scan', label: c('nav.scan') },
    { to: '/feed', label: c('nav.feed') },
    { to: '/signin', label: c('nav.signin') },
  ]

  const cta =
    primaryCta === undefined
      ? { label: c('cta.sample'), to: '/scan?action=sample' }
      : primaryCta

  return (
    <header className="site-nav-pill-wrap">
      <nav className="site-nav-pill" aria-label="Site">
        <Link className="site-nav-mark" to="/" onClick={close}>
          Motion<span>Pulse</span>
        </Link>

        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav-panel"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Menu'}
        </button>

        <div
          id="site-nav-panel"
          className={`site-nav-panel ${open ? 'is-open' : ''}`}
        >
          <ul className="site-nav-links">
            {links.slice(0, 2).map((l) => (
              <li key={l.label}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) => (isActive ? 'is-on' : undefined)}
                  onClick={close}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li className={`site-nav-lab ${labOn ? 'is-on' : ''} ${labOpen ? 'is-open' : ''}`} ref={labRef}>
              <button
                type="button"
                className="site-nav-lab-toggle"
                aria-expanded={labOpen}
                aria-controls="site-nav-lab-menu"
                onClick={() => setLabOpen((value) => !value)}
              >
                Lab
              </button>
              <ul id="site-nav-lab-menu" className="site-nav-lab-menu">
                {LAB_DESTINATIONS.map((tab) => (
                  <li key={tab.to}>
                    <NavLink
                      to={tab.to}
                      end={tab.to === '/train'}
                      className={({ isActive }) => (isActive ? 'is-on' : undefined)}
                      onClick={close}
                    >
                      {tab.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
            {links.slice(2).map((l) => (
              <li key={l.label}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) => (isActive ? 'is-on' : undefined)}
                  onClick={close}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {cta ? (
            <Link
              to={cta.to}
              className="cta cta-primary site-nav-cta"
              onClick={close}
            >
              {cta.label}
            </Link>
          ) : null}
        </div>
      </nav>
      {maintenance ? (
        <p className="maintenance-note" role="status">
          {maintenance}
        </p>
      ) : null}
    </header>
  )
}
