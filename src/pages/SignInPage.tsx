import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { AccountSummary } from '../lib/adminTypes'
import '../admin.css'

/** Optional subject sign-in — scans also work with no account. */
export function SignInPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const json = await api<{ account: AccountSummary }>(
        mode === 'signin' ? '/api/auth/signin' : '/api/auth/signup',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            ...(mode === 'signup' ? { name: name || undefined } : {}),
          }),
        },
      )
      navigate(json.account.role === 'admin' ? '/admin' : '/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login">
        <h1>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        <p className="admin-sub">
          Optional — a scan works with no account. Signing in keeps your checks
          attached to you.
        </p>
        {error ? <p className="admin-error">{error}</p> : null}
        <form onSubmit={(e) => void submit(e)}>
          <div className="admin-field">
            <label htmlFor="si-email">Email</label>
            <input
              id="si-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode === 'signup' ? (
            <div className="admin-field">
              <label htmlFor="si-name">Name (optional)</label>
              <input
                id="si-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          ) : null}
          <div className="admin-field">
            <label htmlFor="si-password">Password</label>
            <input
              id="si-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="admin-btn" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="admin-note" style={{ marginTop: '0.9rem' }}>
          {mode === 'signin' ? (
            <>
              No account yet?{' '}
              <button
                type="button"
                className="admin-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                onClick={() => setMode('signup')}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have one?{' '}
              <button
                type="button"
                className="admin-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                onClick={() => setMode('signin')}
              >
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="admin-note">
          <Link to="/" className="admin-link">
            ← Back to the site
          </Link>
        </p>
      </div>
    </div>
  )
}
