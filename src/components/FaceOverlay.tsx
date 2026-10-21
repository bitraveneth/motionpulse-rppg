import type { FrameLandmarks, RoiId } from '../lib/rppg/types'
import { ROI_IDS, ROI_LABELS } from '../lib/rppg/types'
import { ROI_LANDMARK_INDICES } from '../lib/rppg/motion'

const ROI_COLORS: Record<RoiId, string> = {
  forehead: '#0F4C4A',
  leftCheek: '#2A7A75',
  rightCheek: '#3D9B94',
  lowerFace: '#C4784A',
}

type Props = {
  landmarks: FrameLandmarks | null
  weights: Record<RoiId, number>
  className?: string
}

export function FaceOverlay({ landmarks, weights, className = '' }: Props) {
  if (!landmarks || landmarks.length === 0) {
    return (
      <div
        className={`flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-ink/20 bg-ink/[0.03] text-sm text-ink/45 ${className}`}
      >
        No face landmarks in this window
      </div>
    )
  }

  const w = 200
  const h = 250

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full rounded-xl bg-gradient-to-b from-[#d9ebe8] to-[#eef4f1]"
        role="img"
        aria-label="Face ROI reliability overlay"
      >
        {ROI_IDS.map((roi) => {
          const idxs = ROI_LANDMARK_INDICES[roi]
          const pts = idxs
            .map((i) => landmarks[i])
            .filter(Boolean)
            .map((p) => `${p!.x * w},${p!.y * h}`)
            .join(' ')
          if (!pts) return null
          const weight = weights[roi] ?? 0
          return (
            <polygon
              key={roi}
              points={pts}
              fill={ROI_COLORS[roi]}
              fillOpacity={0.15 + weight * 0.55}
              stroke={ROI_COLORS[roi]}
              strokeWidth={1.5}
              strokeOpacity={0.85}
            />
          )
        })}
        {landmarks.slice(0, 80).map((p, i) => (
          <circle
            key={i}
            cx={p.x * w}
            cy={p.y * h}
            r={1.1}
            fill="#0F4C4A"
            opacity={0.35}
          />
        ))}
      </svg>
      <ul className="mt-3 space-y-1.5">
        {ROI_IDS.map((roi) => (
          <li key={roi} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: ROI_COLORS[roi] }}
            />
            <span className="w-24 text-ink/70">{ROI_LABELS[roi]}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((weights[roi] ?? 0) * 100)}%`,
                  background: ROI_COLORS[roi],
                }}
              />
            </div>
            <span className="w-10 text-right tabular-nums text-ink/60">
              {((weights[roi] ?? 0) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
