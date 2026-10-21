type Props = {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'teal' | 'amber' | 'warn'
}

const tones = {
  neutral: 'bg-ink/5 text-ink',
  teal: 'bg-teal/10 text-teal-ink',
  amber: 'bg-amber/20 text-amber-ink',
  warn: 'bg-coral/15 text-coral-ink',
}

export function MetricPill({
  label,
  value,
  hint,
  tone = 'neutral',
}: Props) {
  return (
    <div
      className={`rounded-xl px-3 py-2 ${tones[tone]}`}
      title={hint}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg font-bold tabular-nums leading-tight">
        {value}
      </div>
    </div>
  )
}
