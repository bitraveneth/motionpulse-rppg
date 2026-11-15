import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const VIDEO_EXT = new Set(['.avi', '.mp4', '.mov', '.webm', '.m4v'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg'])
const BROAD_FOLDERS = new Set(['/', '/Users', '/private', '/tmp', '/opt', '/System', '/Volumes'])
const WALK_LIMIT = 80_000
const MAX_CLIPS = 80
const MAX_SAMPLED_FRAMES = 900

export type FolderReport = {
  ok: boolean
  resolved?: string
  reason?: string
  videoCount?: number
  frameCount?: number
  jsonFiles?: number
  zipCount?: number
  subjectFolders?: string[]
  groundTruthFiles?: number
  sampleVideos?: string[]
  sampleZips?: string[]
  /** Mean of row 2 when that row averages between 40 and 180 BPM. */
  labelBpm?: { folder: string; bpm: number }[]
  labelUnchecked?: number
  clips?: DatasetClip[]
  truncated?: boolean
}

export type DatasetClip = {
  kind: 'video' | 'frames'
  file: string
  path: string
  folder: string
  referenceBpm: number | null
  /** Sampled stills after a PURE image folder is reduced to about 15 fps. */
  frameCount?: number
  /** Original image rate, used to pick every nth frame. */
  sourceFps?: number
}

/** A video file on this Mac, not a whole disk or the home folder itself. */
export function resolveDatasetVideo(input: string): string | null {
  const resolved = resolve(input.trim())
  const home = process.env.HOME
  if (BROAD_FOLDERS.has(resolved) || (home && resolved === home)) return null
  let info
  try {
    info = statSync(resolved)
  } catch {
    return null
  }
  if (!info.isFile()) return null
  if (!VIDEO_EXT.has(extname(resolved).toLowerCase())) return null
  return resolved
}

function folderOrder(a: string, b: string): number {
  const na = /^subject(\d+)/i.exec(a)
  const nb = /^subject(\d+)/i.exec(b)
  if (na && nb && na[1] !== nb[1]) return Number(na[1]) - Number(nb[1])
  return a.localeCompare(b)
}

/** UBFC row 2 is the heart-rate series. Other layouts are left unread. */
export function referenceBpmFromGroundTruth(text: string): number | null {
  const rows: number[][] = []
  for (const raw of text.split(/\r?\n/)) {
    const nums: number[] = []
    for (const part of raw.replaceAll(',', ' ').split(/\s+/)) {
      if (!part) continue
      const value = Number(part)
      if (Number.isFinite(value)) nums.push(value)
    }
    if (nums.length > 0) rows.push(nums)
  }
  const series = rows[1]
  if (!series || series.length === 0) return null
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length
  if (mean < 40 || mean > 180) return null
  return Math.round(mean * 10) / 10
}

function meanBpm(values: number[]): number | null {
  const rates = values.filter((value) => value >= 40 && value <= 180)
  if (rates.length === 0) return null
  const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length
  return Math.round(mean * 10) / 10
}

/** PURE JSON: mean of Value.pulseRate, or a top-level pulseRate array. Waveform samples are not heart rate. */
export function referenceBpmFromPureJson(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const root = value as Record<string, unknown>
  const pack = root['/FullPackage'] ?? root.FullPackage
  const fromPack: number[] = []
  if (Array.isArray(pack)) {
    for (const item of pack) {
      if (!item || typeof item !== 'object') continue
      const raw = (item as { Value?: unknown; value?: unknown }).Value ?? (item as { value?: unknown }).value
      if (!raw || typeof raw !== 'object') continue
      const rate = (raw as { pulseRate?: unknown; PulseRate?: unknown }).pulseRate ?? (raw as { PulseRate?: unknown }).PulseRate
      if (typeof rate === 'number' && Number.isFinite(rate)) fromPack.push(rate)
    }
  }
  if (fromPack.length > 0) return meanBpm(fromPack)
  for (const key of ['pulseRate', 'PulseRate', 'heartRate', 'hr']) {
    const series = root[key]
    if (!Array.isArray(series)) continue
    const rates = series.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    const mean = meanBpm(rates)
    if (mean != null) return mean
  }
  return null
}

/** Frame rate from PURE /Image timestamps. Nanoseconds, microseconds, or milliseconds. */
export function fpsFromPureJson(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const image = (value as { '/Image'?: { Timestamp?: unknown } })['/Image']
  const stamps = image?.Timestamp
  if (!Array.isArray(stamps) || stamps.length < 2) return null
  const deltas: number[] = []
  const limit = Math.min(stamps.length, 40)
  for (let i = 1; i < limit; i += 1) {
    const a = stamps[i - 1]
    const b = stamps[i]
    if (typeof a === 'number' && typeof b === 'number' && b > a) deltas.push(b - a)
  }
  if (deltas.length === 0) return null
  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]!
  let seconds = median
  if (median > 1e6) seconds = median / 1e9
  else if (median > 1e3) seconds = median / 1e6
  else if (median > 5) seconds = median / 1e3
  if (seconds <= 0) return null
  const fps = 1 / seconds
  if (fps < 5 || fps > 120) return null
  return Math.round(fps * 10) / 10
}

export function sampleFramePaths(files: string[], sourceFps: number): { files: string[]; fps: number } {
  const sorted = [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const rate = sourceFps > 0 ? sourceFps : 30
  let step = Math.max(1, Math.round(rate / 15))
  while (step > 1 && Math.ceil(sorted.length / step) < 16) step -= 1
  const sampled: string[] = []
  for (let i = 0; i < sorted.length && sampled.length < MAX_SAMPLED_FRAMES; i += step) {
    sampled.push(sorted[i]!)
  }
  return { files: sampled, fps: Math.round((rate / step) * 10) / 10 }
}

/** Image files in one session folder, sampled to about 15 fps. */
export function framesForDirectory(dir: string, sourceFps = 30): { files: string[]; fps: number } | null {
  const resolved = resolve(dir)
  if (BROAD_FOLDERS.has(resolved)) return null
  let info
  try {
    info = statSync(resolved)
  } catch {
    return null
  }
  if (!info.isDirectory()) return null
  let names: string[]
  try {
    names = readdirSync(resolved)
  } catch {
    return null
  }
  const files = names.flatMap((name) => {
    if (name.startsWith('.')) return []
    const ext = extname(name).toLowerCase()
    if (!IMAGE_EXT.has(ext)) return []
    return [join(resolved, name)]
  })
  if (files.length < 16) return null
  return sampleFramePaths(files, sourceFps)
}

type DirBucket = {
  rel: string
  videos: string[]
  images: string[]
}

function parentRel(rel: string): string {
  const slash = rel.lastIndexOf('/')
  return slash < 0 ? '.' : rel.slice(0, slash)
}

function lookupNumber(map: Map<string, number>, rel: string): number | null {
  if (map.has(rel)) return map.get(rel) ?? null
  const parent = parentRel(rel)
  if (map.has(parent)) return map.get(parent) ?? null
  return null
}

/** Videos, or PURE-style image folders with a JSON heart rate. Does not open zip files. */
export function inspectDatasetFolder(input: string): FolderReport {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  const resolved = resolve(process.cwd(), trimmed)
  const home = process.env.HOME
  if (BROAD_FOLDERS.has(resolved) || (home && resolved === home)) {
    return { ok: false, resolved, reason: 'too_broad' }
  }
  if (!existsSync(resolved)) return { ok: false, resolved, reason: 'missing' }
  let rootStat
  try {
    rootStat = statSync(resolved)
  } catch {
    return { ok: false, resolved, reason: 'missing' }
  }
  if (!rootStat.isDirectory()) return { ok: false, resolved, reason: 'not_a_folder' }

  const subjectFolders: string[] = []
  const sampleVideos: string[] = []
  const sampleZips: string[] = []
  let videoCount = 0
  let zipCount = 0
  let groundTruthFiles = 0
  let labelUnchecked = 0
  const labelBpm: { folder: string; bpm: number }[] = []
  const dirs = new Map<string, DirBucket>()
  const fpsByFolder = new Map<string, number>()
  let jsonFiles = 0
  let seen = 0
  const stack = [resolved]
  const bucket = (dir: string): DirBucket => {
    let found = dirs.get(dir)
    if (!found) {
      found = { rel: relative(resolved, dir) || '.', videos: [], images: [] }
      dirs.set(dir, found)
    }
    return found
  }
  while (stack.length && seen < WALK_LIMIT) {
    const dir = stack.pop()!
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      seen += 1
      const full = join(dir, name)
      let info
      try {
        info = statSync(full)
      } catch {
        continue
      }
      if (info.isDirectory()) {
        if (dir === resolved && subjectFolders.length < 200) subjectFolders.push(name)
        stack.push(full)
      } else {
        const lower = name.toLowerCase()
        const dot = lower.lastIndexOf('.')
        const ext = dot >= 0 ? lower.slice(dot) : ''
        const rel = relative(resolved, dir) || '.'
        if (VIDEO_EXT.has(ext)) {
          videoCount += 1
          bucket(dir).videos.push(full)
          if (sampleVideos.length < 8) sampleVideos.push(relative(resolved, full))
        } else if (IMAGE_EXT.has(ext)) {
          bucket(dir).images.push(full)
        } else if (ext === '.zip') {
          zipCount += 1
          if (sampleZips.length < 4) sampleZips.push(relative(resolved, full))
        } else if (lower === 'ground_truth.txt' || lower.endsWith('_gt.txt')) {
          groundTruthFiles += 1
          try {
            const bpm = referenceBpmFromGroundTruth(readFileSync(full, 'utf8'))
            if (bpm == null) labelUnchecked += 1
            else labelBpm.push({ folder: rel, bpm })
          } catch {
            labelUnchecked += 1
          }
        } else if (ext === '.json' && info.size <= 8_000_000) {
          try {
            const parsed = JSON.parse(readFileSync(full, 'utf8')) as unknown
            const bpm = referenceBpmFromPureJson(parsed)
            const fps = fpsFromPureJson(parsed)
            if (bpm != null || fps != null) {
              jsonFiles += 1
              groundTruthFiles += 1
              if (bpm == null) labelUnchecked += 1
              else labelBpm.push({ folder: rel, bpm })
              if (fps != null) fpsByFolder.set(rel, fps)
            }
          } catch {
            /* not a label */
          }
        }
      }
    }
  }
  subjectFolders.sort(folderOrder)
  labelBpm.sort((a, b) => folderOrder(a.folder, b.folder))
  const bpmByFolder = new Map(labelBpm.map((item) => [item.folder, item.bpm]))
  const clips: DatasetClip[] = []
  let frameCount = 0
  const orderedDirs = [...dirs.values()].sort((a, b) => folderOrder(a.rel, b.rel))
  for (const dir of orderedDirs) {
    if (clips.length >= MAX_CLIPS) break
    if (dir.videos.length > 0) {
      const videos = [...dir.videos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      for (const file of videos) {
        if (clips.length >= MAX_CLIPS) break
        clips.push({
          kind: 'video',
          file,
          path: relative(resolved, file),
          folder: dir.rel,
          referenceBpm: lookupNumber(bpmByFolder, dir.rel),
        })
      }
      continue
    }
    if (dir.images.length < 16) continue
    frameCount += 1
    const sourceFps = lookupNumber(fpsByFolder, dir.rel) ?? 30
    const sampled = sampleFramePaths(dir.images, sourceFps)
    clips.push({
      kind: 'frames',
      file: dir.rel === '.' ? resolved : join(resolved, dir.rel),
      path: dir.rel,
      folder: dir.rel,
      referenceBpm: lookupNumber(bpmByFolder, dir.rel),
      frameCount: sampled.files.length,
      sourceFps,
    })
  }
  return {
    ok: true,
    resolved,
    videoCount,
    frameCount,
    jsonFiles,
    zipCount,
    subjectFolders,
    groundTruthFiles,
    sampleVideos,
    sampleZips,
    labelBpm,
    labelUnchecked,
    clips,
    truncated: seen >= WALK_LIMIT,
  }
}

function subjectNotes(names: string[]): string[] {
  const marked = names.filter((name) => name.includes('×'))
  const numbers = names.flatMap((name) => {
    const match = /^subject(\d+)/i.exec(name)
    return match ? [Number(match[1])] : []
  })
  const lines: string[] = []
  if (marked.length > 0) lines.push(`Marked names: ${marked.join(', ')}`)
  if (numbers.length >= 10) {
    const present = new Set(numbers)
    const missing: number[] = []
    const highest = Math.max(...numbers)
    for (let n = 1; n <= highest; n += 1) {
      if (!present.has(n)) missing.push(n)
    }
    if (missing.length > 0) {
      lines.push(`No folder for ${missing.map((n) => `subject${n}`).join(', ')}`)
    }
  }
  return lines
}

/** Terminal lines for one dataset. Counts and labels only. No heart-rate estimate yet. */
export function datasetActivity(report: FolderReport): string[] {
  if (!report.ok) {
    if (report.reason === 'missing') return ['error  folder is not on this Mac']
    if (report.reason === 'not_a_folder') return ['error  that path is a file']
    if (report.reason === 'too_broad') return ['error  that path is too wide']
    if (report.reason === 'cancelled') return ['load  cancelled']
    return ['error  no folder']
  }
  const videos = report.videoCount ?? 0
  const frames = report.frameCount ?? 0
  const zips = report.zipCount ?? 0
  const truths = report.groundTruthFiles ?? 0
  const lines = [`load  ${report.resolved}`]
  lines.push(`videos  ${videos}`)
  lines.push(`frames  ${frames}`)
  lines.push(`json  ${report.jsonFiles ?? 0}`)
  lines.push(`ground_truth  ${truths}`)
  if (zips > 0) {
    lines.push(`zip  ${zips} left closed${report.sampleZips?.length ? `  ${report.sampleZips.join(' ')}` : ''}`)
  }
  const subjects = report.subjectFolders ?? []
  if (subjects.length > 0) {
    lines.push(`subjects  ${subjects.join(' ')}`)
    lines.push(...subjectNotes(subjects))
  } else {
    for (const video of report.sampleVideos ?? []) lines.push(`file  ${video}`)
  }
  if (videos === 0 && frames === 0 && zips > 0) lines.push('error  no videos until the zip is unpacked')
  else if (videos === 0 && frames === 0) lines.push('error  no videos or frame folders')
  if (report.truncated) lines.push('stop  80000 entries')
  const labels = report.labelBpm ?? []
  if (labels.length > 0) {
    const values = labels.map((item) => item.bpm)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const low = Math.min(...values)
    const high = Math.max(...values)
    lines.push(`labels  ${labels.length}  mean ${mean.toFixed(1)} BPM  ${low.toFixed(1)}–${high.toFixed(1)}`)
  }
  if ((report.labelUnchecked ?? 0) > 0) {
    lines.push(`skip  ${report.labelUnchecked} label file${report.labelUnchecked === 1 ? '' : 's'}  row 2 was not 40–180 BPM`)
  }
  const clipCount = report.clips?.length ?? 0
  if (clipCount > 0) lines.push(`ready  ${clipCount}  15 fps  window 8s`)
  else lines.push('ready  0')
  return lines
}
