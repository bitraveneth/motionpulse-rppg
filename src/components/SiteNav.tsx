import { useEffect, useState } from 'react'

type Props = {
  labEnabled: boolean
  onTrySample: () => void
  busy?: boolean
}

const LINKS: { href: string; label: string; labOnly?: boolean }[] = [
  { href: '#monitor', label: 'Monitor' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#vitals', label: 'Vitals' },
  { href: '#demo-tools', label: 'Demo' },
  { href: '#local-lab', label: 'Local lab', labOnly: true },
]

export function SiteNav({ labEnabled, onTrySample, busy = false }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const links = LINKS.filter((l) => !l.labOnly || labEnabled)

  function closeAndNav() {
    setOpen(false)
  }

  return (
    <header className="site-nav-wrap">
      <nav className="site-nav" aria-label="Site">
        <a className="site-nav-mark" href="#top" onClick={closeAndNav}>
          Motion<span>Pulse</span>
        </a>

        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav-panel"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close menu' : 'Menu'}
        </button>

        <div
          id="site-nav-panel"
          className={`site-nav-panel ${open ? 'is-open' : ''}`}
        >
          <ul className="site-nav-links">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={closeAndNav}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="cta cta-primary site-nav-cta"
            disabled={busy}
            onClick={() => {
              closeAndNav()
              onTrySample()
              document.getElementById('monitor')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }}
          >
            Try sample
          </button>
        </div>
      </nav>
    </header>
  )
}
