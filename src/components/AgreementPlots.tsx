import type { ComparisonSummary } from '../lib/research/comparison'

const WIDTH = 360
const HEIGHT = 230
const PAD = { l: 42, r: 14, t: 12, b: 36 }

function span(values: number[], guides: number[] = []): { min: number; max: number } {
  let min = Math.min(...values, ...guides)
  let max = Math.max(...values, ...guides)
  if (min === max) {
    min -= 5
    max += 5
  }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

function ticks(min: number, max: number): number[] {
  return [0, 0.5, 1].map((t) => min + (max - min) * t)
}

function Axis({
  xOf,
  yOf,
  xTicks,
  yTicks,
  xLabel,
}: {
  xOf: (value: number) => number
  yOf: (value: number) => number
  xTicks: number[]
  yTicks: number[]
  xLabel: string
}) {
  const plotBottom = HEIGHT - PAD.b
  const plotRight = WIDTH - PAD.r
  return (
    <>
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line className="findings-grid" x1={PAD.l} x2={plotRight} y1={yOf(tick)} y2={yOf(tick)} />
          <text x={PAD.l - 6} y={yOf(tick) + 4} textAnchor="end">
            {tick.toFixed(0)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text key={`x-${tick}`} x={xOf(tick)} y={HEIGHT - 16} textAnchor="middle">
          {tick.toFixed(0)}
        </text>
      ))}
      <line className="findings-axis" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={plotBottom} />
      <line className="findings-axis" x1={PAD.l} y1={plotBottom} x2={plotRight} y2={plotBottom} />
      <text className="findings-axis-name" x={(PAD.l + plotRight) / 2} y={HEIGHT - 2} textAnchor="middle">
        {xLabel}
      </text>
    </>
  )
}

function ScatterPlot({ summary }: { summary: ComparisonSummary }) {
  const pairs = summary.points.map((point) => ({
    camera: point.average + point.difference / 2,
    file: point.average - point.difference / 2,
  }))
  const range = span([...pairs.map((pair) => pair.camera), ...pairs.map((pair) => pair.file)])
  const plotW = WIDTH - PAD.l - PAD.r
  const plotH = HEIGHT - PAD.t - PAD.b
  const xOf = (value: number) => PAD.l + ((value - range.min) / (range.max - range.min)) * plotW
  const yOf = (value: number) => PAD.t + ((range.max - value) / (range.max - range.min)) * plotH
  const marks = ticks(range.min, range.max)
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Camera heart rate against the file heart rate">
      <Axis xOf={xOf} yOf={yOf} xTicks={marks} yTicks={marks} xLabel="Camera BPM" />
      <line className="findings-identity" x1={xOf(range.min)} y1={yOf(range.min)} x2={xOf(range.max)} y2={yOf(range.max)} />
      {pairs.map((pair, index) => (
        <circle key={index} className="findings-dot" cx={xOf(pair.camera)} cy={yOf(pair.file)} r="3.4" />
      ))}
    </svg>
  )
}

function BlandAltmanPlot({ summary }: { summary: ComparisonSummary }) {
  const xs = summary.points.map((point) => point.average)
  const ys = summary.points.map((point) => point.difference)
  const guides = [summary.bias, summary.loaLow, summary.loaHigh].filter((value): value is number => value != null)
  const xRange = span(xs)
  const yRange = span(ys, guides)
  const plotW = WIDTH - PAD.l - PAD.r
  const plotH = HEIGHT - PAD.t - PAD.b
  const xOf = (value: number) => PAD.l + ((value - xRange.min) / (xRange.max - xRange.min)) * plotW
  const yOf = (value: number) => PAD.t + ((yRange.max - value) / (yRange.max - yRange.min)) * plotH
  const guide = (value: number | null, strong: boolean) =>
    value == null ? null : (
      <line
        className={strong ? 'findings-identity' : 'findings-limit'}
        x1={PAD.l}
        x2={WIDTH - PAD.r}
        y1={yOf(value)}
        y2={yOf(value)}
      />
    )
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Bland-Altman plot of camera minus file">
      <Axis
        xOf={xOf}
        yOf={yOf}
        xTicks={ticks(xRange.min, xRange.max)}
        yTicks={ticks(yRange.min, yRange.max)}
        xLabel="Mean of the two rates"
      />
      {guide(summary.loaHigh, false)}
      {guide(summary.loaLow, false)}
      {guide(summary.bias, true)}
      {summary.points.map((point, index) => (
        <circle key={index} className="findings-dot" cx={xOf(point.average)} cy={yOf(point.difference)} r="3.4" />
      ))}
    </svg>
  )
}

function ErrorHistogram({ summary }: { summary: ComparisonSummary }) {
  const gaps = summary.points.map((point) => Math.abs(point.difference))
  const binCount = 8
  const max = Math.max(5, ...gaps)
  const step = max / binCount
  const counts = Array.from({ length: binCount }, () => 0)
  for (const gap of gaps) {
    const index = Math.min(binCount - 1, Math.floor(gap / step))
    counts[index] += 1
  }
  const plotW = WIDTH - PAD.l - PAD.r
  const plotH = HEIGHT - PAD.t - PAD.b
  const peak = Math.max(...counts, 1)
  const yMax = Math.ceil(peak * 1.15)
  const xOf = (value: number) => PAD.l + (value / max) * plotW
  const yOf = (value: number) => PAD.t + ((yMax - value) / yMax) * plotH
  const barW = plotW / binCount
  const curve = counts
    .map((count, index) => `${index === 0 ? 'M' : 'L'} ${xOf((index + 0.5) * step)} ${yOf(count)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="How many videos fall in each size of miss">
      <Axis
        xOf={(value) => xOf(value)}
        yOf={yOf}
        xTicks={ticks(0, max)}
        yTicks={ticks(0, yMax)}
        xLabel="Absolute miss, BPM"
      />
      {counts.map((count, index) => (
        <rect
          key={index}
          className="findings-bar"
          x={PAD.l + index * barW + 2}
          y={yOf(count)}
          width={Math.max(0, barW - 4)}
          height={Math.max(0, yOf(0) - yOf(count))}
          rx="3"
        />
      ))}
      <path className="findings-identity" d={curve} />
    </svg>
  )
}

function one(value: number | null): string {
  return value == null ? '—' : value.toFixed(1)
}

export function AgreementPlots({ name, summary }: { name: string; summary: ComparisonSummary }) {
  if (summary.points.length === 0) return null
  return (
    <div className="findings-run">
      <h3>{name}</h3>
      <div className="findings-plots">
        <figure>
          <figcaption>Camera against the file rate. The line is perfect agreement.</figcaption>
          <ScatterPlot summary={summary} />
        </figure>
        <figure>
          <figcaption>
            Bland–Altman. Mean {one(summary.bias)} BPM. Limits {one(summary.loaLow)} to {one(summary.loaHigh)}.
          </figcaption>
          <BlandAltmanPlot summary={summary} />
        </figure>
        <figure>
          <figcaption>How large the miss is, one bar for each band of BPM.</figcaption>
          <ErrorHistogram summary={summary} />
        </figure>
      </div>
    </div>
  )
}
