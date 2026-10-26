import { useState } from 'react'
import { Link } from 'react-router-dom'
import { publishFeedPost } from '../lib/feed/publicFeed'
import type { RiskLevel, RunSource } from '../lib/feed/types'

type Props = {
  bpm: number
  conflictScore: number
  riskLevel: RiskLevel
  source: RunSource
  thumbnailData?: string | null
  durationSec: number
  respiratoryRate?: number | null
  /** 10 second webcam recording. Posted with the reading when it fits. */
  videoBlob?: Blob | null
  onShared?: (postId: string) => void
}

export function ShareToFeed({
  bpm,
  conflictScore,
  riskLevel,
  source,
  thumbnailData,
  durationSec,
  respiratoryRate,
  videoBlob,
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
      const { post, droppedVideo } = await publishFeedPost({
        nickname,
        bpm,
        conflictScore,
        riskLevel,
        respiratoryRate: respiratoryRate ?? null,
        durationSec: durationSec > 0 ? durationSec : 10,
        source,
        thumb: thumbnailData ?? null,
        videoBlob: videoBlob ?? null,
      })
      setMessage(
        droppedVideo
          ? 'Posted. The video was too large, so the feed shows the photo and numbers.'
          : 'Posted.',
      )
      onShared?.(post.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="share-panel" aria-label="Share to feed">
      <header className="panel-head">
        <h2>Post to the feed</h2>
        <p>
          This shows up on the feed for anyone to see. A webcam scan includes
          the 10 second face video. Leave the name blank for Anonymous.
        </p>
      </header>

      <div className="share-row">
        <label className="share-field">
          <span>Name (optional)</span>
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
          {busy ? 'Posting…' : 'Post to feed'}
        </button>
      </div>

      {message && (
        <p className="share-ok">
          {message} <Link to="/feed">See it on the feed</Link>
        </p>
      )}
      {error && (
        <p className="share-err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
