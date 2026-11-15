import type { Prisma } from '@prisma/client'
import { prisma } from './db'

type SubjectCard = {
  id: string
  createdAt: Date
  subject: string
  bpm: number
  referenceBpm: number | null
  durationSec: number
  respiratoryRate: number | null
  risk: string
  conflict: number
  thumb: string | null
  detail: Prisma.InputJsonValue
  datasetName: string
  method: string
}

/** One subject card on the public feed. The video is not copied. */
export async function publishSubjectOnFeed(row: SubjectCard): Promise<void> {
  const data = {
    nickname: row.subject.slice(0, 40),
    bpm: row.bpm,
    conflictScore: row.conflict,
    riskLevel: row.risk,
    respiratoryRate: row.respiratoryRate,
    durationSec: row.durationSec,
    source: 'dataset',
    thumb: row.thumb,
    hasVideo: false,
    datasetName: row.datasetName.slice(0, 80),
    referenceBpm: row.referenceBpm,
    method: row.method === 'POS' ? 'POS' : 'CHROM',
    labSubjectId: row.id,
    detail: row.detail,
  }
  await prisma.feedPost.upsert({
    where: { labSubjectId: row.id },
    create: { ...data, createdAt: row.createdAt },
    update: data,
  })
}
