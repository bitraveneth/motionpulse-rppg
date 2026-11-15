import type { FeedDetail } from '../lib/feed/detail'
import type { LabSubjectRecord } from '../lib/lab/labTestApi'
import { formatTestWhen } from '../lib/lab/labTestApi'
import { SignalChip } from './SignalChip'

function breathNote(row: LabSubjectRecord): string | null {
  if (row.respiratoryRate == null || row.breathsInClip == null) return null
  const secs = Math.max(1, Math.round(row.durationSec))
  const count = row.breathsInClip.toFixed(1)
  if (secs === 10) return `${count} breaths in 10s, × 6`
  return `${count} breaths in ${secs}s`
}

function Detail({ detail }: { detail: FeedDetail }) {
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

export function SubjectResultCard({ row }: { row: LabSubjectRecord }) {
  const file =
    row.referenceBpm == null ? 'No file heart rate' : `File ${row.referenceBpm.toFixed(1)} BPM`
  const note = breathNote(row)
  return (
    <article className="post-card result-card">
      <header className="post-card-head">
        {row.thumb ? (
          <img className="post-card-avatar" src={row.thumb} alt="" />
        ) : (
          <span className="post-card-avatar post-card-avatar-fallback" aria-hidden>
            {row.subject.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="post-card-who">
          <strong className="post-card-name">{row.subject}</strong>
          <time className="post-card-time" dateTime={row.createdAt}>
            {formatTestWhen(row.createdAt)}
          </time>
        </div>
        <span className="post-card-source">
          {row.method} · {file}
        </span>
      </header>
      {row.thumb ? <img className="post-card-media" src={row.thumb} alt="" /> : null}
      <dl className="post-card-metrics">
        <div className="post-metric post-metric-hero">
          <dt>Heart rate</dt>
          <dd>
            {row.bpm.toFixed(0)}
            <span> BPM</span>
          </dd>
        </div>
        <div className="post-metric post-metric-hero post-metric-breath">
          <dt>Respiratory rate</dt>
          <dd>
            {row.respiratoryRate != null ? (
              <>
                {row.respiratoryRate.toFixed(0)}
                <span> / min</span>
                {note ? <span className="post-breath-count">{note}</span> : null}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="post-metric post-metric-signal">
          <dt>Signal</dt>
          <dd>
            <SignalChip level={row.risk} />
          </dd>
        </div>
        <div className="post-metric">
          <dt>Length</dt>
          <dd>
            {row.durationSec.toFixed(0)}
            <span> sec</span>
          </dd>
        </div>
      </dl>
      <Detail detail={row.detail} />
    </article>
  )
}
