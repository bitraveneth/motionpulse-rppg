import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useContent } from '../lib/content'
import { displayNickname } from '../lib/feed/types'
import type { PublicFeedPost } from '../lib/feed/post'

export function PublicFeed() {
  const c = useContent()
  const [posts, setPosts] = useState<PublicFeedPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api<{ posts: PublicFeedPost[] }>('/api/feed')
      setPosts(res.posts)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <h2 id="feed-title">{c('home.feed.title')}</h2>
      <p className="home-feed-lead">{c('home.feed.lead')}</p>

      {loading ? <p className="home-card-muted">Loading results…</p> : null}
      {error ? (
        <p className="share-err" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && posts.length === 0 ? (
        <div className="empty-state">
          <p>No shared results yet</p>
          <p>
            <Link to="/scan?action=webcam">Start a 10-second scan</Link>
            {' '}
            and tap Share if you want it listed here.
          </p>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <ul className="feed-cards home-feed-cards">
          {posts.map((post) => (
            <li key={post.id} className={`feed-card risk-${post.risk ?? 'low'}`}>
              <div className="feed-card-body">
                {post.thumb ? (
                  <img
                    className="feed-thumb"
                    src={post.thumb}
                    alt=""
                    width={56}
                    height={56}
                  />
                ) : (
                  <div className="feed-thumb feed-thumb-placeholder" aria-hidden />
                )}
                <div className="feed-card-main">
                  <div className="feed-card-top">
                    <span className="feed-nick">{displayNickname(post.nickname)}</span>
                  </div>
                  <dl className="home-feed-stats">
                    <div>
                      <dt>Heart rate</dt>
                      <dd>{post.settledHeartRate.toFixed(0)} BPM</dd>
                    </div>
                    <div>
                      <dt>Respiratory</dt>
                      <dd>
                        {post.respiratoryRate != null
                          ? `${post.respiratoryRate.toFixed(0)} /min`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Signal</dt>
                      <dd>{post.signalLabel ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>{post.risk ?? '—'}</dd>
                    </div>
                  </dl>
                  <time dateTime={post.createdAt} className="feed-card-time">
                    {formatWhen(post.createdAt)}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
