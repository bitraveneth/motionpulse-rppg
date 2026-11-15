import type { ComparisonSummary } from '../research/comparison'
import type { LabSubjectInput } from './labSubject'

export type LabTestSummary = {
  id: string
  createdAt: string
  name: string
  faceCount: number
  paired: number
  mae: number | null
  rmse: number | null
  pearson: number | null
  snrMean: number | null
  snrDb: number | null
  bias: number | null
  loaLow: number | null
  loaHigh: number | null
}

export type LabSubjectRecord = LabSubjectInput & {
  id: string
  createdAt: string
}

export type LabTestDetail = {
  test: LabTestSummary
  subjects: LabSubjectRecord[]
  agreement: ComparisonSummary
}

export function formatTestWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date)
}

export async function fetchLabTests(): Promise<LabTestSummary[]> {
  const res = await fetch('/api/lab-tests', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load test results')
  const json = (await res.json()) as { tests?: LabTestSummary[] }
  return json.tests ?? []
}

export async function fetchLabTest(id: string): Promise<LabTestDetail> {
  const res = await fetch(`/api/lab-tests/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('That test is not in the database')
  return (await res.json()) as LabTestDetail
}

export async function storeLabSubject(input: {
  id: string | null
  name: string
  subject: LabSubjectInput
}): Promise<{ id: string; subjectId: string; posted: boolean }> {
  const res = await fetch('/api/lab-tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id ?? undefined,
      name: input.name,
      subject: input.subject,
    }),
  })
  if (!res.ok) throw new Error('The database did not keep this result')
  const json = (await res.json()) as { id?: string; subjectId?: string; posted?: boolean }
  if (!json.id || !json.subjectId) throw new Error('The database did not keep this result')
  return { id: json.id, subjectId: json.subjectId, posted: json.posted !== false }
}
