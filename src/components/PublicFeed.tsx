import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FeedDetail } from '../lib/feed/detail'
import { reliabilityFromRisk } from '../lib/feed/reliability'
import type { RiskLevel } from '../lib/feed/types'
import {
  feedVideoUrl,
  listPublicFeed,
  type PublicFeedPost,
} from '../lib/feed/publicFeed'

export function PublicFeed() {
  const [posts, setPosts] = useState<PublicFeedPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const load = useCallback(() => {
    const id = ++requestId.current
    setError(null)
    listPublicFeed()
      .then((rows) => {
        if (id !== requestId.current) return
        setPosts(rows)
        setError(null)
      })
      .catch((e) => {
        if (id !== requestId.current) return
        setPosts((current) => current ?? [])
        setError(e instanceof Error ? e.message : 'Could not load the feed')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const count = posts?.length ?? 0

  return (
    <section className="post-feed" aria-labelledby="feed-title">
      <header className="post-feed-head">
        <h1 id="feed-title">Feed</h1>
        <p>
          {posts === null
            ? 'Loading posts…'
            : count === 0
              ? 'No one has posted a reading yet.'
              : `${count} ${count === 1 ? 'post' : 'posts'}`}
        </p>
      </header>

      {error ? (
        <p className="share-err" role="alert">
          {error}
        </p>
      ) : null}

      {posts && posts.length === 0 && !error ? (
        <p className="post-feed-empty">Posts show up here after someone shares a scan.</p>
      ) : null}

      <ol className="post-list">
        {(posts ?? []).map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ol>
    </section>
  )
}

function breathCountNote(rate: number, durationSec: number): string {
  const secs = Math.max(1, Math.round(durationSec))
  const count = ((rate * durationSec) / 60).toFixed(1)
  if (secs === 10) return `${count} breaths in 10s, × 6`
  return `${count} breaths in ${secs}s`
}

function PostCard({ post }: { post: PublicFeedPost }) {
  const name = post.nickname?.trim() || 'Anonymous'
  const when = formatWhen(post.createdAt)
  const signal = signalCopy(post.riskLevel)

  return (
    <li className="post-card">
      <header className="post-card-head">
        {post.thumb ? (
          <img className="post-card-avatar" src={post.thumb} alt="" />
        ) : (
          <span className="post-card-avatar post-card-avatar-fallback" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="post-card-who">
          <strong className="post-card-name">{name}</strong>
          <time className="post-card-time" dateTime={post.createdAt}>
            {when.date}
            <span>{when.time}</span>
          </time>
        </div>
        <span className="post-card-source">{sourceLabel(post.source)}</span>
      </header>

      <p className="post-card-caption">
        Shared a {post.durationSec.toFixed(0)} second face scan.
      </p>
      {post.hasVideo ? (
        <Link className="post-card-scan" to={`/scan?replay=${post.id}`}>
          Open in scan
        </Link>
      ) : null}

      {post.hasVideo ? (
        <video
          className="post-card-media"
          poster={post.thumb ?? undefined}
          controls
          playsInline
          preload="metadata"
        >
          <source
            src={`${feedVideoUrl(post.id)}#t=0.1`}
            type={post.videoMime || 'video/mp4'}
          />
        </video>
      ) : post.thumb ? (
        <img className="post-card-media" src={post.thumb} alt="" />
      ) : (
        <div className="post-card-media post-card-media-empty">No photo</div>
      )}

      <dl className="post-card-metrics">
        <div className="post-metric post-metric-hero">
          <dt>Heart rate</dt>
          <dd>
            {post.bpm.toFixed(0)}
            <span> BPM</span>
          </dd>
        </div>
        <div className="post-metric post-metric-hero post-metric-breath">
          <dt>Respiratory rate</dt>
          <dd>
            {post.respiratoryRate != null ? (
              <>
                {post.respiratoryRate.toFixed(0)}
                <span> / min</span>
                <span className="post-breath-count">
                  {breathCountNote(post.respiratoryRate, post.durationSec)}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className={`post-metric post-metric-signal kind-${signal.kind}`}>
          <dt>Signal</dt>
          <dd>{signal.badge}</dd>
        </div>
        <div className="post-metric">
          <dt>Length</dt>
          <dd>
            {post.durationSec.toFixed(0)}
            <span> sec</span>
          </dd>
        </div>
      </dl>

      {post.detail ? <PostDetail detail={post.detail} /> : null}
    </li>
  )
}

function PostDetail({ detail }: { detail: FeedDetail }) {
  const trust = [
    ['Forehead', detail.trust.forehead],
    ['Left cheek', detail.trust.leftCheek],
    ['Right cheek', detail.trust.rightCheek],
    ['Lower face', detail.trust.lowerFace],
  ] as const

  return (
    <div className="post-detail">
      <p className="post-detail-kicker">Motion, spectrum &amp; trust</p>
      <section className="post-detail-block post-detail-motion">
        <h2>Motion</h2>
        <dl>
          <div>
            <dt>Overall</dt>
            <dd>{detail.motion.overall.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Forehead</dt>
            <dd>{detail.motion.forehead.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Cheeks</dt>
            <dd>{detail.motion.cheeks.toFixed(3)}</dd>
          </div>
          <div>
            <dt>Lower face</dt>
            <dd>{detail.motion.lowerFace.toFixed(3)}</dd>
          </div>
        </dl>
      </section>

      <section className="post-detail-block post-detail-spectrum">
        <h2>Spectrum</h2>
        <dl className="post-detail-three">
          <div>
            <dt>Time sync</dt>
            <dd>{detail.spectrum.timeSync.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Freq. overlap</dt>
            <dd>{detail.spectrum.freqOverlap.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Combined</dt>
            <dd>{detail.spectrum.combined.toFixed(2)}</dd>
          </div>
        </dl>
      </section>

      <section className="post-detail-block post-detail-trust">
        <h2>Trust</h2>
        <ul className="post-trust">
          {trust.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <span className="post-trust-track" aria-hidden>
                <span style={{ width: `${Math.round(value * 100)}%` }} />
              </span>
              <span className="post-trust-num">{Math.round(value * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function sourceLabel(source: string): string {
  if (source === 'webcam') return 'Webcam'
  if (source === 'upload') return 'Upload'
  if (source === 'sample') return 'Sample'
  if (source === 'batch') return 'Demo set'
  return source
}

function signalCopy(level: string): { badge: string; kind: string } {
  if (
    level === 'low' ||
    level === 'moderate' ||
    level === 'elevated' ||
    level === 'high'
  ) {
    const remark = reliabilityFromRisk(level as RiskLevel)
    return { badge: remark.badge, kind: remark.kind }
  }
  return { badge: level || 'Unknown', kind: 'mixed' }
}

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' }
  return {
    date: new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d),
    time: new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d),
  }
}
