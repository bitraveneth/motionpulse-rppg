import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FeedDetail } from '../lib/feed/detail'
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
  /** Motion, spectrum, and trust numbers from the settled scan. */
  detail?: FeedDetail | null
  /** 10 second webcam recording. Posted with the reading when it fits. */
  videoBlob?: Blob | null
  /**
   * Session id that just finished. The name dialog opens when this matches
   * `scanId`, so browsing an older clip does not pop it again.
   */
  promptForId?: string | null
  scanId?: string | null
  onPromptDone?: () => void
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
  detail,
  videoBlob,
  promptForId,
  scanId,
  onPromptDone,
  onShared,
}: Props) {
  const [nickname, setNickname] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const postingRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (promptForId && scanId && promptForId === scanId && !posted) {
      setOpen(true)
    }
  }, [promptForId, scanId, posted])

  useEffect(() => {
    if (!open) return
    nameRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  function close() {
    setOpen(false)
    onPromptDone?.()
  }

  async function handleShare() {
    if (postingRef.current || posted) return
    postingRef.current = true
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
        detail: detail ?? null,
      })
      setPosted(true)
      setMessage(
        droppedVideo
          ? 'Posted. The video was too large, so the feed shows the photo and numbers.'
          : 'Posted.',
      )
      onShared?.(post.id)
      onPromptDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share')
    } finally {
      postingRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      {open ? (
        <div className="share-modal" role="presentation" onClick={close}>
          <div
            className="share-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            {thumbnailData ? (
              <img className="share-modal-photo" src={thumbnailData} alt="" />
            ) : null}
            <h2 id="share-dialog-title">Post this scan?</h2>
            <p className="share-modal-lead">
              {bpm.toFixed(0)} BPM
              {respiratoryRate != null
                ? ` · ${respiratoryRate.toFixed(0)} breaths/min`
                : ''}
              . It shows on the feed
              {videoBlob ? ' with the 10 second face video' : ''}. Leave the
              name blank to post as Anonymous.
            </p>
            <label className="share-field">
              <span>Name</span>
              <input
                ref={nameRef}
                type="text"
                maxLength={40}
                placeholder="Anonymous"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={busy || posted}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleShare()
                }}
              />
            </label>
            {message ? (
              <p className="share-ok">
                {message} <Link to="/feed">See it on the feed</Link>
              </p>
            ) : null}
            {error ? (
              <p className="share-err" role="alert">
                {error}
              </p>
            ) : null}
            <div className="share-modal-actions">
              <button
                type="button"
                className="cta cta-secondary"
                onClick={close}
                disabled={busy}
              >
                {posted ? 'Close' : 'Not now'}
              </button>
              <button
                type="button"
                className="cta cta-primary"
                onClick={() => void handleShare()}
                disabled={busy || posted}
              >
                {posted ? 'Posted' : busy ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="share-reopen">
        {posted ? (
          <p className="share-ok">
            Posted. <Link to="/feed">See it on the feed</Link>
          </p>
        ) : (
          <button
            type="button"
            className="cta cta-primary"
            onClick={() => setOpen(true)}
          >
            Post to the feed
          </button>
        )}
      </div>
    </>
  )
}
