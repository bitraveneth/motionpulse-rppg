import { conflictRiskLabel } from '../lib/rppg/conflict'
import type { PipelineResult } from '../lib/rppg/pipeline'
import { ROI_IDS, ROI_LABELS } from '../lib/rppg/types'
import { reliabilityFromConflict } from '../lib/feed/reliability'
import { PulseSparkline } from './PulseSparkline'
import { ReliabilityBadge } from './ReliabilityBadge'
import { TrustDots } from './TrustDots'

type Props = {
  result: PipelineResult
  /** Optional face crop data URL from the analyzed clip */
  thumbnailData?: string | null
  /** SVG path for cleaned/candidate pulse */
  sparkline?: string | null
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
export function ResultStory({ result, thumbnailData, sparkline }: Props) {
  const risk = conflictRiskLabel(result.conflict.combined)
  const remark = reliabilityFromConflict(result.conflict.combined)
  const trusted = ROI_LABELS[topRoi(result)]
  const weights = Object.fromEntries(
    ROI_IDS.map((id) => [id, result.reliability.weights[id] ?? 0]),
  )

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

      <div className="result-story-hero">
        <div className="result-thumb-wrap">
          {thumbnailData ? (
            <img
              className="result-thumb"
              src={thumbnailData}
              alt=""
              width={96}
              height={96}
            />
          ) : (
            <div className="result-thumb result-thumb-placeholder" aria-hidden>
              <span>Pulse</span>
            </div>
          )}
        </div>
        <div className="result-story-hero-main">
          <div className="result-story-hero-row">
            <span className="result-hero-bpm">
              {result.gatedBpm.toFixed(0)}
              <span className="result-hero-bpm-unit">BPM</span>
            </span>
            <ReliabilityBadge remark={remark} showHeadline />
          </div>
          <p className="result-story-hero-sub">
            {risk.label} · score {result.conflict.combined.toFixed(2)} —{' '}
            {remark.headline}. High risk ≠ a health problem.
          </p>
          <PulseSparkline
            sparkline={sparkline}
            className="result-story-spark"
            label="Cleaned pulse waveform"
          />
          <TrustDots weights={weights} variant="dots" className="result-story-trust" />
        </div>
      </div>

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
            Most trusted skin region. Forehead / cheeks / lower face weights
            below.
          </span>
          <TrustDots weights={weights} variant="bars" />
        </div>
      </div>
    </section>
  )
}
