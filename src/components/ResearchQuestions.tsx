import type { ReactNode } from 'react'
import {
  researchReport,
  type ComparePair,
  type MethodRun,
  type ResearchVerdict,
  type TrainedMiss,
} from '../lib/research/answers'

const VERDICT_LABEL: Record<ResearchVerdict, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Partly',
  wait: 'Not yet',
}

function trend(points: { conflict: number; error: number }[]): { at: (x: number) => number } | null {
  if (points.length < 2) return null
  const n = points.length
  const meanX = points.reduce((sum, point) => sum + point.conflict, 0) / n
  const meanY = points.reduce((sum, point) => sum + point.error, 0) / n
  let num = 0
  let den = 0
  for (const point of points) {
    num += (point.conflict - meanX) * (point.error - meanY)
    den += (point.conflict - meanX) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  const intercept = meanY - slope * meanX
  return { at: (x) => intercept + slope * x }
}

function Scatter({ points }: { points: { conflict: number; error: number }[] }) {
  if (points.length === 0) return null
  const width = 360
  const height = 210
  const pad = { l: 46, r: 16, t: 16, b: 36 }
  const maxY = Math.max(10, Math.ceil(Math.max(...points.map((point) => point.error)) / 10) * 10)
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const xOf = (conflict: number) => pad.l + Math.min(1, Math.max(0, conflict)) * plotW
  const yOf = (error: number) => pad.t + (1 - Math.min(maxY, Math.max(0, error)) / maxY) * plotH
  const line = trend(points)
  const yTicks = [0, maxY / 2, maxY]
  const xTicks = [0, 0.5, 1]
  return (
    <svg className="rq-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Conflict against heart-rate miss">
      {yTicks.map((tick) => (
        <g key={tick}>
          <line className="rq-grid" x1={pad.l} y1={yOf(tick)} x2={width - pad.r} y2={yOf(tick)} />
          <text x={pad.l - 8} y={yOf(tick) + 4} textAnchor="end">
            {tick.toFixed(0)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text key={tick} x={xOf(tick)} y={height - 16} textAnchor="middle">
          {tick.toFixed(1)}
        </text>
      ))}
      <line className="rq-axis" x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} />
      <line className="rq-axis" x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} />
      {line ? (
        <line
          className="rq-trend"
          x1={xOf(0)}
          y1={yOf(line.at(0))}
          x2={xOf(1)}
          y2={yOf(line.at(1))}
        />
      ) : null}
      {points.map((point, index) => (
        <circle key={index} className="rq-dot" cx={xOf(point.conflict)} cy={yOf(point.error)} r="4.5" />
      ))}
      <text className="rq-axis-name" x={(pad.l + width - pad.r) / 2} y={height - 2} textAnchor="middle">
        Conflict
      </text>
      <text className="rq-axis-name" x="14" y={pad.t + 4}>
        BPM
      </text>
    </svg>
  )
}

function Legend({ items }: { items: { name: string; tone: 'a' | 'b' }[] }) {
  return (
    <div className="rq-legend">
      {items.map((item) => (
        <span key={item.name}>
          <i className={`rq-swatch rq-swatch-${item.tone}`} aria-hidden />
          {item.name}
        </span>
      ))}
    </div>
  )
}

function meterWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return '0%'
  return `${Math.max(3, (value / max) * 100)}%`
}

