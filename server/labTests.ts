import { Prisma } from '@prisma/client'
import type { Context, Hono } from 'hono'
import { parseFeedDetail } from '../src/lib/feed/detail'
import { datasetLabel, parseLabSubject, parseMethod } from '../src/lib/lab/labSubject'
import { comparisonSummary } from '../src/lib/research/comparison'
import { currentAccount, type SessionAccount } from './auth'
import { prisma } from './db'
import { publishSubjectOnFeed } from './labFeed'

type App = Hono<{ Variables: { account: SessionAccount } }>

function hostname(header: string): string {
  if (header.startsWith('[')) {
    const end = header.indexOf(']')
    return end > 0 ? header.slice(1, end) : header
  }
  return header.split(':')[0] ?? ''
}

function isLoopback(c: Context): boolean {
  const host = hostname(c.req.header('host') ?? '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

async function canStore(c: Context): Promise<boolean> {
  if (isLoopback(c)) return true
  const account = await currentAccount(c)
  return account?.role === 'admin'
}

function testJson(row: {
  id: string
  createdAt: Date
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
}) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    name: row.name,
    faceCount: row.faceCount,
    paired: row.paired,
    mae: row.mae,
    rmse: row.rmse,
    pearson: row.pearson,
    snrMean: row.snrMean,
    snrDb: row.snrDb,
    bias: row.bias,
    loaLow: row.loaLow,
    loaHigh: row.loaHigh,
  }
}

async function refreshSummary(testId: string) {
  const subjects = await prisma.labSubject.findMany({
    where: { testId },
    select: { bpm: true, referenceBpm: true, snr: true },
  })
  const pairs = subjects.flatMap((row) =>
    row.referenceBpm == null ? [] : [{ estimate: row.bpm, reference: row.referenceBpm }],
  )
  const snrs = subjects.flatMap((row) => (row.snr == null ? [] : [row.snr]))
  const summary = comparisonSummary(pairs, snrs)
  await prisma.labTest.update({
    where: { id: testId },
    data: {
      faceCount: subjects.length,
      clipCount: subjects.length,
      paired: summary.n,
      mae: summary.mae,
      rmse: summary.rmse,
      pearson: summary.pearson,
      snrMean: summary.snrMean,
      snrDb: summary.snrDb,
      bias: summary.bias,
      loaLow: summary.loaLow,
      loaHigh: summary.loaHigh,
    },
  })
  return summary
}

export function registerLabTests(app: App) {
  app.get('/api/lab-tests', async (c) => {
    const tests = await prisma.labTest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return c.json({ tests: tests.map(testJson) })
  })

  app.get('/api/lab-tests/:id', async (c) => {
    const test = await prisma.labTest.findUnique({
      where: { id: c.req.param('id') },
      include: { subjects: { orderBy: { createdAt: 'asc' } } },
    })
    if (!test) return c.json({ error: 'missing' }, 404)
    const brief = c.req.query('brief') === '1'
    const subjects = test.subjects.flatMap((row) => {
      const detail = parseFeedDetail(row.detail)
      if (!detail) return []
      return [
        {
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          subject: row.subject,
          bpm: row.bpm,
          plainBpm: row.plainBpm,
          weightedBpm: row.weightedBpm,
          cleanedBpm: row.cleanedBpm,
          referenceBpm: row.referenceBpm,
          snr: row.snr,
          durationSec: row.durationSec,
          respiratoryRate: row.respiratoryRate,
          breathsInClip: row.breathsInClip,
          risk: row.risk,
          conflict: row.conflict,
          windows: row.windows,
          frames: row.frames,
          method: parseMethod(row.method) ?? 'CHROM',
          thumb: brief ? null : row.thumb,
          detail,
        },
      ]
    })
    const agreement = comparisonSummary(
      subjects.flatMap((row) =>
        row.referenceBpm == null ? [] : [{ estimate: row.bpm, reference: row.referenceBpm }],
      ),
      subjects.flatMap((row) => (row.snr == null ? [] : [row.snr])),
    )
    return c.json({ test: testJson(test), subjects, agreement })
  })

  app.post('/api/lab-tests', async (c) => {
    if (!(await canStore(c))) return c.json({ error: 'sign_in_required' }, 401)
    let body: Record<string, unknown> | null = null
    try {
      const parsed = await c.req.json()
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>
      }
    } catch {
      body = null
    }
    const subject = parseLabSubject(body?.subject)
    if (!body || !subject) return c.json({ error: 'invalid' }, 400)
    const requestedId = typeof body.id === 'string' ? body.id : ''
    const base = datasetLabel(typeof body.name === 'string' ? body.name : 'Dataset')
    let testId = requestedId
    if (!testId) {
      const created = await prisma.labTest.create({
        data: { name: `${base} · ${subject.method}`.slice(0, 80) },
      })
      testId = created.id
    } else {
      const existing = await prisma.labTest.findUnique({ where: { id: testId }, select: { id: true } })
      if (!existing) return c.json({ error: 'missing' }, 404)
    }
    const saved = await prisma.labSubject.create({
      data: {
        testId,
        subject: subject.subject,
        bpm: subject.bpm,
        plainBpm: subject.plainBpm,
        weightedBpm: subject.weightedBpm,
        cleanedBpm: subject.cleanedBpm,
        referenceBpm: subject.referenceBpm,
        snr: subject.snr,
        durationSec: subject.durationSec,
        respiratoryRate: subject.respiratoryRate,
        breathsInClip: subject.breathsInClip,
        risk: subject.risk,
        conflict: subject.conflict,
        windows: subject.windows,
        frames: subject.frames,
        method: subject.method,
        thumb: subject.thumb,
        detail: subject.detail as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    })
    const agreement = await refreshSummary(testId)
    let posted = true
    try {
      await publishSubjectOnFeed({
        id: saved.id,
        createdAt: saved.createdAt,
        subject: subject.subject,
        bpm: subject.bpm,
        referenceBpm: subject.referenceBpm,
        durationSec: subject.durationSec,
        respiratoryRate: subject.respiratoryRate,
        risk: subject.risk,
        conflict: subject.conflict,
        thumb: subject.thumb,
        detail: subject.detail as Prisma.InputJsonValue,
        datasetName: base,
        method: subject.method,
      })
    } catch {
      posted = false
    }
    return c.json({ id: testId, subjectId: saved.id, agreement, posted })
  })
}
