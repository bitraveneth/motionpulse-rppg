import type { RiskLevel } from '../lib/feed/types'
import type { FrameLandmarks, RoiRgbTrace } from '../lib/rppg/types'

export type SessionClipStatus = 'queued' | 'analyzing' | 'done' | 'error'

/** Per-clip analysis buffer kept in-browser for one-by-one browsing. */
export type SessionBuffer = {
  frames: FrameLandmarks[]
  /** Video time of each face sample. Missing on older in-memory clips. */
  timestampsMs?: number[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
}

export type SessionRun = {
  id: string
  name: string
  status: SessionClipStatus
  source: 'upload' | 'sample' | 'webcam'
  bpm: number | null
  riskLevel: RiskLevel | null
  riskScore: number | null
  thumbnail: string | null
  at: number
  respiratoryBpm: number | null
  durationSec: number
  /** Object URL for the optimized clip (upload). Revoke on clear. */
  objectUrl: string | null
  /** Landmark / ROI buffer so vitals + overlay restore on browse. */
  buffer: SessionBuffer | null
  errorMessage?: string | null
}

type Props = {
  runs: SessionRun[]
  activeId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  max?: number
  /** Tighter layout on /scan to match vital cards. */
  variant?: 'default' | 'scan'
}

const MAX_DEFAULT = 10

/** Local session of recent analyses (privacy: metrics + thumb only in feed). */
export function SessionStrip({
  runs,
  activeId,
  onSelect,
  onClear,
  max = MAX_DEFAULT,
  variant = 'default',
}: Props) {
  const list = runs.slice(0, max)
  const isScan = variant === 'scan'

  if (list.length === 0) {
    if (isScan) {
      return (
        <section className="scan-session-strip session-empty" aria-label="Session">
          <div className="scan-session-strip-toolbar">
            <div className="scan-session-strip-title-row">
              <span className="scan-session-strip-title">Session</span>
              <span className="scan-session-strip-count">0 of {max}</span>
            </div>
          </div>
          <p className="scan-session-strip-hint">
            Flip clips with the slider. Metrics and thumbs stay on this machine.
          </p>
        </section>
      )
    }
    return (
      <section className="session-strip session-empty" aria-label="Session">
        <header className="panel-head">
          <h2>Session</h2>
          <p>
            Queue up to {max} face clips — browse them one by one with the
            slider under the preview. Each clip stays in your browser.
          </p>
        </header>
      </section>
    )
  }

  const showTable = !isScan && list.length >= 2
  const doneCount = list.filter((r) => r.status === 'done').length

  if (isScan) {
    return (
      <section className="scan-session-strip" aria-label="Session runs">
        <div className="scan-session-strip-toolbar">
          <div className="scan-session-strip-title-row">
            <span className="scan-session-strip-title">Session</span>
            <span className="scan-session-strip-count tabular-nums">
              {list.length} of {max}
            </span>
          </div>
          <button type="button" className="btn-text" onClick={onClear}>
            Clear session
          </button>
        </div>
        <p className="scan-session-strip-hint">
          Flip clips with the slider. Metrics and thumbs stay on this machine.
        </p>
        <ul className="scan-session-clips" role="list">
          {list.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className={`vitals-scan-card scan-session-clip-card ${activeId === run.id ? 'is-active' : ''}`}
                onClick={() => onSelect(run.id)}
              >
                <span className="vitals-label">{clipDisplayName(run)}</span>
                {run.status === 'done' && run.bpm != null ? (
                  <>
                    <span className="vitals-scan-value tabular-nums">
                      {run.bpm.toFixed(0)}
                    </span>
                    <span className="vitals-unit">BPM</span>
                    <span className="vitals-note">
                      {run.riskScore != null
                        ? `Risk ${run.riskScore.toFixed(2)}${
                            run.respiratoryBpm != null
                              ? ` · ~${run.respiratoryBpm.toFixed(0)} /min`
                              : ''
                          }`
                        : '—'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="vitals-scan-value vitals-scan-value-sm">
                      {statusLabel(run.status)}
                    </span>
                    <span className="vitals-note">
                      {run.status === 'error'
                        ? (run.errorMessage ?? 'Failed')
                        : 'Waiting in queue…'}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="session-strip" aria-label="Session runs">
      <header className="session-head">
        <div>
          <h2>
            Session · {list.length}/{max}
            {doneCount < list.length ? (
              <span className="session-head-sub">
                {' '}
                · {doneCount} ready
              </span>
            ) : null}
          </h2>
          <p>
            Use the slider under the video to flip clips one at a time. Local
            only — metrics and tiny thumbs, never raw video upload.
          </p>
        </div>
        <button
          type="button"
          className="cta cta-secondary session-clear"
          onClick={onClear}
        >
          Clear session
        </button>
      </header>

      <ul className="session-cards">
        {list.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              className={`session-card status-${run.status} ${run.riskLevel ? `risk-${run.riskLevel}` : ''} ${activeId === run.id ? 'is-active' : ''}`}
              onClick={() => onSelect(run.id)}
            >
              {run.thumbnail ? (
                <img
                  src={run.thumbnail}
                  alt=""
                  className="session-thumb"
                  width={56}
                  height={56}
                />
              ) : (
                <div
                  className={`session-thumb session-thumb-ph status-${run.status}`}
                  aria-hidden
                />
              )}
              <div className="session-card-body">
                <span className="session-name">{run.name}</span>
                <span className="session-bpm">
                  {run.status === 'done' && run.bpm != null
                    ? `${run.bpm.toFixed(0)} BPM`
                    : statusLabel(run.status)}
                </span>
                <span className="session-meta">
                  {run.status === 'done' && run.riskScore != null
                    ? `Risk ${run.riskScore.toFixed(2)}${
                        run.respiratoryBpm != null
                          ? ` · ~${run.respiratoryBpm.toFixed(0)} /min breath`
                          : ''
                      }`
                    : run.status === 'error'
                      ? (run.errorMessage ?? 'Failed')
                      : 'Waiting in queue…'}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {showTable && (
        <div className="session-table-wrap">
          <table className="session-table">
            <thead>
              <tr>
                <th>Clip</th>
                <th>Status</th>
                <th>BPM</th>
                <th>Risk</th>
                <th>Breath*</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {list.map((run) => (
                <tr
                  key={run.id}
                  className={activeId === run.id ? 'is-active' : undefined}
                >
                  <td>{run.name}</td>
                  <td>{statusLabel(run.status)}</td>
                  <td className="tabular-nums">
                    {run.bpm != null ? run.bpm.toFixed(0) : '—'}
                  </td>
                  <td className="tabular-nums">
                    {run.riskLevel != null && run.riskScore != null
                      ? `${run.riskLevel} (${run.riskScore.toFixed(2)})`
                      : '—'}
                  </td>
                  <td className="tabular-nums">
                    {run.respiratoryBpm != null
                      ? run.respiratoryBpm.toFixed(0)
                      : '—'}
                  </td>
                  <td>{formatClock(run.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="session-table-note">
            *Breathing is experimental. BP is never estimated here.
          </p>
        </div>
      )}
    </section>
  )
}

function clipDisplayName(run: SessionRun): string {
  if (run.source === 'sample') return 'Sample'
  return run.name
}

function statusLabel(status: SessionClipStatus) {
  if (status === 'analyzing') return 'Analyzing…'
  if (status === 'queued') return 'Queued'
  if (status === 'error') return 'Error'
  return 'Done'
}

function formatClock(ms: number) {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}
