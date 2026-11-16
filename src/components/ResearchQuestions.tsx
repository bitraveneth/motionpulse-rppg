import type { ReactNode } from 'react'
import { researchReport, type MethodRun, type ResearchVerdict, type TrainedMiss } from '../lib/research/answers'

const VERDICT_LABEL: Record<ResearchVerdict, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Partly',
  wait: 'Not yet',
}

function shortName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
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

function Bars({ items, label }: { items: { name: string; value: number | null }[]; label: string }) {
  const shown = items.filter((item) => item.value != null)
  if (shown.length === 0) return null
  const max = Math.max(1, ...shown.map((item) => item.value ?? 0))
  const row = 36
  const width = 360
  const height = shown.length * row + 8
  const labelX = 8
  const barX = 132
  const barMax = 168
  return (
    <svg className="rq-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {shown.map((item, index) => {
        const bar = ((item.value ?? 0) / max) * barMax
        const y = index * row + 10
        return (
          <g key={`${item.name}-${index}`}>
            <text x={labelX} y={y + 14}>
              {shortName(item.name)}
            </text>
            <rect className="rq-track" x={barX} y={y} width={barMax} height="18" rx="9" />
            <rect className={index % 2 === 0 ? 'rq-bar rq-bar-a' : 'rq-bar rq-bar-b'} x={barX} y={y} width={Math.max(8, bar)} height="18" rx="9" />
            <text className="rq-bar-value" x={barX + barMax + 8} y={y + 13}>
              {(item.value ?? 0).toFixed(1)}
            </text>
          </g>
        )
      })}
    </svg>
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
    <article className="lab-q">
      <header className="rq-head">
        <p className="lab-q-num">{num}</p>
        <p className={`rq-answer rq-answer-${verdict}`}>{VERDICT_LABEL[verdict]}</p>
      </header>
      <h3>{title}</h3>
      <p>{sentence}</p>
      <Lines items={lines ?? []} />
      {children}
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
  return (
    <div className="lab-q-grid">
      <Question
        num="RQ1"
        title="Does the conflict score actually track real error?"
        verdict={report.rq1.verdict}
        sentence={report.rq1.sentence}
        lines={report.rq1.lines}
      >
        <Scatter points={report.rq1.points} />
        {report.rq1.plotLabel ? <p className="rq-note">{report.rq1.plotLabel}</p> : null}
      </Question>
      <Question
        num="RQ2"
        title="Does smarter face-region weighting help?"
        verdict={report.rq2.verdict}
        sentence={report.rq2.sentence}
        lines={report.rq2.lines}
      />
      <Question
        num="RQ3"
        title="Does the motion-aware method beat a plain baseline when motion is hard?"
        verdict={report.rq3.verdict}
        sentence={report.rq3.sentence}
        lines={report.rq3.lines}
      />
      <Question
        num="RQ4"
        title="Does it still work on a new camera / dataset?"
        verdict={report.rq4.verdict}
        sentence={report.rq4.sentence}
        lines={report.rq4.lines}
      >
        <Bars
          label="Miss by method and camera, BPM"
          items={report.rq4.sets.map((set) => ({ name: set.name, value: set.mae }))}
        />
      </Question>
    </div>
  )
}
