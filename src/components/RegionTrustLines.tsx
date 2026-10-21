import { ROI_IDS, ROI_LABELS } from '../lib/rppg/types'
import type { RoiWeightsSummary } from '../lib/feed/types'

type Props = {
  weights: RoiWeightsSummary
  className?: string
}

/** Scan page: plain region trust rows (no face graphic). */
export function RegionTrustLines({ weights, className = '' }: Props) {
  return (
    <div className={`scan-region-trust ${className}`}>
      <h2 className="scan-region-trust-title">Region trust</h2>
      <ul className="scan-region-trust-list">
        {ROI_IDS.map((id) => {
          const w = weights[id] ?? 0
          const pct = Math.round(w * 100)
          const dim = w < 0.12
          return (
            <li
              key={id}
              className={`scan-region-trust-row ${dim ? 'is-dim' : ''}`}
            >
              <span className="scan-region-trust-label">{ROI_LABELS[id]}</span>
              <span className="scan-region-trust-track" aria-hidden>
                <span
                  className="scan-region-trust-fill"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="scan-region-trust-pct tabular-nums">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
