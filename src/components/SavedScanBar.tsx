import type { PublicFeedPost } from '../lib/feed/publicFeed'

type Props = {
  posts: PublicFeedPost[]
  activeId: string | null
  busy: boolean
  onPlay: (post: PublicFeedPost) => void
}

/** Saved feed clips that still have a face video. No camera required. */
export function SavedScanBar({ posts, activeId, busy, onPlay }: Props) {
  if (posts.length === 0) {
    return (
      <p className="saved-scan-empty">
        No saved face videos yet.
      </p>
    )
  }

  return (
    <div className="saved-scan-bar">
      <p className="saved-scan-label">Play a saved scan</p>
      <div className="saved-scan-list" role="list">
        {posts.map((post) => {
          const name = post.nickname?.trim() || 'Anonymous'
          return (
            <button
              key={post.id}
              type="button"
              role="listitem"
              className={`saved-scan-chip ${activeId === post.id ? 'is-active' : ''}`}
              disabled={busy}
              onClick={() => onPlay(post)}
            >
              <span>{name}</span>
              <span className="saved-scan-bpm tabular-nums">
                {post.bpm.toFixed(0)} bpm
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
