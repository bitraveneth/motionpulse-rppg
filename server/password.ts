import crypto from 'node:crypto'

/** scrypt via node:crypto — standard library KDF, per-user random salt. */
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64
const SALT_LEN = 16

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN)
  const key = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltHex, keyHex] = parts
  const salt = Buffer.from(saltHex!, 'hex')
  const expected = Buffer.from(keyHex!, 'hex')
  let actual: Buffer
  try {
    actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
  } catch {
    return false
  }
  return (
    actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  )
}

/** Random human-typable password for seeded / admin-created accounts. */
export function randomPassword(length = 14): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}
