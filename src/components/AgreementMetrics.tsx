import { useState } from 'react'
import type { ComparisonSummary } from '../lib/research/comparison'

function bpm1(value: number | null): string {
  return value == null ? '—' : value.toFixed(1)
}

export function Tip({ label, text, mark = '?' }: { label: string; text: string; mark?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="lab-tip">
      <button
        type="button"
        className="lab-tip-btn"
        aria-expanded={open}
        aria-label={`Tip for ${label}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        {mark}
      </button>
      {open ? <span className="lab-tip-note">{text}</span> : null}
    </span>
  )
}

function BlandAltmanPlot({ summary }: { summary: ComparisonSummary }) {
  const { points, bias, loaLow, loaHigh } = summary
  if (points.length === 0) return null
  const width = 640
  const height = 220
  const pad = { l: 48, r: 16, t: 16, b: 36 }
  const xs = points.map((point) => point.average)
  const ys = points.map((point) => point.difference)
  const guides = [bias, loaLow, loaHigh].filter((value): value is number => value != null)
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys, ...guides)
  let maxY = Math.max(...ys, ...guides)
  if (minX === maxX) {
    minX -= 5
    maxX += 5
  }
  if (minY === maxY) {
    minY -= 5
    maxY += 5
  }
  const xPad = (maxX - minX) * 0.08
  const yPad = (maxY - minY) * 0.12
  minX -= xPad
  maxX += xPad
  minY -= yPad
  maxY += yPad
  const sx = (value: number) => pad.l + ((value - minX) / (maxX - minX)) * (width - pad.l - pad.r)
  const sy = (value: number) => pad.t + ((maxY - value) / (maxY - minY)) * (height - pad.t - pad.b)
  const guide = (value: number | null, dashed: boolean) =>
    value == null ? null : (
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={sy(value)}
        y2={sy(value)}
        stroke="#1a7f72"
        strokeWidth={dashed ? 1 : 1.6}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
    )
  return (
    <svg className="lab-ba" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bland-Altman plot">
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke="rgba(20,36,51,0.25)" />
      <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="rgba(20,36,51,0.25)" />
      {guide(loaHigh, true)}
      {guide(loaLow, true)}
      {guide(bias, false)}
      {points.map((point, index) => (
        <circle key={index} cx={sx(point.average)} cy={sy(point.difference)} r="4.5" fill="#1a7f72" />
      ))}
      <text x={width / 2} y={height - 8} textAnchor="middle" fill="#4d6272" fontSize="11">
        Average of camera and reference, BPM
      </text>
      <text x="14" y={height / 2} textAnchor="middle" fill="#4d6272" fontSize="11" transform={`rotate(-90 14 ${height / 2})`}>
        Camera − reference
      </text>
    </svg>
  )
}

export function AgreementMetrics({ summary }: { summary: ComparisonSummary }) {
  return (
    <div className="lab-agreement">
      <div className="lab-metric-grid">
        <article className="rq-card">
          <p className="rq-id">
            MAE
            <Tip label="MAE" text="Average absolute gap, in BPM." />
          </p>
          <p className="rq-stat">
            {bpm1(summary.mae)}
            <span>BPM</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">
            RMSE
            <Tip label="RMSE" text="Same gaps, squared first, so large misses count more." />
          </p>
          <p className="rq-stat">
            {bpm1(summary.rmse)}
            <span>BPM</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">
            Pearson r
            <Tip label="Pearson r" text="How the two heart rates move together. Needs two labeled runs." />
          </p>
          <p className="rq-stat">
            {summary.pearson == null ? '—' : summary.pearson.toFixed(2)}
            <span>r</span>
          </p>
        </article>
        <article className="rq-card">
          <p className="rq-id">
            SNR
            <Tip label="SNR" text="Pulse-band peak divided by the other bins in that band." />
          </p>
          <p className="rq-stat">
            {summary.snrMean == null ? '—' : summary.snrMean.toFixed(1)}
            <span>{summary.snrDb == null ? 'ratio' : `${summary.snrDb.toFixed(1)} dB`}</span>
          </p>
        </article>
      </div>
      <article className="rq-card lab-ba-card">
        <p className="rq-id">
          Bland–Altman
          <Tip label="Bland–Altman" text="Bias, and the band bias ± 1.96 SD." />
        </p>
        <p className="rq-stat">
          {bpm1(summary.bias)}
          <span>
            {summary.loaLow == null || summary.loaHigh == null
              ? 'bias, BPM'
              : `${bpm1(summary.loaLow)} to ${bpm1(summary.loaHigh)} BPM`}
          </span>
        </p>
        <BlandAltmanPlot summary={summary} />
      </article>
    </div>
  )
}
