import { ROI_IDS, ROI_LABELS, type RoiId } from '../lib/rppg/types'
import type { RoiWeightsSummary } from '../lib/feed/types'

type Props = {
  weights: RoiWeightsSummary
  className?: string
}

const ZONE_META: Record<
  RoiId,
  { d: string; labelX: number; labelY: number; pctY: number }
> = {
  forehead: {
    d: 'M 28 26 L 72 26 L 68 48 L 32 48 Z',
    labelX: 50,
    labelY: 34,
    pctY: 44,
  },
  leftCheek: {
    d: 'M 22 50 L 42 48 L 44 78 L 24 80 Z',
    labelX: 33,
    labelY: 58,
    pctY: 68,
  },
  rightCheek: {
    d: 'M 78 50 L 58 48 L 56 78 L 76 80 Z',
    labelX: 67,
    labelY: 58,
    pctY: 68,
  },
  lowerFace: {
    d: 'M 34 82 L 66 82 L 62 108 L 38 108 Z',
    labelX: 50,
    labelY: 92,
    pctY: 102,
  },
}

/** Scan page: ROI trust as a compact face zone map (not bar debug UI). */
export function RegionTrustFaceMap({ weights, className = '' }: Props) {
  return (
    <figure
      className={`region-trust-map ${className}`}
      aria-label="Region trust by face zone"
    >
      <svg
        className="region-trust-map-svg"
        viewBox="0 0 100 128"
        role="img"
        aria-hidden
      >
        <ellipse
          className="region-trust-face-outline"
          cx="50"
          cy="62"
          rx="36"
          ry="48"
        />
        {ROI_IDS.map((id) => {
          const w = weights[id] ?? 0
          const pct = Math.round(w * 100)
          const dim = w < 0.12
          const meta = ZONE_META[id]
          const fillOpacity = dim
            ? Math.min(0.1, w * 0.85 + 0.04)
            : Math.min(0.62, 0.14 + w * 0.55)
          return (
            <g
              key={id}
              className={`region-trust-zone ${dim ? 'is-dim' : ''}`}
            >
              <path
                className="region-trust-zone-fill"
                d={meta.d}
                style={{ fillOpacity }}
              />
              <text
                className="region-trust-zone-label"
                x={meta.labelX}
                y={meta.labelY}
                textAnchor="middle"
              >
                {ROI_LABELS[id]}
              </text>
              <text
                className="region-trust-zone-pct tabular-nums"
                x={meta.labelX}
                y={meta.pctY}
                textAnchor="middle"
              >
                {pct}%
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="region-trust-map-caption">Region trust</figcaption>
    </figure>
  )
}
