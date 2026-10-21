import { useState } from 'react'
import { shareRun, isSupabaseConfigured } from '../lib/feed/store'
import type { RunRecord, RunSource } from '../lib/feed/types'
import type { RiskLevel, RoiWeightsSummary } from '../lib/feed/types'

type Props = {
  bpm: number
  conflictScore: number
  riskLevel: RiskLevel
  roiWeights: RoiWeightsSummary
  source: RunSource
  thumbnailData?: string | null
  sparkline?: string | null
  onShared?: (run: RunRecord) => void
}

export function ShareToFeed({
  bpm,
  conflictScore,
  riskLevel,
  roiWeights,
  source,
  thumbnailData,
  sparkline,
  onShared,
}: Props) {
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { run, mode } = await shareRun({
        nickname,
        bpm,
        conflict_score: conflictScore,
        risk_level: riskLevel,
        roi_weights: roiWeights,
        source,
        thumbnail_data: thumbnailData ?? null,
        sparkline: sparkline ?? null,
      })
      setMessage(
        mode === 'supabase'
          ? 'Shared to the public feed.'
          : 'Saved to the local demo feed (Supabase not configured).',
      )
      onShared?.(run)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="share-panel" aria-label="Share to feed">
      <header className="panel-head">
        <h2>Share to feed</h2>
        <p>
          Post metric summaries plus an optional tiny face thumb and pulse
          sparkline. No face video is uploaded. Leave nickname blank for
          Anonymous.
        </p>
      </header>

      <div className="share-row">
        <label className="share-field">
          <span>Nickname (optional)</span>
          <input
            type="text"
            maxLength={40}
            placeholder="Anonymous"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="cta cta-primary"
          onClick={() => void handleShare()}
          disabled={busy}
        >
          {busy ? 'Sharing…' : 'Share to feed'}
        </button>
      </div>

      <p className="help-line">
        Feed mode:{' '}
        {isSupabaseConfigured()
          ? 'Supabase (live)'
          : 'localStorage mock — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to go live'}
      </p>
      {message && <p className="share-ok">{message}</p>}
      {error && (
        <p className="share-err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
