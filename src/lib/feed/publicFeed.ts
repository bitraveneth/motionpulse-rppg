import { MAX_FEED_VIDEO_BYTES } from './limits'

export type PublicFeedPost = {
  id: string
  createdAt: string
  nickname: string | null
  bpm: number
  conflictScore: number
  riskLevel: string
  respiratoryRate: number | null
  durationSec: number
  source: string
  thumb: string | null
  hasVideo: boolean
}

export type PublishInput = {
  nickname: string
  bpm: number
  conflictScore: number
  riskLevel: string
  respiratoryRate: number | null
  durationSec: number
  source: string
  thumb: string | null
  videoBlob: Blob | null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the recording'))
    reader.readAsDataURL(blob)
  })
}

async function postFeed(
  input: PublishInput,
  videoData: string | null,
): Promise<PublicFeedPost> {
  const res = await fetch('/api/feed', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nickname: input.nickname,
      bpm: input.bpm,
      conflictScore: input.conflictScore,
      riskLevel: input.riskLevel,
      respiratoryRate: input.respiratoryRate,
      durationSec: input.durationSec,
      source: input.source,
      thumb: input.thumb,
      videoData,
    }),
  })
  const json = (await res.json().catch(() => null)) as
    | { post?: PublicFeedPost; error?: string }
    | null
  if (!res.ok || !json?.post) {
    throw new Error(json?.error ?? `Could not post (${res.status})`)
  }
  return json.post
}

/**
 * Post one result to the public feed. A webcam clip that is small enough
 * goes up with its face video; an oversized file is posted as numbers only.
 */
export async function publishFeedPost(
  input: PublishInput,
): Promise<{ post: PublicFeedPost; droppedVideo: boolean }> {
  const blob = input.videoBlob
  const canAttach =
    blob != null && blob.size > 0 && blob.size <= MAX_FEED_VIDEO_BYTES
  if (blob && blob.size > MAX_FEED_VIDEO_BYTES) {
    const post = await postFeed(input, null)
    return { post, droppedVideo: true }
  }
  const videoData = canAttach && blob ? await blobToDataUrl(blob) : null
  const post = await postFeed(input, videoData)
  return { post, droppedVideo: false }
}

export async function listPublicFeed(): Promise<PublicFeedPost[]> {
  const res = await fetch('/api/feed', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Could not load the feed (${res.status})`)
  const json = (await res.json()) as { posts?: PublicFeedPost[] }
  return json.posts ?? []
}

export function feedVideoUrl(id: string): string {
  return `/api/feed/${id}/video`
}
