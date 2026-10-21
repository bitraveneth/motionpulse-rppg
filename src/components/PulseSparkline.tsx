import { SPARKLINE_H, SPARKLINE_W } from '../lib/feed/cardMedia'

type Props = {
  /** SVG path `d`, or a tiny image data URL */
  sparkline: string | null | undefined
  className?: string
  label?: string
}

/** Tiny pulse waveform for result / feed cards. */
export function PulseSparkline({
  sparkline,
  className = '',
  label = 'Pulse waveform',
}: Props) {
  if (!sparkline) {
    return (
      <span className={`pulse-spark empty ${className}`} aria-hidden>
        —
      </span>
    )
  }

  if (sparkline.startsWith('data:image')) {
    return (
      <img
        className={`pulse-spark-img ${className}`}
        src={sparkline}
        alt=""
        width={SPARKLINE_W}
        height={SPARKLINE_H}
      />
    )
  }

  return (
    <svg
      className={`pulse-spark ${className}`}
      viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
      width={SPARKLINE_W}
      height={SPARKLINE_H}
      role="img"
      aria-label={label}
    >
      <path
        d={sparkline}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
