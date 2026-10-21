import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import { ROI_IDS, ROI_LABELS } from '../lib/rppg/types'

type Props = {
  result: PipelineResult
}

function topRoi(result: PipelineResult) {
  let top = ROI_IDS[0]!
  let w = -1
  for (const id of ROI_IDS) {
    if ((result.reliability.weights[id] ?? 0) > w) {
      w = result.reliability.weights[id]!
      top = id
    }
  }
  return top
}

/** Polished “result story” card after a run. */
export function ResultStory({ result }: Props) {
  const risk = conflictRiskLabel(result.conflict.combined)
  const trusted = ROI_LABELS[topRoi(result)]
  const trustFocus =
    result.reliability.entropy < 1.2
      ? 'concentrated'
      : result.reliability.entropy < 1.6
        ? 'balanced'
        : 'spread out'

  return (
    <section className="result-story" aria-label="Result story">
      <div className="result-story-glow" aria-hidden />
      <header className="result-story-head">
        <p className="result-story-kicker">Your result story</p>
        <h2>Pulse, motion risk, and trust</h2>
        <p>
          A short read of this run — educational estimate only, not a medical
          reading.
        </p>
      </header>

      <div className="result-story-grid">
        <div className="result-beat result-beat-bpm">
          <span className="result-beat-label">Estimated BPM</span>
          <span className="result-beat-value" data-animate="count">
            {result.gatedBpm.toFixed(0)}
          </span>
          <span className="result-beat-sub">
            Raw {result.estimatedBpm.toFixed(0)} → cleaned{' '}
            {result.gatedBpm.toFixed(0)}
          </span>
          <span className="result-pulse-ring" aria-hidden />
        </div>

        <div className={`result-beat result-beat-risk risk-${risk.level}`}>
          <span className="result-beat-label">Motion risk</span>
          <span className="result-beat-value result-beat-sm">{risk.label}</span>
          <span className="result-beat-sub">
            Score {result.conflict.combined.toFixed(2)} — {risk.blurb}
          </span>
        </div>

        <div className="result-beat result-beat-trust">
          <span className="result-beat-label">Trust summary</span>
          <span className="result-beat-value result-beat-sm">{trusted}</span>
          <span className="result-beat-sub">
            Most trusted skin region. Focus looks {trustFocus} across the face.
          </span>
          <ul className="trust-bars" aria-label="Region trust weights">
            {ROI_IDS.map((id) => {
              const w = result.reliability.weights[id] ?? 0
              return (
                <li key={id}>
                  <span>{ROI_LABELS[id]}</span>
                  <span className="trust-bar-track">
                    <span
                      className="trust-bar-fill"
                      style={{ width: `${Math.round(w * 100)}%` }}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
