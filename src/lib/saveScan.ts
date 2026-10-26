import { loadContent } from './content'
import type { PipelineResult } from './rppg/pipeline'
import { ROI_IDS } from './rppg/types'

/** Bump when the pipeline output meaningfully changes. */
export const PIPELINE_VERSION = 'web-0.2.0'

const MAX_WAVEFORM = 240

let serverSessionId: string | null = null
let chain: Promise<void> = Promise.resolve()

/** A cleared strip or a fresh page visit starts a new server session. */
export function resetScanSave(): void {
  serverSessionId = null
}

export type SettledClip = {
  source: 'sample' | 'upload' | 'webcam'
  pipeline: PipelineResult | null
  settledBpm: number | null
  respiratoryBpm: number | null
  riskLevel: string | null
  signalLabel: string | null
  durationSec: number
  fps: number
  width: number | null
  height: number | null
  thumbnail: string | null
}

function downsample(series: number[], max: number): number[] {
  if (series.length === 0) return []
  const step = Math.max(1, Math.ceil(series.length / max))
  const out: number[] = []
  for (let i = 0; i < series.length; i += step) {
    out.push(Number(series[i]!.toFixed(4)))
  }
  return out.slice(0, max)
}

/**
 * Fire-and-forget save of one settled clip. Serialized so the first clip
 * creates the session and later clips append to it. Never throws.
 */
export function saveSettledClip(input: SettledClip): void {
  chain = chain.then(() => persist(input)).catch(() => undefined)
}

async function persist(input: SettledClip): Promise<void> {
  const content = await loadContent()
  if (content['scan.save_metrics'] !== 'on') return
  const p = input.pipeline
  const clip = {
    durationSec: input.durationSec || null,
    fps: input.fps || null,
    width: input.width,
    height: input.height,
    settledHeartRate: input.settledBpm,
    rawBpm: p ? p.estimatedBpm : null,
    respiratoryRate: input.respiratoryBpm,
    signalLabel: input.signalLabel,
    risk: input.riskLevel,
    regionWeights: p
      ? ROI_IDS.map((id) => Number((p.reliability.weights[id] ?? 0).toFixed(4)))
      : [],
    waveform: p ? downsample(p.aggregated, MAX_WAVEFORM) : [],
    thumb: input.thumbnail,
  }
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  }
  if (!serverSessionId) {
    const res = await fetch('/api/sessions', {
      ...init,
      body: JSON.stringify({
        source: input.source,
        pipelineVersion: PIPELINE_VERSION,
        clips: [clip],
      }),
    })
    if (res.ok) {
      const json = (await res.json()) as { id?: string }
      serverSessionId = json.id ?? null
    }
    return
  }
  await fetch(`/api/sessions/${serverSessionId}/clips`, {
    ...init,
    body: JSON.stringify(clip),
  })
}