function CompareChart({
  pairs,
  leftLabel,
  rightLabel,
}: {
  pairs: ComparePair[]
  leftLabel: string
  rightLabel: string
}) {
  if (pairs.length === 0) return null
  const max = Math.max(1, ...pairs.flatMap((pair) => [pair.left, pair.right]))
  return (
    <figure className="rq-chart" aria-label={`${leftLabel} against ${rightLabel}`}>
      <Legend
        items={[
          { name: leftLabel, tone: 'a' },
          { name: rightLabel, tone: 'b' },
        ]}
      />
      <ul className="rq-groups">
        {pairs.map((pair) => (
          <li key={`${pair.name}-${pair.detail}`}>
            <p className="rq-group-name">
              {pair.name}
              {pair.detail ? <span>{pair.detail}</span> : null}
            </p>
            <div className="rq-meter">
              <span className="rq-meter-label">{leftLabel}</span>
              <span className="rq-meter-track">
                <span className="rq-meter-fill rq-fill-a" style={{ width: meterWidth(pair.left, max) }} />
              </span>
              <span className="rq-meter-value">{pair.left.toFixed(1)}</span>
            </div>
            <div className="rq-meter">
              <span className="rq-meter-label">{rightLabel}</span>
              <span className="rq-meter-track">
                <span className="rq-meter-fill rq-fill-b" style={{ width: meterWidth(pair.right, max) }} />
              </span>
              <span className="rq-meter-value">{pair.right.toFixed(1)}</span>
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="rq-chart-note">Longer bar means a larger miss, in BPM.</figcaption>
    </figure>
  )
}

function MeterChart({ items, label }: { items: { name: string; value: number | null; detail?: string }[]; label: string }) {
  const shown = items.filter((item): item is { name: string; value: number; detail?: string } => item.value != null)
  if (shown.length === 0) return null
  const max = Math.max(1, ...shown.map((item) => item.value))
  return (
    <figure className="rq-chart" aria-label={label}>
      <Legend items={[{ name: label, tone: 'b' }]} />
      <ul className="rq-groups">
        {shown.map((item) => (
          <li key={item.name}>
            <p className="rq-group-name">
              {item.name}
              {item.detail ? <span>{item.detail}</span> : null}
            </p>
            <div className="rq-meter rq-meter-solo">
              <span className="rq-meter-track">
                <span className="rq-meter-fill rq-fill-b" style={{ width: meterWidth(item.value, max) }} />
              </span>
              <span className="rq-meter-value">{item.value.toFixed(1)}</span>
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="rq-chart-note">Longer bar means a larger miss, in BPM.</figcaption>
    </figure>
  )
}

function Lines({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="rq-lines">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  )
}

function Question({
  num,
  title,
  verdict,
  sentence,
  lines,
  children,
}: {
  num: string
  title: string
  verdict: ResearchVerdict
  sentence: string
  lines?: string[]
  children?: ReactNode
}) {
  return (
    <article className={`lab-q rq-mark-${verdict}`}>
      <header className="rq-head">
        <p className="lab-q-num">{num}</p>
        <p className={`rq-answer rq-answer-${verdict}`}>{VERDICT_LABEL[verdict]}</p>
      </header>
      <h3>{title}</h3>
      <p className="rq-sentence">{sentence}</p>
      {children}
      <Lines items={lines ?? []} />
    </article>
  )
}

export function ResearchQuestions({
  runs,
  trained = [],
}: {
  runs: MethodRun[]
  trained?: TrainedMiss[]
}) {
  const report = researchReport(runs, trained)
  const trainedLines = report.rq4.lines.filter((line) => line.startsWith('PhysNet'))
  return (
    <div className="lab-q-grid">
      <Question
        num="RQ1"
        title="Does the conflict score actually track real error?"
        verdict={report.rq1.verdict}
        sentence={report.rq1.sentence}
        lines={report.rq1.lines}
      >
        {report.rq1.points.length > 0 ? (
          <figure className="rq-chart">
            <Scatter points={report.rq1.points} />
            <figcaption className="rq-chart-note">
              {report.rq1.plotLabel ? `${report.rq1.plotLabel}. ` : ''}
              Each dot is one video. The dashed line is the trend.
            </figcaption>
          </figure>
        ) : null}
      </Question>
      <Question
        num="RQ2"
        title="Does smarter face-region weighting help?"
        verdict={report.rq2.verdict}
        sentence={report.rq2.sentence}
        lines={report.rq2.pairs.length > 0 ? [] : report.rq2.lines}
      >
        <CompareChart pairs={report.rq2.pairs} leftLabel="Equal mix" rightLabel="Trust weight" />
      </Question>
      <Question
        num="RQ3"
        title="Does the motion-aware method beat a plain baseline when motion is hard?"
        verdict={report.rq3.verdict}
        sentence={report.rq3.sentence}
        lines={report.rq3.pairs.length > 0 ? [] : report.rq3.lines}
      >
        <CompareChart
          pairs={report.rq3.pairs}
          leftLabel={report.rq3.leftLabel}
          rightLabel={report.rq3.rightLabel}
        />
      </Question>
      <Question
        num="RQ4"
        title="Does it still work on a new camera / dataset?"
        verdict={report.rq4.verdict}
        sentence={report.rq4.sentence}
        lines={report.rq4.sets.length > 0 ? trainedLines : report.rq4.lines}
      >
        <MeterChart
          label="Miss"
          items={report.rq4.sets.map((set) => ({
            name: set.name,
            value: set.mae,
            detail: set.count > 0 ? `${set.count} videos` : undefined,
          }))}
        />
      </Question>
    </div>
  )
}
