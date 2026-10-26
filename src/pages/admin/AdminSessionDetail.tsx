import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { AdminClip, AdminSessionDetail, GroundTruthRow } from '../../lib/adminTypes'

function Waveform({ series }: { series: number[] }) {
  if (series.length < 2) return <span className="admin-note">—</span>
  const w = 220
  const h = 40
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const step = w / (series.length - 1)
  const d = series
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(
          h - 3 - ((v - min) / span) * (h - 6)
        ).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg className="admin-waveform" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="#0e6b6a" strokeWidth="1.5" />
    </svg>
  )
}

function GroundTruthForm({
  clip,
  onSaved,
}: {
  clip: AdminClip
  onSaved: () => void
}) {
  const gt = clip.groundTruth
  const [heartRate, setHeartRate] = useState(gt ? String(gt.heartRate) : '')
  const [source, setSource] = useState(gt?.source ?? 'self-count')
  const [datasetName, setDatasetName] = useState(gt?.datasetName ?? '')
  const [datasetSubjectId, setDatasetSubjectId] = useState(gt?.datasetSubjectId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api<{ groundTruth: GroundTruthRow }>(
        `/api/admin/clips/${clip.id}/ground-truth`,
        {
          method: 'PUT',
          body: JSON.stringify({
            heartRate: Number(heartRate),
            source,
            datasetName: datasetName || undefined,
            datasetSubjectId: datasetSubjectId || undefined,
          }),
        },
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/admin/clips/${clip.id}/ground-truth`, { method: 'DELETE' })
      setHeartRate('')
      setDatasetName('')
      setDatasetSubjectId('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-gt-form" onSubmit={(e) => void save(e)}>
      <div className="admin-row">
        <div className="admin-field">
          <label htmlFor={`gt-hr-${clip.id}`}>Labeled heart rate (bpm)</label>
          <input
            id={`gt-hr-${clip.id}`}
            type="number"
            step="0.1"
            min="20"
            max="260"
            value={heartRate}
            onChange={(e) => setHeartRate(e.target.value)}
            required
          />
        </div>
        <div className="admin-field">
          <label htmlFor={`gt-src-${clip.id}`}>Source</label>
          <select
            id={`gt-src-${clip.id}`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="self-count">self-count</option>
            <option value="dataset">dataset</option>
            <option value="device">device</option>
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor={`gt-ds-${clip.id}`}>Dataset name</label>
          <input
            id={`gt-ds-${clip.id}`}
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="e.g. UBFC-rPPG"
          />
        </div>
        <div className="admin-field">
          <label htmlFor={`gt-sub-${clip.id}`}>Dataset subject id</label>
          <input
            id={`gt-sub-${clip.id}`}
            value={datasetSubjectId}
            onChange={(e) => setDatasetSubjectId(e.target.value)}
          />
        </div>
        <button className="admin-btn admin-btn-sm" type="submit" disabled={busy}>
          {gt ? 'Update ground truth' : 'Save ground truth'}
        </button>
        {gt ? (
          <button
            className="admin-btn admin-btn-danger admin-btn-sm"
            type="button"
            onClick={() => void clear()}
            disabled={busy}
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="admin-error" style={{ marginTop: '0.6rem' }}>{error}</p> : null}
    </form>
  )
}

export function AdminSessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<AdminSessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    api<{ session: AdminSessionDetail }>(`/api/admin/sessions/${id}`)
      .then((json) => setSession(json.session))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [id])

  useEffect(load, [load])

  async function remove() {
    if (!id || !window.confirm('Delete this session and all its clips?')) return
    try {
      await api(`/api/admin/sessions/${id}`, { method: 'DELETE' })
      navigate('/admin/sessions')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (error) {
    return (
      <>
        <p className="admin-error">{error}</p>
        <Link to="/admin/sessions" className="admin-link">
          ← All sessions
        </Link>
      </>
    )
  }
  if (!session) return <p className="admin-note">Loading…</p>

  return (
    <>
      <p>
        <Link to="/admin/sessions" className="admin-link">
          ← All sessions
        </Link>
      </p>
      <h1>Session {new Date(session.createdAt).toLocaleString()}</h1>
      <p className="admin-sub">
        {session.source} · {session.user?.email ?? 'anonymous'}
        {session.nickname ? ` · ${session.nickname}` : ''} · pipeline{' '}
        {session.pipelineVersion ?? '—'} · id {session.id}
      </p>

      {session.clips.length === 0 ? (
        <div className="admin-card">
          <p className="admin-note">No clips in this session.</p>
        </div>
      ) : (
        session.clips.map((clip) => (
          <div className="admin-card" key={clip.id}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {clip.thumb ? (
                <img className="admin-clip-thumb" src={clip.thumb} alt="" />
              ) : null}
              <div style={{ flex: 1 }}>
                <h2>
                  Clip {clip.index + 1}
                  {clip.settledHeartRate !== null
                    ? ` — ${clip.settledHeartRate.toFixed(0)} bpm`
                    : ''}
                </h2>
                <p className="admin-note" style={{ margin: 0 }}>
                  {clip.durationSec !== null ? `${clip.durationSec.toFixed(1)}s` : '—'} ·{' '}
                  {clip.fps !== null ? `${clip.fps.toFixed(0)} fps` : '—'} ·{' '}
                  {clip.width && clip.height ? `${clip.width}×${clip.height}` : '—'} · raw{' '}
                  {clip.rawBpm !== null ? `${clip.rawBpm.toFixed(1)} bpm` : '—'} · breath (exp.){' '}
                  {clip.respiratoryRate !== null ? clip.respiratoryRate.toFixed(1) : '—'} ·{' '}
                  {clip.signalLabel ?? '—'}
                  {clip.risk ? ` (${clip.risk})` : ''}
                </p>
                <p className="admin-note" style={{ margin: '0.35rem 0 0' }}>
                  Region weights:{' '}
                  {clip.regionWeights.length === 4
                    ? clip.regionWeights.map((v) => v.toFixed(2)).join(' / ')
                    : '—'}
                  {'  '}(forehead / L cheek / R cheek / lower face)
                </p>
                <Waveform series={clip.waveform} />
                {clip.groundTruth ? (
                  <p className="admin-note" style={{ margin: '0.35rem 0 0' }}>
                    <strong>Ground truth:</strong> {clip.groundTruth.heartRate} bpm (
                    {clip.groundTruth.source}
                    {clip.groundTruth.datasetName ? `, ${clip.groundTruth.datasetName}` : ''}
                    {clip.groundTruth.datasetSubjectId
                      ? `, subject ${clip.groundTruth.datasetSubjectId}`
                      : ''}
                    )
                  </p>
                ) : null}
                <GroundTruthForm clip={clip} onSaved={load} />
              </div>
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        className="admin-btn admin-btn-danger"
        onClick={() => void remove()}
      >
        Delete session
      </button>
    </>
  )
}
