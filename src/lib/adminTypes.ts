/** Shapes returned by the admin API (password hashes never leave the server). */

export type AccountSummary = {
  id: string
  email: string
  name: string | null
  role: string
}

export type AdminUser = AccountSummary & {
  status: string
  createdAt: string
  profile: {
    ageBand: string | null
    note: string | null
    consentMetricsAt: string | null
    consentVideo: boolean
  } | null
  _count: { scanSessions: number }
}

export type AdminSessionRow = {
  id: string
  createdAt: string
  source: string
  nickname: string | null
  pipelineVersion: string | null
  userId: string | null
  user: { email: string } | null
  _count: { clips: number }
  heartRates: number[]
  risks: string[]
}

export type GroundTruthRow = {
  id: string
  heartRate: number
  source: string
  datasetName: string | null
  datasetSubjectId: string | null
}

export type AdminClip = {
  id: string
  index: number
  durationSec: number | null
  fps: number | null
  width: number | null
  height: number | null
  settledHeartRate: number | null
  rawBpm: number | null
  respiratoryRate: number | null
  signalLabel: string | null
  risk: string | null
  regionWeights: number[]
  waveform: number[]
  thumb: string | null
  groundTruth: GroundTruthRow | null
}

export type AdminSessionDetail = {
  id: string
  createdAt: string
  source: string
  nickname: string | null
  pipelineVersion: string | null
  userId: string | null
  user: { id: string; email: string; name: string | null } | null
  clips: AdminClip[]
}

export type SubjectSessionRow = {
  id: string
  createdAt: string
  source: string
  nickname: string | null
  clips: {
    id: string
    index: number
    durationSec: number | null
    settledHeartRate: number | null
    respiratoryRate: number | null
    signalLabel: string | null
    risk: string | null
  }[]
}
