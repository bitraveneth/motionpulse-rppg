import { SiteNav } from '../components/SiteNav'
import { PublicFeed } from '../components/PublicFeed'

/** Public timeline of shared scans. No home hero and no scan buttons. */
export function FeedPage() {
  return (
    <>
      <SiteNav primaryCta={null} />
      <main className="feed-page" id="feed">
        <PublicFeed />
      </main>
    </>
  )
}
