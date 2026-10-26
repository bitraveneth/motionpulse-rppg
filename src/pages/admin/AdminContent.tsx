import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { SWITCH_KEYS } from '../../lib/contentDefaults'
import { resetContentCache } from '../../lib/content'

type ContentResponse = {
  defaults: Record<string, string>
  rows: { key: string; text: string; updatedAt: string; updatedBy: string | null }[]
}

export function AdminContent() {
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<Record<string, { updatedAt: string; updatedBy: string | null }>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<ContentResponse>('/api/admin/content')
      .then((json) => {
        setDefaults(json.defaults)
        const merged: Record<string, string> = { ...json.defaults }
        const m: Record<string, { updatedAt: string; updatedBy: string | null }> = {}
        for (const row of json.rows) {
          merged[row.key] = row.text
          m[row.key] = { updatedAt: row.updatedAt, updatedBy: row.updatedBy }
        }
        setValues(merged)
        setMeta(m)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [])

  function set(key: string, text: string) {
    setValues((prev) => ({ ...prev, [key]: text }))
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const updates: Record<string, string> = {}
      for (const key of Object.keys(defaults)) {
        updates[key] = values[key] ?? ''
      }
      await api('/api/admin/content', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      })
      resetContentCache()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const keys = Object.keys(defaults).sort()

  return (
    <>
      <h1>Content</h1>
      <p className="admin-sub">
        Site copy and switches. Empty maintenance note stays hidden. Keys not
        in this list are not used by the app.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}
      {saved ? <p className="admin-ok">Saved. The site picks up changes on next load.</p> : null}
      {keys.length === 0 ? <p className="admin-note">Loading…</p> : null}
      {keys.map((key) => {
        const isSwitch = SWITCH_KEYS.includes(key)
        const info = meta[key]
        return (
          <div className="admin-card" key={key}>
            <div className="admin-field" style={{ marginBottom: 0 }}>
              <label htmlFor={`content-${key}`}>
                {key}
                {info ? (
                  <span className="admin-note" style={{ fontWeight: 400 }}>
                    {' '}
                    — edited {new Date(info.updatedAt).toLocaleString()}
                    {info.updatedBy ? ` by ${info.updatedBy}` : ''}
                  </span>
                ) : (
                  <span className="admin-note" style={{ fontWeight: 400 }}>
                    {' '}
                    — default
                  </span>
                )}
              </label>
              {isSwitch ? (
                <select
                  id={`content-${key}`}
                  value={values[key] ?? 'off'}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="on">on</option>
                  <option value="off">off</option>
                </select>
              ) : (
                <textarea
                  id={`content-${key}`}
                  value={values[key] ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </div>
          </div>
        )
      })}
      {keys.length > 0 ? (
        <button className="admin-btn" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save all'}
        </button>
      ) : null}
    </>
  )
}
