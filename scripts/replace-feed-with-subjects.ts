/**
 * Drop every news-feed post, then publish the saved dataset subjects.
 * Videos stay on disk. Only the face still and the numbers are posted.
 *
 * Usage: npx tsx scripts/replace-feed-with-subjects.ts
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '../server/db'
import { publishSubjectOnFeed } from '../server/labFeed'

async function main() {
  const removed = await prisma.feedPost.deleteMany({})
  const subjects = await prisma.labSubject.findMany({
    include: { test: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  for (const row of subjects) {
    await publishSubjectOnFeed({
      id: row.id,
      createdAt: row.createdAt,
      subject: row.subject,
      bpm: row.bpm,
      referenceBpm: row.referenceBpm,
      durationSec: row.durationSec,
      respiratoryRate: row.respiratoryRate,
      risk: row.risk,
      conflict: row.conflict,
      thumb: row.thumb,
      detail: row.detail as Prisma.InputJsonValue,
      datasetName: row.test.name.replace(/ · (CHROM|POS)$/, ''),
      method: row.method,
    })
  }
  console.log(`Removed ${removed.count} feed posts. Published ${subjects.length} subject cards.`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Could not refresh the feed')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
