export type TrainEpoch = { epoch: number; loss: number }

export type TrainPersonInput = {
  subject: string
  role: 'learned' | 'held out'
  windows: number
  bpm: number | null
  referenceBpm: number | null
}

export type ParsedTrain = {
  windows: number
  finalLoss: number | null
  bestLoss: number | null
  checkpoint: string
  history: TrainEpoch[]
  people: TrainPersonInput[]
  heldMae: number | null
  heldCount: number
  crossName: string
  crossMae: number | null
  crossCount: number
  note: string
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function epochsFrom(raw: unknown, lines: string[]): TrainEpoch[] {
  if (Array.isArray(raw)) {
    const rows = raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const epoch = finite((item as { epoch?: unknown }).epoch)
      const loss = finite((item as { loss?: unknown }).loss)
      if (epoch == null || loss == null) return []
      return [{ epoch: Math.round(epoch), loss }]
    })
    if (rows.length > 0) return rows.slice(0, 40)
  }
  const rows: TrainEpoch[] = []
  for (const line of lines) {
    const match = /epoch\s+(\d+)\/\d+\s+loss=([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(line)
    if (!match) continue
    const loss = Number(match[2])
    if (!Number.isFinite(loss)) continue
    rows.push({ epoch: Number(match[1]), loss })
  }
  return rows.slice(0, 40)
}

function personFrom(item: unknown, role: 'learned' | 'held out'): TrainPersonInput | null {
  if (typeof item === 'string') {
    const subject = clip(item, 120)
    return subject ? { subject, role, windows: 0, bpm: null, referenceBpm: null } : null
  }
  if (!item || typeof item !== 'object') return null
  const body = item as { name?: unknown; windows?: unknown; bpm?: unknown; reference?: unknown }
  const subject = clip(body.name, 120)
  if (!subject) return null
  const windows = finite(body.windows)
  return {
    subject,
    role,
    windows: Math.max(0, Math.round(windows ?? 0)),
    bpm: finite(body.bpm),
    referenceBpm: finite(body.reference),
  }
}

function learnedFrom(raw: unknown): TrainPersonInput[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const person = personFrom(item, 'learned')
    return person ? [person] : []
  })
}

function heldFrom(raw: unknown): TrainPersonInput[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const person = personFrom(item, 'held out')
    return person ? [person] : []
  })
}

function noteFrom(lines: string[]): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? ''
    if (!line || line.startsWith('record ') || line.startsWith('saved ')) continue
    if (line.startsWith('stop ') || line.startsWith('error') || line.includes('Error') || line.includes('Traceback')) {
      return line.slice(0, 400)
    }
  }
  return ''
}

/** Pull the PhysNet summary out of the trainer log. Numbers only. */
export function parseTrainLog(lines: string[]): ParsedTrain {
  let record: Record<string, unknown> | null = null
  for (const line of lines) {
    const match = /^record\s+(\{.*)$/.exec(line.trim())
    if (!match?.[1]) continue
    try {
      const parsed = JSON.parse(match[1]) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>
      }
    } catch {
      record = null
    }
  }
  const history = epochsFrom(record?.history, lines)
  const learned = learnedFrom(record?.learned)
  const held = heldFrom(record?.heldOut)
  const counted = finite(record?.windows)
  const windows = counted ?? learned.reduce((sum, row) => sum + row.windows, 0)
  const losses = history.map((row) => row.loss)
  const heldMae = finite(record?.heldMae)
  const crossMae = finite(record?.crossMae)
  const heldCount = finite(record?.heldCount)
  const crossCount = finite(record?.crossCount)
  return {
    windows: Math.max(0, Math.round(windows)),
    finalLoss: losses.length > 0 ? losses[losses.length - 1]! : null,
    bestLoss: losses.length > 0 ? Math.min(...losses) : null,
    checkpoint: clip(record?.checkpoint, 300),
    history,
    people: [...learned, ...held].slice(0, 80),
    heldMae,
    heldCount: Math.max(0, Math.round(heldCount ?? held.filter((person) => person.bpm != null).length)),
    crossName: clip(record?.crossName, 80),
    crossMae,
    crossCount: Math.max(0, Math.round(crossCount ?? 0)),
    note: noteFrom(lines),
  }
}
