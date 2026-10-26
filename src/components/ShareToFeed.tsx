import { useState } from 'react'
import { api } from '../lib/api'
import type { PublicFeedPost } from '../lib/feed/post'

type Props = {
  settledHeartRate: number
  respiratoryRate: number | null
  signalLabel: string
  risk: string
  thumbnailData?: string | null
  onShared?: (post: PublicFeedPost) => void
}

export function ShareToFeed({
  settledHeartRate,
  respiratoryRate,
  signalLabel,
  risk,
  thumbnailData,
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
      const { post } = await api<{ post: PublicFeedPost }>('/api/feed', {
        method: 'POST',
        body: JSON.stringify({
          nickname,
          settledHeartRate,
          respiratoryRate,
          signalLabel,
          risk,
          thumb: thumbnailData ?? null,
        }),
      })
      setMessage('Shared to the public feed.')
      onShared?.(post)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="share-panel" aria-label="Share">
      <header className="panel-head">
        <h2>Share</h2>
        <p>
          Post this result to the public feed: heart rate, experimental
          respiratory rate, signal label, and risk, plus an optional nickname
          and tiny face thumb. No video is uploaded.
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
          {busy ? 'Sharing…' : 'Share'}
        </button>
      </div>

      {message && <p className="share-ok">{message}</p>}
      {error && (
        <p className="share-err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
