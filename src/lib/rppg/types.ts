/** Shared types for motion-aware rPPG pipeline (thesis §§3.1.2–3.1.4). */

export type RoiId = 'forehead' | 'leftCheek' | 'rightCheek' | 'lowerFace'

export const ROI_IDS: RoiId[] = [
  'forehead',
  'leftCheek',
  'rightCheek',
  'lowerFace',
]

export const ROI_LABELS: Record<RoiId, string> = {
  forehead: 'Forehead',
  leftCheek: 'Left cheek',
  rightCheek: 'Right cheek',
  lowerFace: 'Lower face',
}

/** Normalized landmark [x, y] in [0,1] image space (MediaPipe style). */
export type Landmark = { x: number; y: number }

export type FrameLandmarks = Landmark[]

export type RgbSample = { r: number; g: number; b: number }

export type RoiRgbTrace = Record<RoiId, RgbSample[]>

export type CandidateMethod = 'CHROM' | 'POS'

export type ConflictScores = {
  cTemp: number
  cSpec: number
  combined: number
}

export type SuppressionResult = {
  gated: number[]
  gain: number
  residualFloor: number
}

export type ReliabilityResult = {
  quality: Record<RoiId, number>
  motion: Record<RoiId, number>
  reliability: Record<RoiId, number>
  weights: Record<RoiId, number>
  entropy: number
}

export type DemoControls = {
  windowLengthSec: number
  physBandHz: [number, number]
  alpha: number
  beta: number
  suppressionFloor: number
  candidateMethod: CandidateMethod
  motionArtifactAmp: number
  pulseBpm: number
  reliabilityLambda: number
}

export const DEFAULT_CONTROLS: DemoControls = {
  windowLengthSec: 8,
  physBandHz: [0.7, 4.0],
  alpha: 0.5,
  beta: 0.5,
  suppressionFloor: 0.15,
  candidateMethod: 'CHROM',
  motionArtifactAmp: 0.35,
  pulseBpm: 72,
  reliabilityLambda: 4,
}
