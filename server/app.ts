import { Hono } from 'hono'
import { CONTENT_DEFAULTS } from '../src/lib/contentDefaults'
import {
  createAuthSession,
  currentAccount,
  destroyAuthSession,
  type SessionAccount,
} from './auth'
import { prisma } from './db'
import { hashPassword, randomPassword, verifyPassword } from './password'

export const app = new Hono<{ Variables: { account: SessionAccount } }>()

const SESSION_SOURCES = new Set(['sample', 'upload', 'webcam', 'local-lab'])
const GT_SOURCES = new Set(['self-count', 'dataset', 'device'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function numList(v: unknown, max: number): number[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    .slice(0, max)
}

function clipData(raw: unknown, index: number) {
  const input = (raw ?? {}) as Record<string, unknown>
  const thumb = str(input.thumb, 120_000)
  return {
    index,
    durationSec: num(input.durationSec),
    fps: num(input.fps),
    width: int(input.width),
    height: int(input.height),
    settledHeartRate: num(input.settledHeartRate),
    rawBpm: num(input.rawBpm),
    respiratoryRate: num(input.respiratoryRate),
    signalLabel: str(input.signalLabel, 80),
    risk: str(input.risk, 40),
    regionWeights: numList(input.regionWeights, 4),
    waveform: numList(input.waveform, 400),
    thumb: thumb && thumb.startsWith('data:image') ? thumb : null,
  }
}

async function contentMap(): Promise<Record<string, string>> {
  const rows = await prisma.content.findMany()
  const map: Record<string, string> = { ...CONTENT_DEFAULTS }
  for (const row of rows) map[row.key] = row.text
  return map
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function readJson(c: {
  req: { json: () => Promise<unknown> }
}): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>
    }
  } catch {
    /* invalid json */
  }
  return null
}

// ---------- public ----------

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/content', async (c) => {
  return c.json({ content: await contentMap() })
})

app.post('/api/auth/signup', async (c) => {
  const body = await readJson(c)
  const email = str(body?.email, 200)?.toLowerCase()
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = str(body?.name, 120)
  const ageBand = str(body?.ageBand, 40)
  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: 'A valid email is required.' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Password needs at least 8 characters.' }, 400)
  }
  const existing = await prisma.account.findUnique({ where: { email } })
  if (existing) return c.json({ error: 'That email already has an account.' }, 409)
  const account = await prisma.account.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: 'subject',
      profile: {
        create: { ageBand, consentMetricsAt: new Date() },
      },
    },
  })
  await createAuthSession(c, account.id)
  return c.json({
    account: { id: account.id, email: account.email, name: account.name, role: account.role },
  })
})

app.post('/api/auth/signin', async (c) => {
  const body = await readJson(c)
  const email = str(body?.email, 200)?.toLowerCase()
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return c.json({ error: 'Email and password required.' }, 400)
  const account = await prisma.account.findUnique({ where: { email } })
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return c.json({ error: 'Wrong email or password.' }, 401)
  }
  if (account.status !== 'active') {
    return c.json({ error: 'This account is disabled.' }, 403)
  }
  await createAuthSession(c, account.id)
  return c.json({
    account: { id: account.id, email: account.email, name: account.name, role: account.role },
  })
})

app.post('/api/auth/signout', async (c) => {
  await destroyAuthSession(c)
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const account = await currentAccount(c)
  return c.json({ account })
})

// Save one scan session (+ first clips) when the save switch is on.
app.post('/api/sessions', async (c) => {
  const map = await contentMap()
  if (map['scan.save_metrics'] !== 'on') {
    return c.json({ saved: false, reason: 'save_switch_off' })
  }
  const body = await readJson(c)
  if (!body) return c.json({ error: 'JSON body required.' }, 400)
  const source = str(body.source, 40)
  if (!source || !SESSION_SOURCES.has(source)) {
    return c.json({ error: 'Unknown source.' }, 400)
  }
  const account = await currentAccount(c)
  const clips = Array.isArray(body.clips) ? body.clips.slice(0, 10) : []
  const session = await prisma.scanSession.create({
    data: {
      source,
      nickname: str(body.nickname, 80),
      pipelineVersion: str(body.pipelineVersion, 40),
      userId: account?.id ?? null,
      clips: { create: clips.map((clip, i) => clipData(clip, i)) },
    },
    select: { id: true },
  })
  return c.json({ saved: true, id: session.id })
})

// Append one settled clip to an existing session (id is unguessable).
app.post('/api/sessions/:id/clips', async (c) => {
  const map = await contentMap()
  if (map['scan.save_metrics'] !== 'on') {
    return c.json({ saved: false, reason: 'save_switch_off' })
  }
  const session = await prisma.scanSession.findUnique({
    where: { id: c.req.param('id') },
    select: { id: true, _count: { select: { clips: true } } },
  })
  if (!session) return c.json({ error: 'Session not found.' }, 404)
  if (session._count.clips >= 10) return c.json({ error: 'Session is full.' }, 400)
  const body = await readJson(c)
  const clip = await prisma.clip.create({
    data: { sessionId: session.id, ...clipData(body, session._count.clips) },
    select: { id: true },
  })
  return c.json({ saved: true, id: clip.id })
})

