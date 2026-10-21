import { useCallback, useEffect, useState } from 'react'
import {
  displayNickname,
  isSupabaseConfigured,
  listRuns,
} from '../lib/feed/store'
import { resolveThumbnail } from '../lib/feed/cardMedia'
import { reliabilityFromRisk } from '../lib/feed/reliability'
import type { RunRecord } from '../lib/feed/types'
import { PulseSparkline } from './PulseSparkline'
import { ReliabilityBadge } from './ReliabilityBadge'
import { TrustDots } from './TrustDots'

type Props = {
  refreshToken?: number
}

export function RecentRuns({ refreshToken = 0 }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [mode, setMode] = useState<'supabase' | 'mock'>('mock')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listRuns(24)
      setRuns(res.runs)
      setMode(res.mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  return (
    <section className="feed-gallery" aria-label="Recent runs">
      <header className="panel-head">
        <h2>Recent runs</h2>
        <p>
          Browse metric cards from other sessions
          {mode === 'mock' ? ' (local demo feed)' : ''}. Videos stay on each
          device — feed keeps metrics and optional tiny thumbs only.
        </p>
      </header>

      <div className="feed-toolbar">
        <span className="feed-mode-pill">
          {isSupabaseConfigured() ? 'Live feed' : 'Demo feed'}
        </span>
        <button
          type="button"
          className="mode-btn"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading && <p className="help-line">Loading feed…</p>}
      {error && (
        <p className="share-err" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="empty-state">
          <p>No runs yet</p>
          <p>Finish an analysis and tap Share to feed.</p>
        </div>
      )}

      <ul className="feed-cards">
        {runs.map((run) => {
          const thumb = resolveThumbnail(run)
          const remark = reliabilityFromRisk(run.risk_level)
          return (
            <li key={run.id} className={`feed-card risk-${run.risk_level}`}>
              <div className="feed-card-body">
                <div className="feed-card-thumb-col">
                  {thumb ? (
                    <img
                      className="feed-thumb"
                      src={thumb}
                      alt=""
                      width={56}
                      height={56}
                    />
                  ) : (
                    <div className="feed-thumb feed-thumb-placeholder" aria-hidden />
                  )}
                </div>
                <div className="feed-card-main">
                  <div className="feed-card-top">
                    <span className="feed-nick">
                      {displayNickname(run.nickname)}
                      <span className="feed-bpm-inline">
                        {' '}
                        · {run.bpm.toFixed(0)} BPM
                      </span>
                    </span>
                  </div>
                  <div className="feed-card-meta">
                    <ReliabilityBadge remark={remark} />
                    <span className="feed-risk-score tabular-nums">
                      {run.risk_level} · {run.conflict_score.toFixed(2)}
                    </span>
                  </div>
                  <TrustDots
                    weights={run.roi_weights}
                    variant="dots"
                    className="feed-card-trust"
                  />
                  <PulseSparkline
                    sparkline={run.sparkline}
                    className="feed-card-spark"
                  />
                  <div className="feed-card-foot">
                    <time dateTime={run.created_at} className="feed-card-time">
                      {formatWhen(run.created_at)}
                    </time>
                    <span className="feed-source">{run.source}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
