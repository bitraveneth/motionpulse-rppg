import type { ReliabilityRemark } from '../lib/feed/reliability'

type Props = {
  remark: ReliabilityRemark
  /** Show headline under the badge */
  showHeadline?: boolean
  className?: string
}

/** Stable / Mixed / Unreliable — signal quality, never heart health. */
export function ReliabilityBadge({
  remark,
  showHeadline = false,
  className = '',
}: Props) {
  return (
    <div className={`reliability-badge kind-${remark.kind} ${className}`}>
      <span className="reliability-pill">{remark.badge}</span>
      {showHeadline && (
        <span className="reliability-headline">{remark.headline}</span>
      )}
    </div>
  )
}
