import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchTrainRun,
  fetchTrainRuns,
  formatTestWhen,
  trainStatusLabel,
  type TrainRunDetail,
  type TrainRunSummary,
} from '../lib/lab/trainRunApi'

function lossText(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(3)
}

function peopleLine(run: TrainRunSummary): string {
  if (run.learned === 0 && run.heldOut === 0) {
    return run.people === 0 ? 'All' : `${run.people} chosen`
  }
  if (run.heldOut === 0) return `${run.learned} learned`
  return `${run.learned} learned · ${run.heldOut} held out`
}

function EpochBars({ run }: { run: TrainRunDetail }) {
  const rows = run.history.filter((row) => Number.isFinite(row.loss))
  if (rows.length === 0) return null
  const peak = Math.max(...rows.map((row) => row.loss), 0.0001)
  return (
    <div className="train-bars" aria-label="Loss each pass">
      {rows.map((row) => (
        <div className="train-bar" key={row.epoch}>
          <span>Pass {row.epoch}</span>
          <i style={{ width: `${Math.max(8, (row.loss / peak) * 100)}%` }} />
          <span>{row.loss.toFixed(3)}</span>
        </div>
      ))}
    </div>
  )
}

function RunDetail({ run }: { run: TrainRunDetail }) {
  return (
    <section>
      <h2>
        {run.name}
        <span className="result-when"> {formatTestWhen(run.startedAt)}</span>
      </h2>
      <p className="lab-status">
        {trainStatusLabel(run.status)}
        {run.createdAt !== run.startedAt ? ` · finished ${formatTestWhen(run.createdAt)}` : ''}. PhysNet.
        The videos stayed on this Mac.
      </p>
      <div className="lab-metric-grid">
        <article className="rq-card">
          <p className="rq-id">Final loss</p>
          <p className="rq-stat">
            {lossText(run.finalLoss)}
            <span>last pass</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">Best loss</p>
          <p className="rq-stat">
            {lossText(run.bestLoss)}
            <span>lowest pass</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">Windows</p>
          <p className="rq-stat">
            {run.windowCount}
            <span>{run.epochs} pass{run.epochs === 1 ? '' : 'es'}</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">Held-out miss</p>
          <p className="rq-stat">
            {run.heldMae == null ? '—' : run.heldMae.toFixed(1)}
            <span>{run.heldCount > 0 ? `${run.heldCount} ${run.heldCount === 1 ? 'person' : 'people'}` : 'BPM'}</span>
          </p>
        </article>
        {run.crossMae != null && run.crossName ? (
          <article className="rq-card">
            <p className="rq-id">Other camera</p>
            <p className="rq-stat">
              {run.crossMae.toFixed(1)}
              <span>
                {run.crossName}
                {run.crossCount > 0 ? ` · ${run.crossCount}` : ''}
              </span>
            </p>
          </article>
        ) : null}
      </div>
      {run.note ? <p className="lab-status">{run.note}</p> : null}
      <p className="train-folder">{run.checkpoint || 'No checkpoint path was stored.'}</p>
      <p className="train-folder">{run.folder}</p>
      <EpochBars run={run} />
      <div className="result-grid">
        {run.people.map((person) => (
          <article className="train-person" key={person.id}>
            <p className={person.role === 'held out' ? 'train-role is-held' : 'train-role'}>{person.role}</p>
            <h3>{person.subject}</h3>
            <p className="lab-status">
              {person.bpm != null && person.referenceBpm != null
                ? `${person.bpm.toFixed(1)} BPM · file ${person.referenceBpm.toFixed(1)}`
                : person.role === 'held out'
                  ? 'Not used this run.'
                  : `${person.windows} window${person.windows === 1 ? '' : 's'}`}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function TrainHistory({ detail }: { detail: boolean }) {
  const { runId } = useParams()
  const [runs, setRuns] = useState<TrainRunSummary[]>([])
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState<TrainRunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchTrainRuns()
      .then((rows) => {
        if (!cancel) setRuns(rows)
      })
      .catch(() => {
        if (!cancel) setError('Could not load training history.')
      })
      .finally(() => {
        if (!cancel) setReady(true)
      })
    return () => {
      cancel = true
    }
  }, [])

  const selected = detail ? runId || runs[0]?.id || '' : ''

  useEffect(() => {
    if (!selected) return
    let cancel = false
    setOpen(null)
    fetchTrainRun(selected)
      .then((row) => {
        if (!cancel) setOpen(row)
      })
      .catch(() => {
        if (!cancel) setError('That training run is not in the database.')
      })
    return () => {
      cancel = true
    }
  }, [selected])

  return (
    <>
      {!ready ? (
        <p className="rq-wait">Opening saved training…</p>
      ) : runs.length > 0 ? (
        <section className="result-summary train-table" aria-label="Saved PhysNet training">
          {detail ? <h2>Saved training</h2> : null}
          <p className="lab-status">
            {runs.length} run{runs.length === 1 ? '' : 's'} · Asia/Shanghai · PhysNet weights stay on this Mac
          </p>
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Dataset</th>
                <th>Passes</th>
                <th>People</th>
                <th>Loss</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatTestWhen(run.startedAt)}</td>
                  <td>
                    <Link to={`/train-results/${run.id}`}>{run.name}</Link>
                  </td>
                  <td>{run.epochs}</td>
                  <td>{peopleLine(run)}</td>
                  <td>{lossText(run.finalLoss)}</td>
                  <td>{trainStatusLabel(run.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="rq-wait">No saved training yet. Choose a dataset and press Train.</p>
      )}
      {error ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
      {detail && runs.length > 0 ? (
        <div className="result-layout">
          <ul className="result-list">
            {runs.map((run) => (
              <li key={run.id}>
                <Link className={run.id === selected ? 'result-pick is-on' : 'result-pick'} to={`/train-results/${run.id}`}>
                  <time dateTime={run.startedAt}>{formatTestWhen(run.startedAt)}</time>
                  <span>
                    {run.name} · {lossText(run.finalLoss)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {open ? <RunDetail run={open} /> : selected ? <p className="rq-wait">Opening that run…</p> : null}
        </div>
      ) : null}
    </>
  )
}
