import { ROI_IDS, ROI_LABELS, type RoiId } from '../lib/rppg/types'
import type { RoiWeightsSummary } from '../lib/feed/types'

type Props = {
  weights: RoiWeightsSummary
  /** Compact dots (feed), short bars (story), or % readout (vitals) */
  variant?: 'dots' | 'bars' | 'pct'
  className?: string
}

const SHORT: Record<RoiId, string> = {
  forehead: 'Forehead',
  leftCheek: 'L cheek',
  rightCheek: 'R cheek',
  lowerFace: 'Lower',
}

/** Forehead / L cheek / R cheek / lower face trust from ROI weights. */
export function TrustDots({
  weights,
  variant = 'dots',
  className = '',
}: Props) {
  if (variant === 'pct') {
    return (
      <ul className={`trust-pct ${className}`} aria-label="Region trust">
        {ROI_IDS.map((id) => {
          const w = weights[id] ?? 0
          const pct = Math.round(w * 100)
          return (
            <li key={id}>
              <span className="trust-pct-label">{SHORT[id]}</span>
              <span className="trust-bar-track" aria-hidden>
                <span
                  className="trust-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="trust-pct-value tabular-nums">{pct}%</span>
            </li>
          )
        })}
      </ul>
    )
  }

  if (variant === 'bars') {
    return (
      <ul className={`trust-mini-bars ${className}`} aria-label="Region trust">
        {ROI_IDS.map((id) => {
          const w = weights[id] ?? 0
          return (
            <li key={id}>
              <span>{SHORT[id]}</span>
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
    )
  }

  return (
    <ul className={`trust-dots ${className}`} aria-label="Region trust">
      {ROI_IDS.map((id) => {
        const w = weights[id] ?? 0
        const level = w < 0.15 ? 0 : w < 0.35 ? 1 : w < 0.55 ? 2 : 3
        return (
          <li key={id} title={`${ROI_LABELS[id]} ${(w * 100).toFixed(0)}%`}>
            <span className="trust-dot-label">{SHORT[id]}</span>
            <span className={`trust-dot level-${level}`} aria-hidden />
            <span className="sr-only">
              {ROI_LABELS[id]} {(w * 100).toFixed(0)} percent
            </span>
          </li>
        )
      })}
    </ul>
  )
}
