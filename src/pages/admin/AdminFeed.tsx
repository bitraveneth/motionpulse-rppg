import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { PublicFeedPost } from '../../lib/feed/publicFeed'

export function AdminFeed() {
  const [posts, setPosts] = useState<PublicFeedPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ posts: PublicFeedPost[] }>('/api/admin/feed')
      .then((json) => setPosts(json.posts))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function remove(id: string) {
    if (!window.confirm('Remove this post from the public feed?')) return
    setError(null)
    try {
      await api(`/api/admin/feed/${id}`, { method: 'DELETE' })
      setPosts((prev) => prev?.filter((post) => post.id !== id) ?? prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that post')
    }
  }

  return (
    <>
      <h1>Feed</h1>
      <p className="admin-sub">
        Public posts from the home page, including face video when someone
        attached a clip. Delete removes it for everyone.
      </p>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>BPM</th>
                <th>Source</th>
                <th>Video</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(posts ?? []).map((post) => (
                <tr key={post.id}>
                  <td>{new Date(post.createdAt).toLocaleString()}</td>
                  <td>{post.nickname?.trim() || 'Anonymous'}</td>
                  <td>{post.bpm.toFixed(0)}</td>
                  <td>{post.source}</td>
                  <td>{post.hasVideo ? 'yes' : 'no'}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => void remove(post.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {posts && posts.length === 0 ? (
                <tr>
                  <td colSpan={6}>No public posts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
