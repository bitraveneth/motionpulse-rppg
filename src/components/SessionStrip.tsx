import type { RiskLevel } from '../lib/feed/types'

export type SessionRun = {
  id: string
  name: string
  bpm: number
  riskLevel: RiskLevel
  riskScore: number
  thumbnail: string | null
  at: number
  respiratoryBpm: number | null
}

type Props = {
  runs: SessionRun[]
  activeId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  max?: number
}

const MAX_DEFAULT = 10

/** Local session of recent analyses (privacy: metrics + thumb only). */
export function SessionStrip({
  runs,
  activeId,
  onSelect,
  onClear,
  max = MAX_DEFAULT,
}: Props) {
  const list = runs.slice(0, max)
  if (list.length === 0) {
    return (
      <section className="session-strip session-empty" aria-label="Session">
        <header className="panel-head">
          <h2>Session</h2>
          <p>
            Queue up to {max} face clips — each stays in your browser. When
            several finish, compare BPM and motion risk below.
          </p>
        </header>
      </section>
    )
  }

  const showTable = list.length >= 2

  return (
    <section className="session-strip" aria-label="Session runs">
      <header className="session-head">
        <div>
          <h2>Session · {list.length}/{max}</h2>
          <p>Local only — metrics and tiny thumbs, never raw video upload.</p>
        </div>
        <button type="button" className="cta cta-secondary session-clear" onClick={onClear}>
          Clear session
        </button>
      </header>

      <ul className="session-cards">
        {list.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              className={`session-card risk-${run.riskLevel} ${activeId === run.id ? 'is-active' : ''}`}
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
                <div className="session-thumb session-thumb-ph" aria-hidden />
              )}
              <div className="session-card-body">
                <span className="session-name">{run.name}</span>
                <span className="session-bpm">
                  {run.bpm.toFixed(0)} BPM
                </span>
                <span className="session-meta">
                  Risk {run.riskScore.toFixed(2)}
                  {run.respiratoryBpm != null
                    ? ` · ~${run.respiratoryBpm.toFixed(0)} /min breath`
                    : ''}
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
                  <td className="tabular-nums">{run.bpm.toFixed(0)}</td>
                  <td className="tabular-nums">
                    {run.riskLevel} ({run.riskScore.toFixed(2)})
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
