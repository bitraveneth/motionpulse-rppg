/**
 * Results feed: Supabase when VITE_SUPABASE_* are set, else localStorage mock.
 * Metrics only — never uploads video.
 */

import {
  displayNickname,
  normalizeNickname,
  type NewRunInput,
  type RunRecord,
} from './types'

const MOCK_KEY = 'motionpulse.feed.v1'
const CLIENT_KEY = 'motionpulse.client_id'

function envUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL as string | undefined
}

function envKey(): string | undefined {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
}

export function isSupabaseConfigured(): boolean {
  const url = envUrl()?.trim()
  const key = envKey()?.trim()
  return Boolean(url && key)
}

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(CLIENT_KEY, id)
    return id
  } catch {
    return 'anonymous-session'
  }
}

function readMock(): RunRecord[] {
  try {
    const raw = localStorage.getItem(MOCK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RunRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeMock(rows: RunRecord[]) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(rows.slice(0, 100)))
}

function restBase(): { url: string; key: string } {
  const url = envUrl()!.replace(/\/$/, '')
  const key = envKey()!
  return { url, key }
}

function mapRow(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    nickname: (row.nickname as string | null) ?? null,
    bpm: Number(row.bpm),
    conflict_score: Number(row.conflict_score),
    risk_level: row.risk_level as RunRecord['risk_level'],
    roi_weights: (row.roi_weights as RunRecord['roi_weights']) ?? {},
    source: row.source as RunRecord['source'],
    client_id: (row.client_id as string | null) ?? null,
  }
}

export async function listRuns(limit = 24): Promise<{
  runs: RunRecord[]
  mode: 'supabase' | 'mock'
}> {
  if (!isSupabaseConfigured()) {
    const runs = readMock()
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
    return { runs, mode: 'mock' }
  }

  const { url, key } = restBase()
  const res = await fetch(
    `${url}/rest/v1/runs?select=*&order=created_at.desc&limit=${limit}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  )
  if (!res.ok) {
    throw new Error(`Feed load failed (${res.status})`)
  }
  const rows = (await res.json()) as Record<string, unknown>[]
  return { runs: rows.map(mapRow), mode: 'supabase' }
}

export async function shareRun(input: NewRunInput): Promise<{
  run: RunRecord
  mode: 'supabase' | 'mock'
}> {
  const nickname = normalizeNickname(input.nickname)
  const client_id = input.client_id ?? getClientId()
  const payload = {
    nickname,
    bpm: Math.round(input.bpm * 10) / 10,
    conflict_score: Math.round(input.conflict_score * 1000) / 1000,
    risk_level: input.risk_level,
    roi_weights: input.roi_weights,
    source: input.source,
    client_id,
  }

  if (!isSupabaseConfigured()) {
    const run: RunRecord = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `local_${Date.now()}`,
      created_at: new Date().toISOString(),
      ...payload,
    }
    const next = [run, ...readMock()].slice(0, 100)
    writeMock(next)
    return { run, mode: 'mock' }
  }

  const { url, key } = restBase()
  const res = await fetch(`${url}/rest/v1/runs`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Share failed (${res.status})${text ? `: ${text}` : ''}`)
  }
  const rows = (await res.json()) as Record<string, unknown>[]
  const row = rows[0]
  if (!row) throw new Error('Share returned no row')
  return { run: mapRow(row), mode: 'supabase' }
}

export { displayNickname, normalizeNickname }
