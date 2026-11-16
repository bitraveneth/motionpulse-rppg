import { formatTestWhen } from './labTestApi'

export { formatTestWhen }

export type TrainRunSummary = {
  id: string
  startedAt: string
  createdAt: string
  name: string
  method: string
  epochs: number
  people: number
  windowCount: number
  finalLoss: number | null
  bestLoss: number | null
  heldMae: number | null
  heldCount: number
  crossName: string
  crossMae: number | null
  crossCount: number
  status: string
  learned: number
  heldOut: number
}

export type TrainPerson = {
  id: string
  subject: string
  role: string
  windows: number
  bpm: number | null
  referenceBpm: number | null
}

export type TrainEpoch = { epoch: number; loss: number }

export type TrainRunDetail = TrainRunSummary & {
  folder: string
  checkpoint: string
  note: string
  history: TrainEpoch[]
  people: TrainPerson[]
}

export function trainStatusLabel(status: string): string {
  if (status === 'done') return 'Saved'
  if (status === 'stopped') return 'Stopped'
  if (status === 'error') return 'Failed'
  return status
}

export async function fetchTrainRuns(): Promise<TrainRunSummary[]> {
  const res = await fetch('/api/train-runs', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load training history')
  const json = (await res.json()) as { runs?: TrainRunSummary[] }
  return json.runs ?? []
}

export async function fetchTrainRun(id: string): Promise<TrainRunDetail> {
  const res = await fetch(`/api/train-runs/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('That training run is not in the database')
  const json = (await res.json()) as { run?: TrainRunDetail }
  if (!json.run) throw new Error('That training run is not in the database')
  return json.run
}
