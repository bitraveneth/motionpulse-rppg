import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { AdminUser } from '../../lib/adminTypes'

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'subject' | 'admin'>('subject')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ users: AdminUser[] }>('/api/admin/users')
      .then((json) => setUsers(json.users))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [])

  useEffect(load, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setGenerated(null)
    setNotice(null)
    try {
      const json = await api<{
        account: { id: string; email: string }
        generatedPassword: string
      }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name: name || undefined,
          role,
          password: password || undefined,
        }),
      })
      setGenerated({ email: json.account.email, password: json.generatedPassword })
      setEmail('')
      setName('')
      setPassword('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(user: AdminUser, status: 'active' | 'disabled') {
    setError(null)
    setNotice(null)
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setNotice(`${user.email} is now ${status}.`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function remove(user: AdminUser) {
    if (
      !window.confirm(
        `Delete ${user.email}? Their sessions and clip rows are deleted too. This cannot be undone.`,
      )
    ) {
      return
    }
    setError(null)
    setNotice(null)
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      setNotice(`${user.email} deleted.`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <>
      <h1>Users</h1>
      <p className="admin-sub">
        Admins edit content and see all data. Subjects see only their own
        checks. Deleting a subject deletes their sessions and clips.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-ok">{notice}</p> : null}

      <div className="admin-card">
        <h2>Create account</h2>
        <form onSubmit={(e) => void create(e)}>
          <div className="admin-row">
            <div className="admin-field">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="new-name">Name (optional)</label>
              <input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="new-role">Role</label>
              <select
                id="new-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'subject' | 'admin')}
              >
                <option value="subject">subject</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="new-password">Password (blank → random)</label>
              <input
                id="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button className="admin-btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
        {generated ? (
          <>
            <p className="admin-note" style={{ marginTop: '0.75rem' }}>
              Password for <strong>{generated.email}</strong> — copy it now, it
              is not shown again:
            </p>
            <p className="admin-generated">{generated.password}</p>
          </>
        ) : null}
      </div>

      <div className="admin-card admin-table-wrap">
        {!users ? (
          <p className="admin-note">Loading…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Sessions</th>
                <th>Consent</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.name ?? '—'}</td>
                  <td>
                    <span className={`admin-pill ${user.role === 'admin' ? 'role-admin' : ''}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-pill ${user.status === 'disabled' ? 'status-disabled' : ''}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="tabular-nums">{user._count.scanSessions}</td>
                  <td className="admin-note">
                    {user.profile
                      ? `metrics ${user.profile.consentMetricsAt ? '✓' : '—'} · video ${
                          user.profile.consentVideo ? '✓' : 'off'
                        }`
                      : '—'}
                  </td>
                  <td className="admin-note">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {user.status === 'active' ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        onClick={() => void setStatus(user, 'disabled')}
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        onClick={() => void setStatus(user, 'active')}
                      >
                        Enable
                      </button>
                    )}{' '}
                    {user.role !== 'admin' ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => void remove(user)}
                      >
                        Delete
                      </button>
                    ) : null}
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
