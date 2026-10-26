/**
 * Seed: one admin (random password, printed once) + default site copy.
 * Re-running never overwrites admin edits to existing content keys.
 */
import { CONTENT_DEFAULTS } from '../src/lib/contentDefaults'
import { prisma } from './db'
import { hashPassword, randomPassword } from './password'

const email = (process.env.ADMIN_EMAIL ?? 'admin@motionpulse.local').toLowerCase()

async function main() {
  const existing = await prisma.account.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin already exists: ${email} (password unchanged)`)
  } else {
    const password = randomPassword(14)
    await prisma.account.create({
      data: {
        email,
        name: 'Admin',
        passwordHash: hashPassword(password),
        role: 'admin',
      },
    })
    console.log(`Seeded admin: ${email}`)
    console.log(`Admin password: ${password}`)
  }

  let inserted = 0
  for (const [key, text] of Object.entries(CONTENT_DEFAULTS)) {
    const result = await prisma.content.upsert({
      where: { key },
      update: {},
      create: { key, text, updatedBy: 'seed' },
    })
    if (result.updatedBy === 'seed') inserted += 1
  }
  console.log(`Content keys present (${inserted} new this run).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
