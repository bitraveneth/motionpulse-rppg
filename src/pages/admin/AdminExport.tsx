import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { AdminUser } from '../../lib/adminTypes'

export function AdminExport() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [userId, setUserId] = useState('')
  const [jsonUserId, setJsonUserId] = useState('')

  useEffect(() => {
    api<{ users: AdminUser[] }>('/api/admin/users')
      .then((json) => setUsers(json.users))
      .catch(() => undefined)
  }, [])

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (userId) params.set('userId', userId)
  const qs = params.toString()

  return (
    <>
      <h1>Export</h1>
      <p className="admin-sub">
        Full rows, not summaries. Thumbs are not in the CSV. Raw video is never
        stored anywhere.
      </p>

      <div className="admin-card">
        <h2>Clip results (CSV)</h2>
        <p className="admin-note">
          Session, user email (blank when anonymous), heart rate, breath rate
          (experimental), risk, region weights, ground truth, time.
        </p>
        <div className="admin-row" style={{ marginBottom: '0.9rem' }}>
          <div className="admin-field">
            <label htmlFor="x-from">From</label>
            <input
              id="x-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="x-to">To</label>
            <input
              id="x-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="x-user">User</label>
            <select
              id="x-user"
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
        <a
          className="admin-btn"
          href={`/api/admin/export/clips.csv${qs ? `?${qs}` : ''}`}
          download
        >
          Download clips CSV
        </a>
      </div>

      <div className="admin-card">
        <h2>One person (JSON)</h2>
        <p className="admin-note">
          Account, profile, consents, every session, every clip — for one user.
        </p>
        <div className="admin-row" style={{ marginBottom: '0.9rem' }}>
          <div className="admin-field">
            <label htmlFor="x-json-user">User</label>
            <select
              id="x-json-user"
              value={jsonUserId}
              onChange={(e) => setJsonUserId(e.target.value)}
            >
              <option value="">Choose…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        {jsonUserId ? (
          <a
            className="admin-btn"
            href={`/api/admin/export/users/${jsonUserId}.json`}
            download
          >
            Download user JSON
          </a>
        ) : (
          <span className="admin-note">Pick a user first.</span>
        )}
      </div>
    </>
  )
}
