/**
 * Local batch over dataset folders (UBFC / PURE / etc.).
 *
 * Reuses `src/lib/rppg` via tsx. MediaPipe Face Landmarker is browser-only,
 * so this CLI:
 *  1. Prefers companion JSON traces (`*.motionpulse.json` or `traces.json`)
 *  2. Otherwise runs a documented synthetic proxy seeded from the video path
 *     (useful for wiring publish + CSV without GPU/headless MediaPipe)
 *
 * Never commits datasets. Writes metrics only to out/batch-results.json + .csv
 *
 * Usage: npm run batch -- ./data/UBFC
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { conflictRiskLabel } from '../src/lib/rppg/conflict.ts'
import { runPipeline } from '../src/lib/rppg/pipeline.ts'
import { generateSyntheticSample } from '../src/lib/rppg/synthetic.ts'
import {
  DEFAULT_CONTROLS,
  ROI_IDS,
  type FrameLandmarks,
  type RoiRgbTrace,
} from '../src/lib/rppg/types.ts'

const VIDEO_EXT = new Set(['.avi', '.mp4', '.mov', '.webm', '.m4v'])

type BatchRow = {
  id: string
  path: string
  subject: string
  source: 'batch'
  analysis: 'companion_json' | 'synthetic_proxy'
  bpm: number
  conflict_score: number
  risk_level: string
  roi_weights: Record<string, number>
  sample_rate_hz: number
  frames: number
}

function walkVideos(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
      } else if (VIDEO_EXT.has(extname(name).toLowerCase())) {
        out.push(full)
      }
    }
  }
  return out.sort()
}

function findCompanionJson(videoPath: string): string | null {
  const dir = join(videoPath, '..')
  const base = basename(videoPath, extname(videoPath))
  const candidates = [
    join(dir, `${base}.motionpulse.json`),
    join(dir, `${base}.json`),
    join(dir, 'traces.json'),
    join(dir, 'motionpulse.json'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function hashSeed(s: string): number {
  const h = createHash('sha256').update(s).digest()
  return h.readUInt32BE(0) >>> 0
}

function loadCompanion(path: string): {
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  sampleRateHz: number
} | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      frames?: FrameLandmarks[]
      roiRgb?: RoiRgbTrace
      sampleRateHz?: number
    }
    if (
      !raw.frames ||
      !raw.roiRgb ||
      raw.frames.length < 16 ||
      !raw.sampleRateHz
    ) {
      return null
    }
    return {
      frames: raw.frames,
      roiRgb: raw.roiRgb,
      sampleRateHz: raw.sampleRateHz,
    }
  } catch {
    return null
  }
}

function subjectFromPath(videoPath: string, root: string): string {
  const rel = relative(root, videoPath)
  const parts = rel.split(/[/\\]/)
  return parts[0] || basename(videoPath)
}

function analyzeVideo(videoPath: string, root: string): BatchRow {
  const companion = findCompanionJson(videoPath)
  let frames: FrameLandmarks[]
  let roiRgb: RoiRgbTrace
  let sampleRateHz: number
  let analysis: BatchRow['analysis']

  const loaded = companion ? loadCompanion(companion) : null
  if (loaded) {
    frames = loaded.frames
    roiRgb = loaded.roiRgb
    sampleRateHz = loaded.sampleRateHz
    analysis = 'companion_json'
  } else {
    const seed = hashSeed(videoPath)
    const pulseBpm = 55 + (seed % 45)
    const motionArtifactAmp = 0.15 + ((seed >>> 8) % 50) / 100
    const sample = generateSyntheticSample({
      durationSec: 10,
      sampleRateHz: 30,
      pulseBpm,
      motionArtifactAmp,
      seed,
    })
    frames = sample.frames
    roiRgb = sample.roiRgb
    sampleRateHz = sample.sampleRateHz
    analysis = 'synthetic_proxy'
  }

  const result = runPipeline({
    frames,
    roiRgb,
    sampleRateHz,
    controls: DEFAULT_CONTROLS,
  })
  const risk = conflictRiskLabel(result.conflict.combined)
  const roi_weights: Record<string, number> = {}
  for (const id of ROI_IDS) {
    roi_weights[id] = Number((result.reliability.weights[id] ?? 0).toFixed(4))
  }

  return {
    id: createHash('sha1').update(videoPath).digest('hex').slice(0, 16),
    path: relative(root, videoPath) || basename(videoPath),
    subject: subjectFromPath(videoPath, root),
    source: 'batch',
    analysis,
    bpm: Number(result.gatedBpm.toFixed(1)),
    conflict_score: Number(result.conflict.combined.toFixed(3)),
    risk_level: risk.level,
    roi_weights,
    sample_rate_hz: sampleRateHz,
    frames: frames.length,
  }
}

function toCsv(rows: BatchRow[]): string {
  const header = [
    'id',
    'path',
    'subject',
    'analysis',
    'bpm',
    'conflict_score',
    'risk_level',
    'roi_forehead',
    'roi_leftCheek',
    'roi_rightCheek',
    'roi_lowerFace',
    'frames',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.id,
        csvEscape(r.path),
        csvEscape(r.subject),
        r.analysis,
        r.bpm,
        r.conflict_score,
        r.risk_level,
        r.roi_weights.forehead ?? '',
        r.roi_weights.leftCheek ?? '',
        r.roi_weights.rightCheek ?? '',
        r.roi_weights.lowerFace ?? '',
        r.frames,
      ].join(','),
    )
  }
  return lines.join('\n') + '\n'
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: npm run batch -- <dataset-root>')
    console.error('Example: npm run batch -- ./data/UBFC')
    process.exit(1)
  }

  const root = resolve(arg)
  if (!existsSync(root)) {
    console.error(`Path not found: ${root}`)
    process.exit(1)
  }

  const videos = walkVideos(root)
  if (videos.length === 0) {
    console.error(`No video files (.avi/.mp4/.mov/.webm) under ${root}`)
    process.exit(1)
  }

  console.log(`Found ${videos.length} video(s) under ${root}`)
  const rows: BatchRow[] = []
  let proxy = 0
  let companion = 0

  for (const v of videos) {
    const row = analyzeVideo(v, root)
    rows.push(row)
    if (row.analysis === 'synthetic_proxy') proxy += 1
    else companion += 1
    console.log(
      `  [${row.analysis}] ${row.path} → ${row.bpm} BPM, risk ${row.risk_level}`,
    )
  }

  const outDir = resolve('out')
  mkdirSync(outDir, { recursive: true })
  const jsonPath = join(outDir, 'batch-results.json')
  const csvPath = join(outDir, 'batch-results.csv')

  const payload = {
    generated_at: new Date().toISOString(),
    root,
    count: rows.length,
    companion_json: companion,
    synthetic_proxy: proxy,
    note:
      'MediaPipe is browser-only. Without companion *.motionpulse.json traces, batch uses a synthetic proxy seeded by path so CSV/publish wiring works. Prefer exporting traces from the web UI for real landmark analysis.',
    privacy:
      'Metrics summaries only — never include raw face video in publish output.',
    results: rows,
  }

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
  writeFileSync(csvPath, toCsv(rows))

  console.log(`\nWrote ${jsonPath}`)
  console.log(`Wrote ${csvPath}`)
  console.log(
    `Summary: ${companion} companion JSON, ${proxy} synthetic proxy. Next: npm run publish-results`,
  )
}

main()
