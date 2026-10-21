/**
 * Bundled synthetic sample: landmarks + ROI RGB + pulse + controllable motion.
 * Lets every panel run without real datasets.
 */

import type {
  FrameLandmarks,
  Landmark,
  RgbSample,
  RoiId,
  RoiRgbTrace,
} from './types'
import { ROI_IDS } from './types'
import { ROI_LANDMARK_INDICES } from './motion'

export type SyntheticSample = {
  id: string
  label: string
  sampleRateHz: number
  durationSec: number
  frames: FrameLandmarks[]
  roiRgb: RoiRgbTrace
  /** Ground-truth clean pulse (for demo overlays only). */
  truePulse: number[]
  pulseBpm: number
  motionArtifactAmp: number
}

export type SyntheticParams = {
  durationSec?: number
  sampleRateHz?: number
  pulseBpm?: number
  /** Amplitude of shared-band motion artifact contaminating RGB (0–1). */
  motionArtifactAmp?: number
  /** Global rigid shake amplitude (normalized landmark units). */
  rigidShake?: number
  /** Talking / expression residual on lower face. */
  talkAmp?: number
  seed?: number
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Sparse resting face layout in normalized coords (covers ROI index set). */
function baseFaceLayout(): Landmark[] {
  const pts: Landmark[] = []
  // Allocate enough slots for MediaPipe-sized indices we reference.
  const maxIdx = Math.max(
    ...ROI_IDS.flatMap((id) => ROI_LANDMARK_INDICES[id]),
    263,
    33,
  )
  for (let i = 0; i <= maxIdx; i++) {
    pts.push({ x: 0.5, y: 0.5 })
  }

  const place = (indices: number[], cx: number, cy: number, rx: number, ry: number) => {
    indices.forEach((idx, k) => {
      const a = (k / Math.max(1, indices.length)) * Math.PI * 2
      pts[idx] = {
        x: cx + Math.cos(a) * rx,
        y: cy + Math.sin(a) * ry,
      }
    })
  }

  place(ROI_LANDMARK_INDICES.forehead, 0.5, 0.28, 0.12, 0.04)
  place(ROI_LANDMARK_INDICES.leftCheek, 0.35, 0.52, 0.06, 0.07)
  place(ROI_LANDMARK_INDICES.rightCheek, 0.65, 0.52, 0.06, 0.07)
  place(ROI_LANDMARK_INDICES.lowerFace, 0.5, 0.72, 0.1, 0.05)

  // Eye anchors for scale
  pts[33] = { x: 0.38, y: 0.4 }
  pts[263] = { x: 0.62, y: 0.4 }
  pts[10] = { x: 0.5, y: 0.22 }
  pts[152] = { x: 0.5, y: 0.82}

  return pts
}

function cloneLandmarks(base: Landmark[]): Landmark[] {
  return base.map((p) => ({ x: p.x, y: p.y }))
}

/**
 * Generate a synthetic clip. Motion artifact at pulse frequency raises conflict;
 * residual talking motion stresses lower-face reliability.
 */
export function generateSyntheticSample(
  params: SyntheticParams = {},
): SyntheticSample {
  const durationSec = params.durationSec ?? 12
  const sampleRateHz = params.sampleRateHz ?? 30
  const pulseBpm = params.pulseBpm ?? 72
  const motionArtifactAmp = params.motionArtifactAmp ?? 0.35
  const rigidShake = params.rigidShake ?? 0.008
  const talkAmp = params.talkAmp ?? 0.012
  const rand = mulberry32(params.seed ?? 42)

  const n = Math.round(durationSec * sampleRateHz)
  const pulseHz = pulseBpm / 60
  const base = baseFaceLayout()
  const frames: FrameLandmarks[] = []
  const truePulse: number[] = []

  const roiRgb: RoiRgbTrace = {
    forehead: [],
    leftCheek: [],
    rightCheek: [],
    lowerFace: [],
  }

  // Per-ROI pulse strength and motion coupling
  const pulseGain: Record<RoiId, number> = {
    forehead: 1.0,
    leftCheek: 0.85,
    rightCheek: 0.85,
    lowerFace: 0.45,
  }
  const artifactCoupling: Record<RoiId, number> = {
    forehead: 0.25,
    leftCheek: 0.55,
    rightCheek: 0.55,
    lowerFace: 0.9,
  }

  for (let t = 0; t < n; t++) {
    const time = t / sampleRateHz
    const pulse = Math.sin(2 * Math.PI * pulseHz * time)
    truePulse.push(pulse)

    // Rigid head shake: slow sway always; pulse-locked component scales with artifact amp
    // so conflict demos can raise C by turning up motionArtifactAmp.
    const swayX = rigidShake * Math.sin(2 * Math.PI * 0.35 * time)
    const swayY = rigidShake * 0.6 * Math.sin(2 * Math.PI * 0.22 * time + 0.4)
    const pulseLocked =
      motionArtifactAmp * 0.018 * Math.sin(2 * Math.PI * pulseHz * time + 0.2)

    const talk =
      talkAmp *
      (0.6 * Math.sin(2 * Math.PI * 3.5 * time) +
        0.4 * Math.sin(2 * Math.PI * 5.1 * time + 1.1))

    const frame = cloneLandmarks(base)
    for (let i = 0; i < frame.length; i++) {
      const p = frame[i]!
      p.x += swayX + pulseLocked * (0.5 + rand() * 0.1)
      p.y += swayY + pulseLocked * 0.3
    }
    // Extra residual on lower face / mouth region
    for (const idx of ROI_LANDMARK_INDICES.lowerFace) {
      const p = frame[idx]
      if (!p) continue
      p.y += talk
      p.x += talk * 0.3 * Math.sin(time * 8 + idx)
    }
    frames.push(frame)

    for (const roi of ROI_IDS) {
      const skin: RgbSample = { r: 0.72, g: 0.52, b: 0.42 }
      // Physiological modulation (stronger in green)
      const phys = 0.012 * pulseGain[roi] * pulse
      // Illumination flicker
      const flicker = 0.004 * Math.sin(2 * Math.PI * 0.5 * time)
      // Motion photometric artifact — shared band with pulse when amp high.
      // At low amp, residual contamination sits below the phys band (0.25 Hz).
      const artFreq = motionArtifactAmp < 0.2 ? 0.25 : pulseHz
      const art =
        0.028 *
        motionArtifactAmp *
        artifactCoupling[roi] *
        Math.sin(2 * Math.PI * artFreq * time + 0.15)
      // ROI-specific noise
      const noise = () => (rand() - 0.5) * 0.003

      roiRgb[roi].push({
        r: skin.r + phys * 0.4 + flicker + art * 0.7 + noise(),
        g: skin.g + phys * 1.0 + flicker + art * 0.9 + noise(),
        b: skin.b + phys * 0.3 + flicker + art * 0.5 + noise(),
      })
    }
  }

  return {
    id: 'synthetic-bundled',
    label: 'Bundled synthetic clip',
    sampleRateHz,
    durationSec,
    frames,
    roiRgb,
    truePulse,
    pulseBpm,
    motionArtifactAmp,
  }
}

/** Default sample used by the demo on first load. */
export const BUNDLED_SAMPLE = generateSyntheticSample({
  durationSec: 12,
  sampleRateHz: 30,
  pulseBpm: 72,
  motionArtifactAmp: 0.35,
  seed: 7,
})