// A signed-in subject sees only their own sessions.
app.get('/api/me/sessions', async (c) => {
  const account = await currentAccount(c)
  if (!account) return c.json({ error: 'sign_in_required' }, 401)
  const sessions = await prisma.scanSession.findMany({
    where: { userId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      clips: {
        orderBy: { index: 'asc' },
        select: {
          id: true,
          index: true,
          durationSec: true,
          settledHeartRate: true,
          respiratoryRate: true,
          signalLabel: true,
          risk: true,
        },
      },
    },
  })
  return c.json({ sessions })
})

// ---------- admin ----------

app.use('/api/admin/*', async (c, next) => {
  const account = await currentAccount(c)
  if (!account) return c.json({ error: 'sign_in_required' }, 401)
  if (account.role !== 'admin') return c.json({ error: 'admin_only' }, 403)
  c.set('account', account)
  await next()
})

app.get('/api/admin/overview', async (c) => {
  const [accounts, sessions, clips, subjects] = await Promise.all([
    prisma.account.count(),
    prisma.scanSession.count(),
    prisma.clip.count(),
    prisma.account.count({ where: { role: 'subject' } }),
  ])
  return c.json({ accounts, subjects, sessions, clips })
})

app.get('/api/admin/content', async (c) => {
  const rows = await prisma.content.findMany({ orderBy: { key: 'asc' } })
  return c.json({ defaults: CONTENT_DEFAULTS, rows })
})

app.put('/api/admin/content', async (c) => {
  const account = c.get('account')
  const body = await readJson(c)
  const updates = body?.updates
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return c.json({ error: 'Expected { updates: { key: text } }.' }, 400)
  }
  let changed = 0
  for (const [key, value] of Object.entries(updates)) {
    if (!(key in CONTENT_DEFAULTS) || typeof value !== 'string') continue
    await prisma.content.upsert({
      where: { key },
      update: { text: value, updatedBy: account.email },
      create: { key, text: value, updatedBy: account.email },
    })
    changed += 1
  }
  return c.json({ ok: true, changed })
})

app.get('/api/admin/users', async (c) => {
  const users = await prisma.account.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      profile: {
        select: {
          ageBand: true,
          note: true,
          consentMetricsAt: true,
          consentVideo: true,
        },
      },
      _count: { select: { scanSessions: true } },
    },
  })
  return c.json({ users })
})

app.post('/api/admin/users', async (c) => {
  const body = await readJson(c)
  const email = str(body?.email, 200)?.toLowerCase()
  const role = body?.role === 'admin' ? 'admin' : 'subject'
  const name = str(body?.name, 120)
  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: 'A valid email is required.' }, 400)
  }
  const existing = await prisma.account.findUnique({ where: { email } })
  if (existing) return c.json({ error: 'That email already has an account.' }, 409)
  const password =
    typeof body?.password === 'string' && body.password.length >= 8
      ? body.password
      : randomPassword(14)
  const account = await prisma.account.create({
    data: {
      email,
      name,
      role,
      passwordHash: hashPassword(password),
      profile: role === 'subject' ? { create: {} } : undefined,
    },
  })
  return c.json({
    account: { id: account.id, email: account.email, role: account.role },
    generatedPassword: password,
  })
})

app.patch('/api/admin/users/:id', async (c) => {
  const me = c.get('account')
  const id = c.req.param('id')
  const body = await readJson(c)
  const status = body?.status
  if (status !== 'active' && status !== 'disabled') {
    return c.json({ error: 'status must be active or disabled.' }, 400)
  }
  if (id === me.id && status === 'disabled') {
    return c.json({ error: 'You cannot disable your own account.' }, 400)
  }
  const user = await prisma.account.update({ where: { id }, data: { status } })
  if (status === 'disabled') {
    await prisma.authSession.deleteMany({ where: { accountId: id } })
  }
  return c.json({ account: { id: user.id, status: user.status } })
})

app.delete('/api/admin/users/:id', async (c) => {
  const me = c.get('account')
  const id = c.req.param('id')
  if (id === me.id) return c.json({ error: 'You cannot delete your own account.' }, 400)
  const user = await prisma.account.findUnique({ where: { id } })
  if (!user) return c.json({ error: 'User not found.' }, 404)
  if (user.role === 'admin') {
    return c.json({ error: 'Admin accounts cannot be deleted here.' }, 400)
  }
  // Cascades: profile, auth sessions, scan sessions, clips, ground truth.
  await prisma.account.delete({ where: { id } })
  return c.json({ ok: true })
})

function sessionFilters(c: {
  req: { query: (k: string) => string | undefined }
}) {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const userId = c.req.query('userId')
  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from)
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to)
    end.setDate(end.getDate() + 1)
    createdAt.lte = end
  }
  return {
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(userId ? { userId } : {}),
  }
}

