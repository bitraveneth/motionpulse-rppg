import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
type Props = {
  /** Primary pill CTA label */
  primaryCta?: { label: string; to: string }
}

export function SiteNav({ primaryCta }: Props) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const onHome = location.pathname === '/'

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
    { to: '/scan', label: 'Scan' },
    { to: sectionHref('how-it-works'), label: 'How it works' },
    { to: sectionHref('demo-tools'), label: 'Demo' },
    { to: sectionHref('local-lab'), label: 'Local lab' },
  ]

  const cta = primaryCta ?? { label: 'Try sample', to: '/scan?action=sample' }

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
                {l.to.startsWith('/scan') ? (
                  <Link to={l.to} onClick={close}>{l.label}</Link>
                ) : (
                  <a href={l.to} onClick={close}>{l.label}</a>
                )}
              </li>
            ))}
          </ul>
          <Link
            to={cta.to}
            className="cta cta-primary site-nav-cta"
            onClick={close}
          >
            {cta.label}
          </Link>
        </div>
      </nav>
    </header>
  )
}
