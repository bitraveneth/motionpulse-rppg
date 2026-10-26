import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { AccountSummary, SubjectSessionRow } from '../lib/adminTypes'
import '../admin.css'

/** Subject home: only their own sessions, nothing else. */
export function AccountPage() {
  const [me, setMe] = useState<AccountSummary | null | undefined>(undefined)
  const [sessions, setSessions] = useState<SubjectSessionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api<{ account: AccountSummary | null }>('/api/auth/me')
      .then((json) => {
        setMe(json.account)
        if (!json.account) return
        if (json.account.role === 'admin') {
          navigate('/admin')
          return
        }
        api<{ sessions: SubjectSessionRow[] }>('/api/me/sessions')
          .then((s) => setSessions(s.sessions))
          .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      })
      .catch(() => setMe(null))
  }, [navigate])

  async function signOut() {
    try {
      await api('/api/auth/signout', { method: 'POST' })
    } finally {
      navigate('/')
    }
  }

  if (me === undefined) {
    return (
      <div className="admin-login-wrap">
        <p className="admin-note">Loading…</p>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login">
          <h1>Your checks</h1>
          <p className="admin-sub">Sign in to see the sessions saved to you.</p>
          <Link to="/signin" className="admin-btn" style={{ textAlign: 'center' }}>
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link to="/" className="admin-brand">
          MotionPulse
        </Link>
        <div className="admin-topbar-right">
          <span>{me.email}</span>
          <Link to="/scan" className="admin-link">
            Scan
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
        <h1>Your checks{me.name ? `, ${me.name}` : ''}</h1>
        <p className="admin-sub">
          Sessions saved while you were signed in. Only you and the admin can
          see them.
        </p>
        {error ? <p className="admin-error">{error}</p> : null}
        <div className="admin-card admin-table-wrap">
          {!sessions ? (
            <p className="admin-note">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="admin-note">
              Nothing saved yet. Run a scan while signed in and it will appear
              here when the save switch is on.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Clips</th>
                  <th>Heart rate</th>
                  <th>Breath (exp.)</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const hrs = s.clips
                    .map((cl) => cl.settledHeartRate)
                    .filter((v): v is number => v !== null)
                  const breaths = s.clips
                    .map((cl) => cl.respiratoryRate)
                    .filter((v): v is number => v !== null)
                  return (
                    <tr key={s.id}>
                      <td className="admin-note" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td>{s.source}</td>
                      <td className="tabular-nums">{s.clips.length}</td>
                      <td className="tabular-nums">
                        {hrs.length ? hrs.map((v) => v.toFixed(0)).join(', ') : '—'}
                      </td>
                      <td className="tabular-nums">
                        {breaths.length ? breaths.map((v) => v.toFixed(0)).join(', ') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
