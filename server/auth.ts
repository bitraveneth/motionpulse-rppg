import crypto from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { prisma } from './db'

export const SESSION_COOKIE = 'mp_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type SessionAccount = {
  id: string
  email: string
  name: string | null
  role: string
}

function authSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short (need 16+ chars)')
  }
  return s
}

function signValue(value: string): string {
  return crypto.createHmac('sha256', authSecret()).update(value).digest('hex')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Cookie holds token + HMAC signature; DB holds only the token hash. */
function readSessionToken(c: Context): string | null {
  const raw = getCookie(c, SESSION_COOKIE)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const token = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(signValue(token), 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return token
}

export async function createAuthSession(
  c: Context,
  accountId: string,
): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.authSession.create({
    data: {
      tokenHash: hashToken(token),
      accountId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  setCookie(c, SESSION_COOKIE, `${token}.${signValue(token)}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.req.url.startsWith('https:'),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function destroyAuthSession(c: Context): Promise<void> {
  const token = readSessionToken(c)
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export async function currentAccount(
  c: Context,
): Promise<SessionAccount | null> {
  const token = readSessionToken(c)
  if (!token) return null
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  if (session.account.status !== 'active') return null
  const { id, email, name, role } = session.account
  return { id, email, name, role }
}
