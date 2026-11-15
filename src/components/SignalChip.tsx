import { signalFace } from '../lib/feed/reliability'

/** One signal chip. Stable, Mixed, or Unreliable, with the reason on the same chip. */
export function SignalChip({ level }: { level: string }) {
  const face = signalFace(level)
  return (
    <span className={`signal-chip kind-${face.kind} level-${face.level}`}>
      <span className="signal-chip-dot" aria-hidden />
      <span className="signal-chip-copy">
        <strong>{face.badge}</strong>
        <small>{face.hint}</small>
      </span>
    </span>
  )
}
