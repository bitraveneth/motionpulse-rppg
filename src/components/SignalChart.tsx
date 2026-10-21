type Series = {
  values: number[]
  color: string
  label?: string
}

type Props = {
  series: Series[]
  height?: number
  className?: string
  /** Highlight x-range as fraction [0,1] of width — unused; keep simple. */
  emptyLabel?: string
}

function normalizeSeries(values: number[]): number[] {
  if (values.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min || 1
  return values.map((v) => (v - min) / span)
}

export function SignalChart({
  series,
  height = 120,
  className = '',
  emptyLabel = 'No signal yet',
}: Props) {
  const w = 400
  const h = height
  const pad = 8
  const hasData = series.some((s) => s.values.length > 1)

  if (!hasData) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-ink/5 text-sm text-ink/50 ${className}`}
        style={{ height }}
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Signal chart"
      >
        {series.map((s, si) => {
          const norm = normalizeSeries(s.values)
          if (norm.length < 2) return null
          const pts = norm
            .map((v, i) => {
              const x = pad + (i / (norm.length - 1)) * (w - pad * 2)
              const y = pad + (1 - v) * (h - pad * 2)
              return `${x.toFixed(2)},${y.toFixed(2)}`
            })
            .join(' ')
          return (
            <polyline
              key={si}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pts}
              opacity={0.92}
            />
          )
        })}
      </svg>
      {series.some((s) => s.label) && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink/60">
          {series.map(
            (s, i) =>
              s.label && (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
              ),
          )}
        </div>
      )}
    </div>
  )
}

type SpectrumProps = {
  freqs: number[]
  power: number[]
  bandHz: [number, number]
  color?: string
  height?: number
  className?: string
}

export function SpectrumChart({
  freqs,
  power,
  bandHz,
  color = '#0F4C4A',
  height = 100,
  className = '',
}: SpectrumProps) {
  const w = 400
  const h = height
  if (freqs.length < 2) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-ink/5 text-sm text-ink/50 ${className}`}
        style={{ height }}
      >
        No spectrum
      </div>
    )
  }

  const maxF = freqs[freqs.length - 1] || 1
  const maxP = Math.max(...power, 1e-12)
  const [fLo, fHi] = bandHz
  const xLo = (fLo / maxF) * w
  const xHi = (fHi / maxF) * w

  const bars = freqs.map((f, i) => {
    const x = (f / maxF) * w
    const bh = (Math.sqrt(power[i]! / maxP) * (h - 4)) | 0
    return { x, bh, inBand: f >= fLo && f <= fHi }
  })

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img">
        <rect
          x={xLo}
          y={0}
          width={Math.max(0, xHi - xLo)}
          height={h}
          fill="rgba(232, 192, 122, 0.22)"
        />
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={h - b.bh}
            width={Math.max(1.2, w / freqs.length)}
            height={b.bh}
            fill={b.inBand ? color : `${color}55`}
          />
        ))}
      </svg>
      <p className="mt-1 text-xs text-ink/50">
        Highlight = physiological band ({fLo}–{fHi} Hz)
      </p>
    </div>
  )
}
