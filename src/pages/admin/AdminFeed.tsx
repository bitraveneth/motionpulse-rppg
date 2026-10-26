import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { PublicFeedPost } from '../../lib/feed/publicFeed'

type AdminFeedPost = PublicFeedPost & {
  hidden: boolean
  videoHidden: boolean
}

function whenLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminFeed() {
  const [posts, setPosts] = useState<AdminFeedPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(() => {
    api<{ posts: AdminFeedPost[] }>('/api/admin/feed')
      .then((json) => setPosts(json.posts))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function patch(
    id: string,
    body: { hidden?: boolean; videoHidden?: boolean },
  ) {
    setBusyId(id)
    setError(null)
    try {
      const json = await api<{ post: AdminFeedPost }>(`/api/admin/feed/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setPosts(
        (prev) =>
          prev?.map((post) => (post.id === id ? json.post : post)) ?? prev,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that post')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this post? The photo and video are removed from the feed.')) {
      return
    }
    setBusyId(id)
    setError(null)
    try {
      await api(`/api/admin/feed/${id}`, { method: 'DELETE' })
      setPosts((prev) => prev?.filter((post) => post.id !== id) ?? prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that post')
    } finally {
      setBusyId(null)
    }
  }

  const visibleCount = posts?.filter((post) => !post.hidden).length ?? 0
  const needle = query.trim().toLowerCase()
  const shown = (posts ?? []).filter((post) => {
    if (!needle) return true
    const name = (post.nickname?.trim() || 'anonymous').toLowerCase()
    return name.includes(needle) || post.id.toLowerCase().includes(needle)
  })

  return (
    <>
      <h1>Feed</h1>
      <p className="admin-sub">
        Every post is here, including ones hidden from the public feed.
        {posts
          ? ` ${visibleCount} on the feed, ${posts.length - visibleCount} hidden.`
          : ''}
        {' '}
        Hide post takes it off the public feed. The photo stays here so you can show it again.
      </p>
      <label className="admin-field admin-feed-search">
        <span>Find a name</span>
        <input
          type="search"
          value={query}
          placeholder="冰冰"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error ? <p className="admin-error">{error}</p> : null}
      {posts && posts.length === 0 ? (
        <p className="admin-sub">No posts yet.</p>
      ) : null}
      <ul className="admin-feed">
        {shown.map((post) => {
          const busy = busyId === post.id
          const name = post.nickname?.trim() || 'Anonymous'
          return (
            <li
              key={post.id}
              className={`admin-feed-card${post.hidden ? ' is-hidden' : ''}`}
            >
              <div className="admin-feed-photo">
                {post.thumb ? (
                  <img src={post.thumb} alt="" />
                ) : (
                  <span>No photo</span>
                )}
              </div>
              <div className="admin-feed-body">
                <div className="admin-feed-head">
                  <strong>{name}</strong>
                  <time dateTime={post.createdAt}>{whenLabel(post.createdAt)}</time>
                </div>
                <p className="admin-feed-stats">
                  {post.bpm.toFixed(0)} BPM
                  {post.respiratoryRate != null
                    ? ` · ${post.respiratoryRate.toFixed(0)} breaths/min`
                    : ''}
                  {' · '}
                  {post.durationSec.toFixed(0)}s · {post.source} · {post.riskLevel}
                </p>
                <p className="admin-feed-flags">
                  {post.hidden ? 'Hidden from the feed' : 'On the public feed'}
                  {' · '}
                  {!post.hasVideo
                    ? 'No video'
                    : post.videoHidden
                      ? 'Video hidden'
                      : 'Video visible'}
                </p>
                <div className="admin-feed-actions">
                  <button
                    type="button"
                    className={`admin-btn admin-btn-sm${post.hidden ? ' admin-btn-ghost' : ''}`}
                    disabled={busy}
                    onClick={() => void patch(post.id, { hidden: !post.hidden })}
                  >
                    {post.hidden ? 'Show on feed' : 'Hide from feed'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-ghost admin-btn-sm"
                    disabled={busy || !post.hasVideo}
                    onClick={() =>
                      void patch(post.id, { videoHidden: !post.videoHidden })
                    }
                  >
                    {post.videoHidden ? 'Show video' : 'Hide video'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-danger admin-btn-sm"
                    disabled={busy}
                    onClick={() => void remove(post.id)}
                  >
                    Delete
                  </button>
                </div>
                {post.hasVideo ? (
                  <video
                    className="admin-feed-video"
                    controls
                    playsInline
                    preload="metadata"
                    poster={post.thumb ?? undefined}
                  >
                    <source
                      src={`/api/admin/feed/${post.id}/video`}
                      type={post.videoMime || 'video/mp4'}
                    />
                  </video>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
