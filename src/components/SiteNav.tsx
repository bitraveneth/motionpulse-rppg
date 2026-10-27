import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useContent } from '../lib/content'
type Props = {
  /** Primary pill CTA. Pass null to hide it. */
  primaryCta?: { label: string; to: string } | null
}

export function SiteNav({ primaryCta }: Props) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const onHome = location.pathname === '/'
  const c = useContent()
  const maintenance = c('site.maintenance_note', '').trim()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
  }

  function sectionHref(id: string) {
    return onHome ? `#${id}` : `/#${id}`
  }

  const links = [
    { to: '/scan', label: c('nav.scan') },
    { to: '/glossary', label: c('nav.glossary') },
    { to: '/feed', label: c('nav.feed') },
    { to: sectionHref('how-it-works'), label: c('nav.how') },
    { to: sectionHref('demo-tools'), label: c('nav.demo') },
    { to: sectionHref('local-lab'), label: c('nav.lab') },
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
            {links.map((l) => (
              <li key={l.label}>
                {l.to.startsWith('/') && !l.to.startsWith('/#') ? (
                  <Link to={l.to} onClick={close}>{l.label}</Link>
                ) : (
                  <a href={l.to} onClick={close}>{l.label}</a>
                )}
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
