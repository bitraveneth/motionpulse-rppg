import { useCallback, useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { api } from '../../lib/api'
import type { AccountSummary } from '../../lib/adminTypes'
import { AdminContent } from './AdminContent'
import { AdminExport } from './AdminExport'
import { AdminFeed } from './AdminFeed'
import { AdminSessionDetail } from './AdminSessionDetail'
import { AdminSessions } from './AdminSessions'
import { AdminUsers } from './AdminUsers'
import '../../admin.css'

function AdminLogin({
  onSignedIn,
  notice,
}: {
  onSignedIn: (account: AccountSummary) => void
  notice?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const json = await api<{ account: AccountSummary }>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (json.account.role !== 'admin') {
        setError('That account is not an admin.')
        await api('/api/auth/signout', { method: 'POST' })
        return
      }
      onSignedIn(json.account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login">
        <h1>MotionPulse admin</h1>
        <p className="admin-sub">Sign in with an admin account.</p>
        {notice ? <p className="admin-error">{notice}</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}
        <form onSubmit={(e) => void submit(e)}>
          <div className="admin-field">
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="admin-btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="admin-note" style={{ marginTop: '1rem' }}>
          <Link to="/" className="admin-link">
            ← Back to the site
          </Link>
        </p>
      </div>
    </div>
  )
}

const NAV = [
  { to: 'sessions', label: 'Sessions' },
  { to: 'feed', label: 'Feed' },
  { to: 'content', label: 'Content' },
  { to: 'users', label: 'Users' },
  { to: 'export', label: 'Export' },
]

export function AdminApp() {
  const [me, setMe] = useState<AccountSummary | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    api<{ account: AccountSummary | null }>('/api/auth/me')
      .then((json) => setMe(json.account))
      .catch(() => setMe(null))
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/signout', { method: 'POST' })
    } finally {
      setMe(null)
      navigate('/admin')
    }
  }, [navigate])

  if (me === undefined) {
    return (
      <div className="admin-login-wrap">
        <p className="admin-note">Loading…</p>
      </div>
    )
  }

  if (!me || me.role !== 'admin') {
    return (
      <AdminLogin
        onSignedIn={setMe}
        notice={me ? 'That account is not an admin.' : undefined}
      />
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link to="/admin" className="admin-brand">
          MotionPulse admin
        </Link>
        <nav className="admin-nav" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-topbar-right">
          <span>{me.email}</span>
          <Link to="/" className="admin-link">
            Site
          </Link>
          <button
            type="button"
            className="admin-btn admin-btn-ghost admin-btn-sm"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-main">
        <Routes>
          <Route path="/" element={<Navigate to="sessions" replace />} />
          <Route path="sessions" element={<AdminSessions />} />
          <Route path="feed" element={<AdminFeed />} />
          <Route path="sessions/:id" element={<AdminSessionDetail />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="export" element={<AdminExport />} />
          <Route path="*" element={<Navigate to="sessions" replace />} />
        </Routes>
      </main>
    </div>
  )
}