app.get('/api/admin/sessions', async (c) => {
  const sessions = await prisma.scanSession.findMany({
    where: sessionFilters(c),
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      user: { select: { email: true } },
      _count: { select: { clips: true } },
      clips: {
        orderBy: { index: 'asc' },
        select: { settledHeartRate: true, risk: true },
      },
    },
  })
  return c.json({
    sessions: sessions.map(({ clips, ...s }) => ({
      ...s,
      heartRates: clips
        .map((cl) => cl.settledHeartRate)
        .filter((v): v is number => v !== null),
      risks: clips.map((cl) => cl.risk).filter((v): v is string => v !== null),
    })),
  })
})

app.get('/api/admin/sessions/:id', async (c) => {
  const session = await prisma.scanSession.findUnique({
    where: { id: c.req.param('id') },
    include: {
      user: { select: { id: true, email: true, name: true } },
      clips: { orderBy: { index: 'asc' }, include: { groundTruth: true } },
    },
  })
  if (!session) return c.json({ error: 'Session not found.' }, 404)
  return c.json({ session })
})

app.delete('/api/admin/sessions/:id', async (c) => {
  await prisma.scanSession.delete({ where: { id: c.req.param('id') } })
  return c.json({ ok: true })
})

app.put('/api/admin/clips/:id/ground-truth', async (c) => {
  const clipId = c.req.param('id')
  const body = await readJson(c)
  const heartRate = num(body?.heartRate)
  const source = str(body?.source, 40)
  if (heartRate === null || heartRate < 20 || heartRate > 260) {
    return c.json({ error: 'heartRate must be a number between 20 and 260.' }, 400)
  }
  if (!source || !GT_SOURCES.has(source)) {
    return c.json({ error: 'source must be self-count, dataset, or device.' }, 400)
  }
  const data = {
    heartRate,
    source,
    datasetName: str(body?.datasetName, 120),
    datasetSubjectId: str(body?.datasetSubjectId, 120),
  }
  const gt = await prisma.groundTruth.upsert({
    where: { clipId },
    update: data,
    create: { clipId, ...data },
  })
  return c.json({ groundTruth: gt })
})

app.delete('/api/admin/clips/:id/ground-truth', async (c) => {
  await prisma.groundTruth.deleteMany({ where: { clipId: c.req.param('id') } })
  return c.json({ ok: true })
})

// Full clip rows as CSV — metrics, regions, ground truth. No thumbs.
app.get('/api/admin/export/clips.csv', async (c) => {
  const sessions = await prisma.scanSession.findMany({
    where: sessionFilters(c),
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { email: true } },
      clips: { orderBy: { index: 'asc' }, include: { groundTruth: true } },
    },
  })
  const header = [
    'session_id',
    'session_created_at',
    'source',
    'nickname',
    'user_email',
    'clip_id',
    'clip_index',
    'duration_sec',
    'fps',
    'width',
    'height',
    'settled_heart_rate',
    'raw_bpm',
    'respiratory_rate_experimental',
    'signal_label',
    'risk',
    'weight_forehead',
    'weight_left_cheek',
    'weight_right_cheek',
    'weight_lower_face',
    'gt_heart_rate',
    'gt_source',
    'gt_dataset_name',
    'gt_dataset_subject_id',
  ]
  const lines = [header.join(',')]
  for (const s of sessions) {
    for (const clip of s.clips) {
      const w = clip.regionWeights
      lines.push(
        [
          s.id,
          s.createdAt.toISOString(),
          s.source,
          s.nickname,
          s.user?.email ?? '',
          clip.id,
          clip.index,
          clip.durationSec?.toFixed(2) ?? '',
          clip.fps?.toFixed(2) ?? '',
          clip.width,
          clip.height,
          clip.settledHeartRate?.toFixed(2) ?? '',
          clip.rawBpm?.toFixed(2) ?? '',
          clip.respiratoryRate?.toFixed(2) ?? '',
          clip.signalLabel,
          clip.risk,
          w[0]?.toFixed(4) ?? '',
          w[1]?.toFixed(4) ?? '',
          w[2]?.toFixed(4) ?? '',
          w[3]?.toFixed(4) ?? '',
          clip.groundTruth?.heartRate ?? '',
          clip.groundTruth?.source ?? '',
          clip.groundTruth?.datasetName ?? '',
          clip.groundTruth?.datasetSubjectId ?? '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="motionpulse-clips.csv"',
    },
  })
})

// Everything one person has: account, profile, consents, sessions, clips.
// Path ends with .json for a friendly download name; strip it for the lookup.
app.get('/api/admin/export/users/:id', async (c) => {
  const id = c.req.param('id').replace(/\.json$/, '')
  const user = await prisma.account.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      profile: true,
      scanSessions: {
        orderBy: { createdAt: 'asc' },
        include: {
          clips: { orderBy: { index: 'asc' }, include: { groundTruth: true } },
        },
      },
    },
  })
  if (!user) return c.json({ error: 'User not found.' }, 404)
  return new Response(JSON.stringify(user, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="motionpulse-user-${user.id}.json"`,
    },
  })
})
