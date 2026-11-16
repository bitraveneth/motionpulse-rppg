import { basename, relative } from 'node:path'
import type { Hono } from 'hono'
import type { SessionAccount } from './auth'
import { prisma } from './db'
import { parseTrainLog, type ParsedTrain } from './trainRecord'

type App = Hono<{ Variables: { account: SessionAccount } }>

export type FinishedTrain = {
  startedAt: Date
  folder: string
  epochs: number
  people: number
  status: 'done' | 'error' | 'stopped'
  log: string[]
}

function loss(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

function checkpointPath(path: string): string {
  if (!path) return ''
  const fromRoot = relative(process.cwd(), path)
  const shown = fromRoot.startsWith('..') ? path : fromRoot
  return shown.slice(0, 300)
}

function runName(folder: string): string {
  const leaf = basename(folder).replace(/\s+/g, ' ').trim()
  return `${(leaf || 'dataset').slice(0, 80)} · PhysNet`
}

function summaryJson(row: {
  id: string
  startedAt: Date
  createdAt: Date
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
  peopleRows: { role: string }[]
}) {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    name: row.name,
    method: row.method,
    epochs: row.epochs,
    people: row.people,
    windowCount: row.windowCount,
    finalLoss: row.finalLoss,
    bestLoss: row.bestLoss,
    heldMae: row.heldMae,
    heldCount: row.heldCount,
    crossName: row.crossName,
    crossMae: row.crossMae,
    crossCount: row.crossCount,
    status: row.status,
    learned: row.peopleRows.filter((person) => person.role === 'learned').length,
    heldOut: row.peopleRows.filter((person) => person.role === 'held out').length,
  }
}

function detailJson(
  row: {
    id: string
    startedAt: Date
    createdAt: Date
    name: string
    method: string
    folder: string
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
    checkpoint: string
    status: string
    note: string
    history: unknown
    peopleRows: { id: string; subject: string; role: string; windows: number; bpm: number | null; referenceBpm: number | null }[]
  },
) {
  const history = Array.isArray(row.history) ? row.history : []
  return {
    ...summaryJson(row),
    folder: row.folder,
    checkpoint: row.checkpoint,
    note: row.note,
    history,
    people: [...row.peopleRows]
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'learned' ? -1 : 1
        return a.subject.localeCompare(b.subject)
      })
      .map((person) => ({
        id: person.id,
        subject: person.subject,
        role: person.role,
        windows: person.windows,
        bpm: person.bpm,
        referenceBpm: person.referenceBpm,
      })),
  }
}

export async function saveFinishedTrain(input: FinishedTrain): Promise<string> {
  const parsed: ParsedTrain = parseTrainLog(input.log)
  const row = await prisma.trainRun.create({
    data: {
      startedAt: input.startedAt,
      name: runName(input.folder),
      method: 'PhysNet',
      folder: input.folder.slice(0, 500),
      epochs: input.epochs,
      people: input.people,
      windowCount: parsed.windows,
      finalLoss: loss(parsed.finalLoss),
      bestLoss: loss(parsed.bestLoss),
      heldMae: loss(parsed.heldMae),
      heldCount: parsed.heldCount,
      crossName: parsed.crossName,
      crossMae: loss(parsed.crossMae),
      crossCount: parsed.crossCount,
      checkpoint: checkpointPath(parsed.checkpoint),
      status: input.status,
      note: input.status === 'done' ? '' : parsed.note,
      history: parsed.history,
      peopleRows: {
        create: parsed.people.map((person) => ({
          subject: person.subject,
          role: person.role,
          windows: person.windows,
          bpm: person.bpm,
          referenceBpm: person.referenceBpm,
        })),
      },
    },
  })
  return row.id
}

export function registerTrainRuns(app: App) {
  app.get('/api/train-runs', async (c) => {
    const runs = await prisma.trainRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { peopleRows: { select: { role: true } } },
    })
    return c.json({ runs: runs.map(summaryJson) })
  })

  app.get('/api/train-runs/:id', async (c) => {
    const row = await prisma.trainRun.findUnique({
      where: { id: c.req.param('id') },
      include: { peopleRows: { orderBy: { subject: 'asc' } } },
    })
    if (!row) return c.json({ error: 'missing' }, 404)
    return c.json({ run: detailJson(row) })
  })
}
