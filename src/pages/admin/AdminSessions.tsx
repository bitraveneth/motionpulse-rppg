import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { AdminSessionRow, AdminUser } from '../../lib/adminTypes'

export function AdminSessions() {
  const [sessions, setSessions] = useState<AdminSessionRow[] | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userId, setUserId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (userId) params.set('userId', userId)
    const qs = params.toString()
    api<{ sessions: AdminSessionRow[] }>(
      `/api/admin/sessions${qs ? `?${qs}` : ''}`,
    )
      .then((json) => setSessions(json.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [from, to, userId])

  useEffect(load, [load])

  useEffect(() => {
    api<{ users: AdminUser[] }>('/api/admin/users')
      .then((json) => setUsers(json.users))
      .catch(() => undefined)
  }, [])

  return (
    <>
      <h1>Sessions</h1>
      <p className="admin-sub">
        Every saved check. Open one to see clips and set ground truth.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-card">
        <div className="admin-row">
          <div className="admin-field">
            <label htmlFor="f-from">From</label>
            <input
              id="f-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="f-to">To</label>
            <input
              id="f-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="f-user">User</label>
            <select
              id="f-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Everyone (incl. anonymous)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="admin-card admin-table-wrap">
        {!sessions ? (
          <p className="admin-note">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="admin-note">
            Nothing saved yet. Sessions appear here when a scan settles while
            the save switch is on.
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>User</th>
                <th>Nickname</th>
                <th>Clips</th>
                <th>Heart rate</th>
                <th>Pipeline</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="admin-note" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td>{s.source}</td>
                  <td>{s.user?.email ?? <span className="admin-note">anonymous</span>}</td>
                  <td>{s.nickname ?? '—'}</td>
                  <td className="tabular-nums">{s._count.clips}</td>
                  <td className="tabular-nums">
                    {s.heartRates.length
                      ? s.heartRates.map((v) => v.toFixed(0)).join(', ')
                      : '—'}
                  </td>
                  <td className="admin-note">{s.pipelineVersion ?? '—'}</td>
                  <td>
                    <Link to={`/admin/sessions/${s.id}`} className="admin-link">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
